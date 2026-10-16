"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { today } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { effectiveStatus, maskIdentity, responseDigest } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { runDraftJobs } from "@/lib/server/ai/draft";
import { analyzeResponses, reminderMessage } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram } from "../_lib/data";
import { makeStudentNo } from "@/lib/domain/roster";

export type RemindDraft = { text?: string; label?: "AI" | "자동"; error?: string; sent?: string; n?: number };

/** 미응답 독촉 문구 초안 (저장하지 않음) */
export async function draftReminder(prev: RemindDraft, form: FormData): Promise<RemindDraft> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const { rows } = await programRows(program);
  const missing = rows.filter((r) => !r.hasEvidence && !r.missingReason).length;
  const r = await reminderMessage(program, missing);
  await repo.audit(v.accountId, "program.ai.reminder", `${program.id} ${r.label}`);
  return { text: r.text, label: r.label, error: r.error, n: (prev.n ?? 0) + 1 };
}

/** 확인 후 보내기: 학생 앱 알림 기록으로 저장한다 (실제 문자·메신저 발송은 없음) */
export async function sendReminder(prev: RemindDraft, form: FormData): Promise<RemindDraft> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const message = String(form.get("message") ?? "").trim().slice(0, 300);
  if (!message) return { ...prev, error: "보낼 문구를 써 주세요" };
  const { rows } = await programRows(program);
  const only = String(form.get("studentId") ?? "");
  const ids = rows.filter((r) => !r.hasEvidence && !r.missingReason && (!only || r.student.id === only)).map((r) => r.student.id);
  if (ids.length === 0) return { ...prev, error: "알림을 보낼 미응답 학생이 없어요" };
  await repo.addReminder({ programId: program.id, studentIds: ids, message, senderId: v.accountId });
  await repo.audit(v.accountId, "program.remind", `${program.id} ${ids.length}명`);
  revalidatePath(`/teacher/programs/${program.id}`);
  return { sent: `${ids.length}명에게 알림을 남겼어요`, n: (prev.n ?? 0) + 1 };
}

/** 한 학생에게 바로 알림 (표의 "알림" 버튼) */
export async function remindOne(form: FormData) {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const studentId = String(form.get("studentId") ?? "");
  if (!program.targetIds.includes(studentId)) return;
  const r = await reminderMessage(program, 1);
  await repo.addReminder({ programId: program.id, studentIds: [studentId], message: r.text, senderId: v.accountId });
  const s = await repo.getStudent(studentId);
  await repo.audit(v.accountId, "program.remind", `${program.id} ${s?.pseudonymId ?? ""}`);
  revalidatePath(`/teacher/programs/${program.id}`);
}

/** 발행 · 마감 */
export async function setProgramStatus(form: FormData) {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const to = String(form.get("to"));
  if (to !== "open" && to !== "closed") return;
  if (to === "open" && program.targetIds.length === 0) return;
  await repo.updateProgram(program.id, { status: to });
  await repo.audit(v.accountId, to === "open" ? "program.publish" : "program.close", program.id);
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/programs");
}

export type DeleteState = { error?: string; n?: number };

/**
 * 프로그램 삭제: 만든 교사(공동 담당 제외)와 관리자만.
 * 확정된 초안이 있으면 지우지 않는다 — 확정본은 추가만 하고 지우지 않는다 (C4). 그때는 마감으로 둔다.
 */
export async function deleteProgram(prev: DeleteState, form: FormData): Promise<DeleteState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const n = (prev.n ?? 0) + 1;
  if (v.kind !== "teacher" || (program.ownerId !== v.accountId && !isAdmin(v))) return { error: "만든 선생님이나 관리자만 지울 수 있어요", n };
  if (String(form.get("confirm") ?? "").trim() !== program.title) return { error: "프로그램 이름을 똑같이 써 주세요", n };
  const finalized = (await repo.listDraftVersions({ programIds: [program.id] })).some((x) => x.status === "finalized");
  if (finalized) return { error: "확정된 초안이 있어 지울 수 없어요. 마감으로 두면 학생 화면에서 닫혀요", n };
  await repo.deleteProgram(program.id);
  await repo.audit(v.accountId, "program.delete", `${program.id} ${program.title}`);
  revalidatePath("/teacher/programs");
  revalidatePath("/teacher");
  redirect("/teacher/programs");
}

