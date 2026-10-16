"use server";
import { revalidatePath } from "next/cache";
import { matchStudent } from "@/lib/domain/activity";
import {
  isReadableByAi, looksLikeBundle, maskIdentity, matchFileName, MATERIAL_MAX_BYTES, MATERIAL_TYPES, type EvidenceSource, type Material,
} from "@/lib/domain/program";
import type { Student } from "@/lib/domain/types";
import { aiEnabled } from "@/lib/server/ai/claude";
import { readMaterial } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "../../_lib/data";
import { pdfPages } from "../../_lib/pdf";
import { readUpload } from "@/lib/server/hwpx";

const paths = (id: string) => {
  revalidatePath(`/teacher/programs/${id}/materials`);
  revalidatePath(`/teacher/programs/${id}`);
};

async function targetsOf(targetIds: string[]): Promise<Student[]> {
  const set = new Set(targetIds);
  return (await repo.listStudents()).filter((s) => set.has(s.id));
}

/** 근거 자료 고르기: 설문 · 서류 · 둘 다 */
export async function setSource(form: FormData) {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const source = String(form.get("source")) as EvidenceSource;
  if (!["survey", "docs", "both"].includes(source)) return;
  await repo.updateProgram(program.id, { source });
  await repo.audit(v.accountId, "program.source", `${program.id} ${source}`);
  paths(program.id);
}

export type UploadState = { error?: string; done?: string; n?: number };

/**
 * 서류 올리기. 파일 이름의 학번·이름으로 학생을 자동 연결하고, 못 찾으면 "확인 필요"로 둔다.
 * 개별 업로드는 고른 학생으로, 합본 모드는 나누기 전 원본으로 저장한다.
 */
export async function uploadMaterials(prev: UploadState, form: FormData): Promise<UploadState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const n = (prev.n ?? 0) + 1;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "파일을 골라 주세요", n };
  if (files.length > 60) return { error: "한 번에 60개까지 올릴 수 있어요", n };
  const mode = String(form.get("mode") ?? "bulk");
  const targets = await targetsOf(program.targetIds);
  const chosen = String(form.get("studentId") ?? "");
  if (mode === "one" && !targets.some((s) => s.id === chosen)) return { error: "학생을 골라 주세요", n };

  const people = targets.map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const counts = { matched: 0, review: 0, bundle: 0, skipped: 0 };
  for (const f of files) {
    const up = f.size > MATERIAL_MAX_BYTES ? null : await readUpload(f);
    if (!up || typeof up === "string" || !(MATERIAL_TYPES as readonly string[]).includes(up.mime)) {
      counts.skipped++;
      continue;
    }
    const { bytes, mime } = up;
    const pages = mime === "application/pdf" ? await pdfPages(bytes) : mime.startsWith("image/") ? 1 : null;
    // TXT·HWPX 는 글을 바로 저장 (이름·학번은 가림)
    const text = up.text ? maskIdentity(up.text.slice(0, 4000), people) : null;
    let studentId: string | null = null;
    let status: Material["status"] = "needs_review";
    let matchedBy: Material["matchedBy"] = null;
    if (mode === "bundle" || (mode === "bulk" && mime === "application/pdf" && looksLikeBundle(f.name, pages))) {
      status = "bundle";
    } else if (mode === "one") {
      studentId = chosen;
      status = "matched";
      matchedBy = "manual";
    } else {
      const m = matchFileName(f.name, targets);
      if (m) {
        studentId = m.studentId;
        status = "matched";
        matchedBy = m.by;
      }
    }
    await repo.addMaterial({ programId: program.id, studentId, fileName: f.name.slice(0, 120), mime, size: f.size, pages, status, matchedBy, text, uploaderId: v.accountId }, bytes);
    if (status === "bundle") counts.bundle++;
    else if (status === "matched") counts.matched++;
    else counts.review++;
  }
  await repo.audit(v.accountId, "material.upload", `${program.id} ${files.length - counts.skipped}개`);
  paths(program.id);
  const parts = [`자동 연결 ${counts.matched}`, counts.review && `확인 필요 ${counts.review}`, counts.bundle && `합본 ${counts.bundle}`, counts.skipped && `건너뜀 ${counts.skipped} (형식·크기 — HWP는 HWPX로 저장해 주세요)`].filter(Boolean);
  return { done: `${files.length}개 중 ${parts.join(" · ")}`, n };
}

