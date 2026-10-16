"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { today } from "@/lib/domain/activity";
import { effectiveStatus } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { runDraftJobs } from "@/lib/server/ai/draft";
import { reminderMessage } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram } from "../_lib/data";

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
