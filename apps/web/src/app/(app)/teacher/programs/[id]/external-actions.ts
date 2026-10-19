"use server";
import { revalidatePath } from "next/cache";
import { measure } from "@/lib/domain/length";
import { latestVersion, type Program } from "@/lib/domain/program";
import {
  cleanExternalText, cleanNote, EXTERNAL_TEXT_MAX, externalAuditLine, planExternal, scanExternal, type ExistingDraft, type OverwriteMode,
} from "@/lib/domain/external-text";
import { makeStudentNo } from "@/lib/domain/roster";
import { readTemplateFile } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "../_lib/data";

// 외부 생기부 글 직접 넣기 (Figma N46). 기관·외부 강사가 보낸 완성된 글을 교사가 그대로 넣는다.
// - AI 를 부르지 않는다 (올린 글·붙여 넣은 글은 서버 밖으로 나가지 않음).
// - 언제나 새 버전 추가 (C4) · status "draft" — 자동 확정 없음. 확정은 초안 검토에서 교사가 한다.
// - source "external" · ai_original_id 없음 → N38 수정 비율·적게 고친 확정 확인이 붙지 않는다.
// - 감사 로그에는 숫자만 (글 · 이름 · 학번 없음).

const refresh = (programId: string) => {
  revalidatePath(`/teacher/programs/${programId}`);
  revalidatePath("/teacher/programs");
  revalidatePath("/teacher/drafts");
};

/** 학생 한 명에게 외부 글 한 버전 넣기 (초안 작업이 없으면 만들고, 끝난 작업으로 둔다) */
async function putExternal(program: Program, studentId: string, text: string, note: string | null, authorId: string) {
  const [job] = await repo.ensureDraftJobs(program.id, [studentId], { unit: program.unit, max: program.max });
  if (!job) throw new Error("초안 자리를 만들지 못했어요");
  if (job.state !== "DONE" || job.error) await repo.updateDraftJob(job.id, { state: "DONE", error: null });
  await repo.addDraftVersion({
    jobId: job.id, programId: program.id, studentId, content: text, status: "draft", reason: null,
    source: "external", authorId, originNote: note || null,
  });
  return job.id;
}

/** 이 프로그램 학생마다 지금 초안 상태 (가장 최신 버전) */
async function existingOf(programId: string): Promise<(studentId: string) => ExistingDraft> {
  const [jobs, versions] = await Promise.all([repo.listDraftJobs({ programIds: [programId] }), repo.listDraftVersions({ programIds: [programId] })]);
  const m = new Map<string, ExistingDraft>();
  for (const j of jobs) m.set(j.studentId, latestVersion(versions, j.id)?.status ?? "none");
  return (id) => m.get(id) ?? "none";
}

export type DirectResult = { ok: true; jobId: string } | { ok: false; error: string };

/** 직접 넣기 (초안 검토 편집 · 학생 팝업): 붙여 넣은 글 + 출처(선택) → 새 "직접 입력" 버전 */
export async function saveExternalDraft(input: { programId: string; studentId: string; text: string; note?: string }): Promise<DirectResult> {
  const { v, program } = await requireProgram(String(input?.programId ?? ""), "draft.review");
  const studentId = String(input?.studentId ?? "");
  if (!program.targetIds.includes(studentId)) return { ok: false, error: "이 프로그램 대상 학생이 아니에요" };
  const text = cleanExternalText(String(input?.text ?? ""));
  if (!text) return { ok: false, error: "넣을 글을 붙여 넣어 주세요" };
  if (text.length > EXTERNAL_TEXT_MAX) return { ok: false, error: `${EXTERNAL_TEXT_MAX.toLocaleString()}자까지 넣을 수 있어요` };
  const note = cleanNote(String(input?.note ?? ""));
  try {
    const jobId = await putExternal(program, studentId, text, note || null, v.accountId);
    await repo.audit(v.accountId, "draft.external", `${program.id} n=1 bytes=${measure(text, "bytes")} note=${note ? 1 : 0}`);
    refresh(program.id);
    return { ok: true, jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "넣지 못했어요" };
  }
}