/** 학생 지정 (확인 필요 파일) */
export async function assignMaterial(form: FormData) {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const m = await repo.getMaterial(String(form.get("materialId") ?? ""));
  const studentId = String(form.get("studentId") ?? "");
  if (!m || m.programId !== program.id || !program.targetIds.includes(studentId)) return;
  await repo.updateMaterial(m.id, { studentId, status: "matched", matchedBy: "manual" });
  const s = await repo.getStudent(studentId);
  await repo.audit(v.accountId, "material.assign", `${program.id} ${s?.pseudonymId ?? ""}`);
  paths(program.id);
}

export type ReadProposal = { materialId: string; fileName: string; studentId: string | null; hint: string | null; text: string | null };
export type ReadState = { error?: string; proposals?: ReadProposal[]; n?: number };

/**
 * AI로 서류 읽기 (T6): 표지 이름·학번으로 학생을 찾고 본문 글을 읽는다. 저장하지 않는다.
 * 이름은 학생 연결에만 쓰고, 글은 이름·학번을 가린 뒤 돌려준다 (docs/ai-features.md §2 예외).
 */
export async function readMaterialsAction(prev: ReadState, form: FormData): Promise<ReadState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const n = (prev.n ?? 0) + 1;
  if (!aiEnabled()) return { error: "AI가 꺼져 있어요. 학생을 직접 지정해 주세요", n };
  const targets = await targetsOf(program.targetIds);
  const people = targets.map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const list = (await repo.listMaterials(program.id))
    .filter((m) => isReadableByAi(m.mime) && (m.status === "needs_review" || (m.status === "matched" && !m.text)))
    .slice(0, 10);
  if (list.length === 0) return { error: "읽을 파일이 없어요 (확인 필요이거나 글을 아직 안 읽은 파일만 읽어요)", n };
  const proposals: ReadProposal[] = [];
  for (const m of list) {
    const bytes = await repo.getMaterialFile(m);
    if (!bytes) continue;
    const r = await readMaterial(bytes, m.mime);
    if (!r.ok) {
      proposals.push({ materialId: m.id, fileName: m.fileName, studentId: m.studentId, hint: r.error, text: null });
      continue;
    }
    const s = m.studentId ? targets.find((x) => x.id === m.studentId) ?? null : matchStudent(targets, { studentNo: r.data.studentNo, name: r.data.studentName });
    proposals.push({
      materialId: m.id, fileName: m.fileName, studentId: s?.id ?? null,
      hint: s ? null : "표지에서 대상 학생을 찾지 못했어요",
      text: r.data.text ? maskIdentity(r.data.text, people).slice(0, 2000) : null,
    });
  }
  await repo.audit(v.accountId, "material.ai.read", `${program.id} ${proposals.length}개`);
  return { proposals, n };
}

/** 확인 후 연결: 교사가 확인한 학생·글만 저장한다 */
export async function confirmReads(prev: ReadState, form: FormData): Promise<ReadState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const targets = await targetsOf(program.targetIds);
  const people = targets.map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const ids = form.getAll("materialId").map(String);
  let saved = 0;
  for (const id of ids) {
    const m = await repo.getMaterial(id);
    if (!m || m.programId !== program.id) continue;
    const sid = String(form.get(`student_${id}`) ?? "");
    const text = String(form.get(`text_${id}`) ?? "").trim();
    const ok = targets.some((s) => s.id === sid);
    await repo.updateMaterial(id, {
      ...(ok ? { studentId: sid, status: "matched" as const, matchedBy: m.matchedBy && m.studentId === sid ? m.matchedBy : ("ai" as const) } : {}),
      ...(text ? { text: maskIdentity(text, people).slice(0, 4000) } : {}),
    });
    saved++;
  }
  await repo.audit(v.accountId, "material.ai.confirm", `${program.id} ${saved}개`);
  paths(program.id);
  return { n: (prev.n ?? 0) + 1 };
}

/** 미제출 사유 (빈 값이면 지운다) */
export async function setMissing(form: FormData) {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const studentId = String(form.get("studentId") ?? "");
  if (!program.targetIds.includes(studentId)) return;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 100);
  await repo.setMissingReason(program.id, studentId, reason, v.accountId);
  const s = await repo.getStudent(studentId);
  await repo.audit(v.accountId, "material.missing", `${program.id} ${s?.pseudonymId ?? ""}`);
  paths(program.id);
}
