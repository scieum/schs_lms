"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { today } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { effectiveStatus, maskIdentity, PROGRAM_MEMO_MAX, programMemoScope, responseDigest, usesDocs, usesMemos, usesSurvey, type ReviewStatus } from "@/lib/domain/program";
import { measure, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
import { analyzeResponses, reminderMessage } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram } from "../_lib/data";
import { makeStudentNo } from "@/lib/domain/roster";
import { kstToday, noticeLine } from "@/lib/domain/retention";
import { programRetention } from "@/lib/server/retention-sweep";
import { programMemo } from "@/lib/server/program-memo";

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
  if (program.source === "external") return { error: "외부 글 프로그램은 AI로 초안을 만들지 않아요 · 외부 글 넣기로 넣어 주세요", n: (prev.n ?? 0) + 1 };
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

/** 실패한 초안 다시 만들기 (Figma N16 '실패 k건 다시 만들기'): 이 프로그램의 생성 실패만 */
export async function retryFailedDrafts(prev: GenState, form: FormData): Promise<GenState> {
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""), "draft.review");
  if (program.source === "external") return { error: "외부 글 프로그램은 AI로 초안을 만들지 않아요", n: (prev.n ?? 0) + 1 };
  const { rows } = await programRows(program);
  const ids = rows.filter((r) => r.job?.state === "ERROR").map((r) => r.job!.id);
  if (!ids.length) return { error: "다시 만들 초안이 없어요", n: (prev.n ?? 0) + 1 };
  for (const id of ids) await resetDraftJob(id);
  await repo.audit(v.accountId, "draft.retry", `${program.id} ${ids.length}건`);
  if (aiEnabled()) after(() => runDraftJobs(ids));
  else await runDraftJobs(ids);
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/drafts");
  return { started: `${ids.length}건을 다시 만들고 있어요`, n: (prev.n ?? 0) + 1 };
}

export type StudentDetail = {
  /** 설문을 쓰지 않는 프로그램이면 null */
  survey: boolean | null;
  /** 서류를 쓰지 않는 프로그램이면 null */
  docs: number | null;
  review: ReviewStatus;
  answers: { title: string; text: string }[];
  materials: { id: string; fileName: string }[];
  /** 서류가 지워지는 날 (N39): 이미 지웠으면 purgedOn */
  retention: { line: string; soon: boolean; purgedOn: string | null } | null;
  draft: { content: string; length: number; max: number; unit: LengthUnit } | null;
  jobId: string | null;
  /** 교사 관찰 메모 (N41) · 메모를 근거로 쓰는지 · 다시 쓸 수 있는지(발행됨) · 같은 메모를 넣을 다른 대상 학생 */
  memo: { content: string; at: string } | null;
  usesMemo: boolean;
  canRewrite: boolean;
  others: { id: string; name: string }[];
  canRemind: boolean;
  /** N46 외부 글 직접 넣기: 외부 글 프로그램인가 · 초안 출처 · 넣기 칸에 쓸 분량·검사 정보 · 학번(실명 검사용) */
  external: boolean;
  origin: { origin: "external" | "ai" | "manual"; note: string | null } | null;
  entry: { area: DraftCategory; unit: LengthUnit; max: number; studentNo: string; versions: number };
};

/**
 * 학생 활동 팝업 (Figma N24): 학생별 현황 행을 누르면 그 학생 것만 불러온다.
 * 권한은 상세 화면과 같다 (requireProgram). 학생 id 는 POST 본문으로만 받는다 (URL 에 학번·이름 금지, C3).
 */
export async function studentDetail(programId: string, studentId: string): Promise<StudentDetail | null> {
  const { program } = await requireProgram(String(programId ?? ""));
  if (typeof studentId !== "string" || !program.targetIds.includes(studentId)) return null;
  const { rows } = await programRows(program);
  const r = rows.find((x) => x.student.id === studentId);
  if (!r) return null;
  const submitted = !!r.response?.submittedAt;
  const answers = submitted
    ? program.questions.map((q) => ({ title: q.title, text: (r.response!.answers[q.id] ?? "").trim() })).filter((a) => a.text)
    : [];
  const unit = r.job?.unit ?? program.unit;
  // 메모를 쓰지 않던 프로그램이어도 적어 둔 메모는 보여 준다
  const memoNow = r.memo ?? (await programMemo(program.id, studentId));
  return {
    survey: usesSurvey(program.source) ? submitted : null,
    docs: usesDocs(program.source) ? r.materials.length : null,
    review: r.review,
    answers,
    materials: r.materials.map((m) => ({ id: m.id, fileName: m.fileName })),
    retention: await retentionOf(program, r.materials),
    draft: r.job && r.latest ? { content: r.latest.content, length: measure(r.latest.content, unit), max: r.job.max || program.max, unit } : null,
    jobId: r.job?.id ?? null,
    memo: memoNow ? { content: memoNow.content, at: memoNow.createdAt } : null,
    usesMemo: usesMemos(program),
    canRewrite: program.status !== "draft",
    others: rows.filter((x) => x.student.id !== studentId).map((x) => ({ id: x.student.id, name: x.student.name })),
    canRemind: program.source !== "external" && effectiveStatus(program, today()) === "open" && !r.hasEvidence && !r.missingReason,
    external: program.source === "external",
    origin: r.origin,
    entry: { area: program.area, unit, max: r.job?.max || program.max, studentNo: r.student.studentNo, versions: r.job ? (await repo.listDraftVersions({ jobIds: [r.job.id] })).length : 0 },
  };
}