export type GenState = { error?: string; started?: string; n?: number };

/**
 * 초안 만들기 (일괄): 근거가 있고 아직 초안이 없는 학생을 PENDING 으로 올리고 생성한다.
 * AI 가 켜져 있으면 응답을 먼저 돌려주고 뒤에서(after) 만든다. 데모(예시 초안)는 바로 만든다.
 */
export async function generateDrafts(prev: GenState, form: FormData): Promise<GenState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""), "draft.review");
  if (program.status === "draft") return { error: "먼저 발행해 주세요", n: (prev.n ?? 0) + 1 };
  const { rows } = await programRows(program);
  const ready = rows.filter((r) => r.hasEvidence && (!r.job || r.job.state === "PENDING")).map((r) => r.student.id);
  if (ready.length === 0) return { error: "새로 만들 학생이 없어요 (근거가 있는 학생은 이미 초안이 있어요)", n: (prev.n ?? 0) + 1 };
  const jobs = await repo.ensureDraftJobs(program.id, ready, { unit: program.unit, max: program.max });
  const ids = jobs.filter((j) => j.state === "PENDING").map((j) => j.id);
  await repo.audit(v.accountId, "draft.generate", `${program.id} ${ids.length}명${effectiveStatus(program, today()) === "closed" ? " (마감 후)" : ""}`);
  if (aiEnabled()) {
    after(() => runDraftJobs(ids));
    revalidatePath(`/teacher/programs/${program.id}`);
    return { started: `${ids.length}명 초안을 만들기 시작했어요. 잠시 뒤 새로고침해 주세요`, n: (prev.n ?? 0) + 1 };
  }
  const r = await runDraftJobs(ids);
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/drafts");
  return { started: `예시 초안 ${r.done}건을 만들었어요${r.failed ? ` · 실패 ${r.failed}건` : ""}`, n: (prev.n ?? 0) + 1 };
}

export type AnalyzeState = {
  summary?: string | null;
  themes?: string[];
  highlights?: { who: string; note: string }[];
  thin?: { who: string; note: string }[];
  count?: number;
  label?: "AI" | "자동";
  error?: string;
  n?: number;
};

/**
 * T2 응답 분석: 제출된 설문 답을 가명ID로 묶어(이름·학번은 가림) 공통 주제·눈에 띄는 활동·근거 부족 학생을 요약한다.
 * 화면에만 보여 주고 저장하지 않는다. 가명ID → 이름은 서버에서 바꿔 돌려준다.
 */
export async function analyzeResponsesAction(prev: AnalyzeState, form: FormData): Promise<AnalyzeState> {
  const n = (prev.n ?? 0) + 1;
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""));
  const { rows } = await programRows(program);
  const people = rows.map((r) => ({ name: r.student.name, studentNo: r.student.studentNo }));
  const sub = rows.filter((r) => r.response?.submittedAt);
  if (sub.length === 0) return { error: "제출된 설문 응답이 아직 없어요", n };
  const students = sub.map((r) => ({
    pid: r.student.pseudonymId,
    answers: program.questions.map((q) => maskIdentity((r.response!.answers[q.id] ?? "").trim(), people).slice(0, 600)),
  }));
  const rule = responseDigest(students);
  const r = await analyzeResponses(program, students, rule);
  const byPid = new Map(rows.map((x) => [x.student.pseudonymId, x.student]));
  const who = (pid: string) => {
    const s = byPid.get(pid);
    return s ? `${makeStudentNo(s.grade, s.classNo, s.number)} ${s.name}` : pid;
  };
  await repo.audit(v.accountId, "program.ai.analyze", `${program.id} ${sub.length}명 ${r.label}`);
  return {
    summary: r.digest.summary,
    themes: r.digest.themes,
    highlights: r.digest.highlights.map((x) => ({ who: who(x.pid), note: x.note })),
    thin: r.digest.thin.map((x) => ({ who: who(x.pid), note: x.note })),
    count: sub.length,
    label: r.label,
    error: r.error,
    n,
  };
}
