"use server";
import { revalidatePath } from "next/cache";
import { listLines, matchRoster } from "@/lib/domain/class-roster";
import { lockReasons, planTargets, rosterAuditLine, type LockReason, type RosterMode } from "@/lib/domain/program-roster";
import type { Program } from "@/lib/domain/program";
import { makeStudentNo } from "@/lib/domain/roster";
import { readTemplateFile } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "../_lib/data";

// 프로그램 명단 업로드 (Figma N36): 명단_양식.xlsx 만 읽어 등록된 학생과 맞춘 뒤, 교사가 "더하기/바꾸기"를 골라 저장한다.
// 바꾸기에서도 응답·서류·초안·미제출 사유가 있는 학생은 대상에서 빼지 않는다. 학생 기록은 어떤 경우에도 지우지 않는다.
// 권한: requireProgram (담당·공동 담당·관리자). 감사 로그에는 숫자만.

type Person = { id: string; label: string };
type Side = { added: number; already: number; removed: number; kept: (Person & { why: LockReason[] })[]; total: number };

export type ProgramRosterPreview = {
  error?: string;
  fileName?: string;
  /** 읽은 학생 줄 수 */
  lines?: number;
  matched?: Person[];
  unmatched?: { line: number | null; text: string }[];
  duplicates?: number;
  current?: number;
  add?: Side;
  replace?: Side;
  n?: number;
};

/** 대상에서 빼지 못하는 학생 (응답·서류·초안·사유) */
async function locks(p: Program): Promise<Map<string, LockReason[]>> {
  const [responses, materials, jobs, reasons] = await Promise.all([
    repo.listResponses(p.id),
    repo.listMaterials(p.id),
    repo.listDraftJobs({ programIds: [p.id] }),
    repo.listMissingReasons(p.id),
  ]);
  return lockReasons({
    responded: responses.map((r) => r.studentId),
    materials: materials.flatMap((m) => (m.studentId ? [m.studentId] : [])),
    drafts: jobs.map((j) => j.studentId),
    reasons: Object.keys(reasons),
  });
}

const label = (s: { grade: number; classNo: number; number: number; name: string }) => `${makeStudentNo(s.grade, s.classNo, s.number)} ${s.name}`;

/** 명단 읽기 · 두 방식 결과 미리 보기 (저장하지 않음) */
export async function previewProgramRoster(prev: ProgramRosterPreview, form: FormData): Promise<ProgramRosterPreview> {
  const n = (prev.n ?? 0) + 1;
  const { program } = await requireProgram(String(form.get("programId") ?? ""));
  const file = form.get("file");
  const fileName = file instanceof File ? file.name.slice(0, 80) : undefined;
  const f = await readTemplateFile(file, "list");
  if ("error" in f) return { error: f.error, fileName, n };
  const lines = listLines(f.body);
  if (!lines.length) return { error: "학생 줄이 없어요. 2행부터 학번이나 학년·반·번호를 적어 주세요", fileName, n };
  const [students, locked] = await Promise.all([repo.listStudents(), locks(program)]);
  const r = matchRoster(lines, students);
  const ids = r.matched.map((s) => s.id);
  const byId = new Map(students.map((s) => [s.id, s]));
  const side = (mode: RosterMode): Side => {
    const plan = planTargets({ current: program.targetIds, matched: ids, mode, locked: (id) => locked.has(id) });
    return {
      added: plan.added.length, already: plan.already, removed: plan.removed.length, total: plan.next.length,
      kept: plan.kept.flatMap((id) => {
        const s = byId.get(id);
        return s ? [{ id, label: label(s), why: locked.get(id) ?? [] }] : [];
      }),
    };
  };
  return {
    fileName, n, lines: lines.length, duplicates: r.duplicates, current: program.targetIds.length,
    matched: r.matched.map((s) => ({ id: s.id, label: label(s) })),
    unmatched: r.unmatched.slice(0, 50).map((l) => ({
      line: l.line ?? null,
      text: [l.studentNo ?? (l.grade && l.classNo && l.number ? `${l.grade}학년 ${l.classNo}반 ${l.number}번` : null), l.name].filter(Boolean).join(" ") || l.raw.slice(0, 20),
    })),
    add: side("add"),
    replace: side("replace"),
  };
}

export type ProgramRosterSave = { error?: string; done?: string; n?: number };

/** 고른 방식으로 대상 저장. 찾은 학생 id 는 서버에서 다시 확인하고, 잠김도 다시 계산한다 */
export async function applyProgramRoster(prev: ProgramRosterSave, form: FormData): Promise<ProgramRosterSave> {
  const n = (prev.n ?? 0) + 1;
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const mode: RosterMode = form.get("mode") === "replace" ? "replace" : "add";
  const known = new Set((await repo.listStudents()).map((s) => s.id));
  const ids = [...new Set(form.getAll("studentId").map(String))].filter((id) => known.has(id));
  if (!ids.length) return { error: "명단에서 찾은 학생이 없어요", n };
  const locked = await locks(program);
  const plan = planTargets({ current: program.targetIds, matched: ids, mode, locked: (id) => locked.has(id) });
  if (program.status !== "draft" && plan.next.length === 0) return { error: "발행한 프로그램은 대상이 한 명은 있어야 해요", n };
  if (!plan.added.length && !plan.removed.length) return { done: "바뀐 학생이 없어요 · 이미 이 명단 그대로예요", n };
  try {
    await repo.updateProgram(program.id, { targetIds: plan.next });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요", n };
  }
  await repo.audit(v.accountId, "program.roster", rosterAuditLine(program.id, mode, plan));
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/programs");
  revalidatePath("/teacher/drafts");
  const done = mode === "add"
    ? `대상에 ${plan.added.length}명을 더했어요 · 대상 ${plan.next.length}명`
    : `명단으로 바꿨어요 · 더함 ${plan.added.length} · 뺌 ${plan.removed.length}${plan.kept.length ? ` · 남김 ${plan.kept.length}` : ""} · 대상 ${plan.next.length}명`;
  return { done, n };
}