/** 학생 팝업 서류 칩 아래 한 줄 (N39) */
async function retentionOf(program: { id: string; endDate: string }, mats: { purgedAt?: string | null }[]): Promise<StudentDetail["retention"]> {
  if (!mats.length) return null;
  if (mats.every((m) => m.purgedAt)) {
    const on = mats.reduce((d, m) => (m.purgedAt! > d ? m.purgedAt! : d), "").slice(0, 10);
    return { line: `원본은 ${on}에 지웠어요 · 읽은 글로 만든 초안은 그대로`, soon: false, purgedOn: on };
  }
  const { rawDue } = await programRetention(program);
  const n = noticeLine(rawDue, kstToday());
  return { line: n.soon ? `서류 원본은 ${n.title.replace("이 자료는 ", "")}` : `서류 원본은 ${rawDue}에 지워져요`, soon: n.soon, purgedOn: null };
}

// ---------- 교사 메모 (Figma N41) ----------

export type MemoSaveResult = { ok: true; saved: number; at: string; turnedOn: boolean } | { ok: false; error: string };

/**
 * 이 학생 관찰 메모 저장 (프로그램 × 학생, 추가만 — 최신 한 건이 지금 메모). 같은 메모를 여러 학생에게 한 번에 넣을 수 있다(대상 학생만, 최대 40명).
 * 메모를 근거로 쓰지 않던 프로그램이면 근거에 "교사 메모"를 더한다. 감사 기록은 학생 수만 (글 · 이름 없음).
 */
export async function saveProgramMemo(input: { programId: string; studentIds: string[]; content: string }): Promise<MemoSaveResult> {
  const { v, program } = await requireProgram(String(input?.programId ?? ""), "draft.review");
  const ids = [...new Set((Array.isArray(input?.studentIds) ? input.studentIds : []).map(String))].filter((id) => program.targetIds.includes(id));
  if (!ids.length) return { ok: false, error: "이 프로그램 대상 학생만 적을 수 있어요" };
  if (ids.length > 40) return { ok: false, error: "한 번에 40명까지 넣을 수 있어요" };
  const content = String(input?.content ?? "").replace(/\r\n/g, "\n").trim();
  if (content.length > PROGRAM_MEMO_MAX) return { ok: false, error: `메모는 ${PROGRAM_MEMO_MAX.toLocaleString()}자까지예요` };
  for (const id of ids) await repo.addRecordMemo({ scope: programMemoScope(program.id), studentId: id, authorId: v.accountId, content });
  const turnedOn = !!content && !usesMemos(program);
  if (turnedOn) await repo.updateProgram(program.id, { useMemos: true });
  await repo.audit(v.accountId, "program.memo", `${program.id} ${ids.length}명${content ? "" : " 지움"}${turnedOn ? " 근거+메모" : ""}`);
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/drafts");
  return { ok: true, saved: ids.length, at: new Date().toISOString(), turnedOn };
}

export type MemoRewriteResult = { ok: true; done: string; running: boolean } | { ok: false; error: string };

/** 메모 반영해 다시 쓰기: 이 학생 초안을 처음부터 다시 만든다 (앞 버전은 그대로 남는다). 초안 작업이 없으면 만든다 */
export async function rewriteWithMemo(input: { programId: string; studentId: string }): Promise<MemoRewriteResult> {
  const { v, program } = await requireProgram(String(input?.programId ?? ""), "draft.review");
  const studentId = String(input?.studentId ?? "");
  if (!program.targetIds.includes(studentId)) return { ok: false, error: "이 프로그램 대상 학생이 아니에요" };
  if (program.status === "draft") return { ok: false, error: "먼저 발행해 주세요" };
  if (program.source === "external") return { ok: false, error: "외부 글 프로그램은 AI로 다시 쓰지 않아요" };
  if (!usesMemos(program)) return { ok: false, error: "메모를 먼저 저장해 주세요" };
  const [job] = await repo.ensureDraftJobs(program.id, [studentId], { unit: program.unit, max: program.max });
  if (!job) return { ok: false, error: "초안 작업을 만들지 못했어요" };
  await resetDraftJob(job.id);
  await repo.audit(v.accountId, "draft.regenerate_memo", `${program.id} 1명`);
  revalidatePath(`/teacher/programs/${program.id}`);
  revalidatePath("/teacher/drafts");
  if (aiEnabled()) {
    after(() => runDraftJobs([job.id]));
    return { ok: true, done: "메모를 반영해 다시 쓰는 중이에요. 잠시 뒤 새로고침해 주세요", running: true };
  }
  const r = await runDraftJobs([job.id]);
  return r.done ? { ok: true, done: "메모를 반영해 예시 초안을 다시 썼어요", running: false } : { ok: false, error: "다시 쓰지 못했어요 (근거 자료를 확인해 주세요)" };
}