// ---------- 엑셀로 한꺼번에 (외부글_양식.xlsx) ----------

export type ExternalFound = { studentId: string; line: number; target: boolean; existing: ExistingDraft; label: string; bytes: number };
export type ExternalPreview = {
  error?: string;
  fileName?: string;
  lines?: number;
  found?: ExternalFound[];
  unmatched?: { line: number | null; text: string }[];
  empty?: number[];
  duplicates?: number[];
  tooLong?: number[];
  n?: number;
};

async function scanFile(program: Program, file: FormDataEntryValue | null) {
  const f = await readTemplateFile(file, "external");
  if ("error" in f) return { error: f.error } as const;
  const [students, existing] = await Promise.all([repo.listStudents(), existingOf(program.id)]);
  const scan = scanExternal(f.body, students, { targetIds: program.targetIds, existing });
  return { scan, students } as const;
}

/** 엑셀 읽기 · 미리 보기 (저장하지 않음). 글은 화면에 돌려주지 않는다 (넣을 때 파일을 다시 읽음) */
export async function previewExternal(prev: ExternalPreview, form: FormData): Promise<ExternalPreview> {
  const n = (prev.n ?? 0) + 1;
  const { program } = await requireProgram(String(form.get("programId") ?? ""), "draft.review");
  const file = form.get("file");
  const fileName = file instanceof File ? file.name.slice(0, 80) : undefined;
  const r = await scanFile(program, file);
  if ("error" in r) return { error: r.error, fileName, n };
  const { scan, students } = r;
  if (!scan.lines) return { error: "학생 줄이 없어요. 양식을 받아 '생기부 글' 칸에 글을 붙여 넣어 주세요", fileName, n };
  const byId = new Map(students.map((s) => [s.id, s]));
  return {
    fileName, n, lines: scan.lines, unmatched: scan.unmatched.slice(0, 50), empty: scan.empty, duplicates: scan.duplicates, tooLong: scan.tooLong,
    found: scan.found.map((x) => {
      const s = byId.get(x.studentId)!;
      return { studentId: x.studentId, line: x.line, target: x.target, existing: x.existing, label: `${makeStudentNo(s.grade, s.classNo, s.number)} ${s.name}`, bytes: measure(x.text, "bytes") };
    }),
  };
}

export type ExternalSave = { error?: string; done?: string; n?: number };

/** 넣기: 파일을 다시 읽고(화면 값을 믿지 않음) 고른 방식으로 넣는다. 확정한 초안은 언제나 그대로 */
export async function applyExternal(prev: ExternalSave, form: FormData): Promise<ExternalSave> {
  const n = (prev.n ?? 0) + 1;
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""), "draft.review");
  const overwrite: OverwriteMode = form.get("overwrite") === "skip" ? "skip" : "overwrite";
  const addNonTargets = form.get("addNonTargets") === "on";
  const r = await scanFile(program, form.get("file"));
  if ("error" in r) return { error: r.error, n };
  const plan = planExternal(r.scan.found, { overwrite, addNonTargets });
  if (!plan.write.length) return { error: "넣을 학생이 없어요", n };
  try {
    if (plan.addTargets.length) await repo.updateProgram(program.id, { targetIds: [...program.targetIds, ...plan.addTargets] });
    for (const w of plan.write) await putExternal(program, w.studentId, w.text, null, v.accountId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "넣지 못했어요", n };
  }
  await repo.audit(v.accountId, "program.external_import", externalAuditLine(program.id, plan));
  refresh(program.id);
  const fresh = plan.write.filter((x) => x.mode === "new").length;
  const over = plan.write.length - fresh;
  const kept = plan.keptFinal.length + plan.skipped.length;
  return { done: `외부 글 ${plan.write.length}명을 넣었어요 · 새로 ${fresh}${over ? ` · 덮어쓰기 ${over}` : ""}${kept ? ` · 그대로 ${kept}` : ""}${plan.addTargets.length ? ` · 대상에 더함 ${plan.addTargets.length}` : ""}`, n };
}
