"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { matchStudent } from "@/lib/domain/activity";
import { rangeLabel, validateRanges, type PageRange } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { suggestSplit } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "../../_lib/data";
import { pdfPages, splitPdf } from "../../_lib/pdf";

async function loadBundle(programId: string, materialId: string) {
  const { v, program } = await requireProgram(programId);
  const m = await repo.getMaterial(materialId);
  if (!m || m.programId !== program.id || m.status !== "bundle" || m.mime !== "application/pdf") return null;
  const bytes = await repo.getMaterialFile(m);
  return bytes ? { v, program, m, bytes } : null;
}

export type SuggestSplitState = { ranges?: PageRange[]; note?: string; error?: string; n?: number };

/** AI 쪽 나누기 제안: 저장하지 않는다. 화면에서 고친 뒤 "확인 후 나누기" */
export async function suggestSplitAction(prev: SuggestSplitState, form: FormData): Promise<SuggestSplitState> {
  const n = (prev.n ?? 0) + 1;
  const b = await loadBundle(String(form.get("programId") ?? ""), String(form.get("materialId") ?? ""));
  if (!b) return { error: "합본 파일을 찾지 못했어요", n };
  if (!aiEnabled()) return { error: "AI가 꺼져 있어요. 빠른 나누기나 직접 구간을 넣어 주세요", n };
  const r = await suggestSplit(b.bytes);
  await repo.audit(b.v.accountId, "material.ai.split", `${b.program.id} ${r.ok ? r.data.length : "실패"}`);
  if (!r.ok) return { error: r.error, n };
  const set = new Set(b.program.targetIds);
  const targets = (await repo.listStudents()).filter((s) => set.has(s.id));
  const ranges = r.data.map((x) => ({ from: x.from, to: x.to, studentId: matchStudent(targets, { studentNo: x.studentNo, name: x.studentName })?.id ?? null }));
  const miss = ranges.filter((x) => !x.studentId).map(rangeLabel);
  return { ranges, note: miss.length ? `${miss.join(", ")}은 첫 쪽에서 이름을 찾지 못했어요. 학생을 직접 골라 주세요` : undefined, n };
}

export type SplitState = { error?: string };

/** 확인 후 나누기: 구간마다 학생 파일을 만들고 원본은 "나누기 완료"로 둔다 */
export async function splitAction(_: SplitState, form: FormData): Promise<SplitState> {
  const b = await loadBundle(String(form.get("programId") ?? ""), String(form.get("materialId") ?? ""));
  if (!b) return { error: "합본 파일을 찾지 못했어요" };
  let ranges: PageRange[];
  try {
    ranges = (JSON.parse(String(form.get("ranges") ?? "[]")) as PageRange[]).map((r) => ({ from: Number(r.from), to: Number(r.to), studentId: r.studentId ? String(r.studentId) : null }));
  } catch {
    return { error: "구간을 읽지 못했어요" };
  }
  const pages = (await pdfPages(b.bytes)) ?? 0;
  const err = validateRanges(ranges, pages);
  if (err) return { error: err };
  if (ranges.some((r) => !b.program.targetIds.includes(r.studentId!))) return { error: "대상 학생만 고를 수 있어요" };

  const parts = await splitPdf(b.bytes, ranges);
  const base = b.m.fileName.replace(/\.pdf$/i, "");
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    await repo.addMaterial({
      programId: b.program.id, studentId: r.studentId, fileName: `${base}_${r.from}-${r.to}쪽.pdf`, mime: "application/pdf", size: parts[i].length,
      pages: r.to - r.from + 1, status: "matched", matchedBy: "split", text: null, uploaderId: b.v.accountId,
    }, parts[i]);
  }
  await repo.updateMaterial(b.m.id, { status: "split_done" });
  await repo.audit(b.v.accountId, "material.split", `${b.program.id} ${ranges.length}개`);
  revalidatePath(`/teacher/programs/${b.program.id}`);
  revalidatePath(`/teacher/programs/${b.program.id}/materials`);
  redirect(`/teacher/programs/${b.program.id}/materials?mode=bundle`);
}
