"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { classScope } from "@/components/scores/scope";
import { absencePattern, addDays, cellStatus, DAY_LABEL, isAttend, seoulNow, weekDays, weekday, type AttendStatus, type Period } from "@/lib/domain/night";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type MarkResult = { ok: true } | { ok: false; error: string };

/** 오늘 출석 표시 (칸 하나 또는 '모두 출석'). 마감한 날은 못 바꾼다 */
export async function markAttendance(classKey: string, period: number, entries: { studentId: string; status: string }[]): Promise<MarkResult> {
  const v = await requireCan("night.manage");
  const scope = await classScope(v, classKey);
  if (!scope) return { ok: false, error: "담임 반이 없어요" };
  if (period !== 1 && period !== 2) return { ok: false, error: "교시를 골라 주세요" };
  if (!entries.length || entries.length > 60) return { ok: false, error: "바꿀 학생이 없어요" };
  const today = seoulNow().date;
  if (await repo.getNightClosure(scope.grade, scope.classNo, today)) return { ok: false, error: "오늘 출석은 이미 마감했어요" };
  const ids = new Set(scope.students.map((s) => s.id));
  const signups = await repo.listNightSignups(today, today, [...ids]);
  for (const e of entries) {
    if (!ids.has(e.studentId) || !isAttend(e.status)) return { ok: false, error: "바꿀 수 없는 학생이 있어요" };
    if (cellStatus(signups.find((s) => s.studentId === e.studentId), undefined, period as Period) === "미신청") return { ok: false, error: "신청하지 않은 교시예요" };
  }
  await repo.setNightAttendance(entries.map((e) => ({ studentId: e.studentId, date: today, period: period as Period, status: e.status as AttendStatus })), v.accountId);
  revalidatePath("/homeroom/night");
  return { ok: true };
}

export async function closeDay(form: FormData): Promise<void> {
  const v = await requireCan("night.manage");
  const scope = await classScope(v, String(form.get("class") ?? ""));
  if (!scope) return;
  const today = seoulNow().date;
  await repo.closeNightDay(scope.grade, scope.classNo, today, v.accountId);
  await repo.audit(v.accountId, "night.close", `${scope.key} ${today}`);
  revalidatePath("/homeroom/night");
}

/** 신청·변경 승인/반려 */
export async function decideRequest(form: FormData): Promise<void> {
  const v = await requireCan("night.manage");
  const scope = await classScope(v, String(form.get("class") ?? ""));
  if (!scope) return;
  const id = String(form.get("id") ?? "");
  const approve = form.get("decision") === "approve";
  const pending = await repo.listNightRequests(scope.students.map((s) => s.id), "대기");
  const req = pending.find((r) => r.id === id);
  if (!req) return; // 우리 반 요청이 아니거나 이미 처리됨
  await repo.decideNightRequest(id, approve, v.accountId);
  const pid = scope.students.find((s) => s.id === req.studentId)?.pseudonymId ?? "";
  await repo.audit(v.accountId, approve ? "night.request.approve" : "night.request.reject", `${pid} ${req.dates.join(",")}`);
  revalidatePath("/homeroom/night");
  revalidatePath("/student/night");
}

// ---------------------------------------------------------------- AI 출결 살펴보기

export type ReviewDraft = { studentId: string; pattern: string; message: string };
export type ReviewResult = { ok: true; summary: string; drafts: ReviewDraft[]; source: "AI" | "자동" } | { ok: false; error: string };

const AiOut = z.object({
  summary: z.string(),
  students: z.array(z.object({ id: z.string(), pattern: z.string(), message: z.string() })),
});

/** 최근 4주 출결에서 결석 패턴을 찾고 학생에게 보낼 확인 메시지 초안을 만든다. 가명ID·요일·상태만 보낸다 */
export async function reviewAttendance(classKey: string): Promise<ReviewResult> {
  const v = await requireCan("night.manage");
  const scope = await classScope(v, classKey);
  if (!scope) return { ok: false, error: "담임 반이 없어요" };
  const today = seoulNow().date;
  const days = weekDays(today);
  const from = addDays(days[0], -21);
  const ids = scope.students.map((s) => s.id);
  const att = await repo.listNightAttendance(from, today, ids);
  const week = absencePattern(att, days);
  const watch = new Set(week.students.map((s) => s.studentId));
  // 4주 동안 3번 이상 결석한 학생도 본다
  const total = new Map<string, number>();
  for (const a of att) if (a.status !== "출석") total.set(a.studentId, (total.get(a.studentId) ?? 0) + 1);
  for (const [id, n] of total) if (n >= 3) watch.add(id);
  if (!watch.size) return { ok: true, summary: week.text, drafts: [], source: "자동" };

  const byId = new Map(scope.students.map((s) => [s.id, s]));
  const fallback: ReviewDraft[] = [...watch].map((id) => {
    const mine = att.filter((a) => a.studentId === id && a.status !== "출석");
    const dayCount = new Map<number, number>();
    mine.forEach((a) => dayCount.set(weekday(a.date), (dayCount.get(weekday(a.date)) ?? 0) + 1));
    const peak = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      studentId: id,
      pattern: `4주 결석·조퇴 ${mine.length}회${peak && peak[1] >= 2 ? ` · ${DAY_LABEL[peak[0]]}요일 ${peak[1]}회` : ""}`,
      message: `최근 야자에 빠진 날이 ${mine.length}번 있었어요. 무슨 일이 있는지 담임 선생님과 잠깐 이야기 나눠요.`,
    };
  });

  if (!aiEnabled()) return { ok: true, summary: week.text, drafts: fallback, source: "자동" };
  const lines = [...watch].map((id) => {
    const recs = att.filter((a) => a.studentId === id).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
    return `${byId.get(id)?.pseudonymId}: ${recs.filter((a) => a.status !== "출석").map((a) => `${a.date.slice(5)}(${DAY_LABEL[weekday(a.date)]}) ${a.period}교시 ${a.status}`).join(", ")}`;
  });
  const res = await aiJson(AiOut, {
    model: "fast",
    system:
      "고등학교 담임교사를 돕는다. 야간 자율학습 4주 출결 기록(결석·조퇴만)을 보고 학생별 결석 패턴을 한 줄(30자 이내)로 정리하고, 학생에게 보낼 부드러운 확인 메시지 초안(80자 이내, 다정한 해요체, 꾸짖지 않기)을 쓴다. summary 는 반 전체 한 줄(50자 이내). 학생은 가명ID로만 부르고 메시지에 이름을 넣지 않는다.",
    content: `출결 기록 (가명ID: 날짜(요일) 교시 상태):\n${lines.join("\n")}`,
  });
  await repo.audit(v.accountId, "night.ai.review", `${scope.key} ${watch.size}명`);
  if (!res.ok) return { ok: true, summary: `${week.text} (${res.error})`, drafts: fallback, source: "자동" };
  const pid = new Map(scope.students.map((s) => [s.pseudonymId, s.id]));
  const drafts = res.data.students
    .filter((x) => pid.has(x.id) && watch.has(pid.get(x.id)!))
    .map((x) => ({ studentId: pid.get(x.id)!, pattern: x.pattern.slice(0, 60), message: x.message.slice(0, 200) }));
  return { ok: true, summary: res.data.summary.slice(0, 80), drafts: drafts.length ? drafts : fallback, source: drafts.length ? "AI" : "자동" };
}

export type SendState = { error?: string; sent?: number };

/** 확인 후 보내기: 학생 야자 화면에 담임 메시지로 남긴다 (추가만) */
export async function sendNotices(_: SendState, form: FormData): Promise<SendState> {
  const v = await requireCan("night.manage");
  const scope = await classScope(v, String(form.get("class") ?? ""));
  if (!scope) return { error: "담임 반이 없어요" };
  let rows: { studentId: string; body: string }[];
  try {
    rows = z.array(z.object({ studentId: z.string(), body: z.string().trim().min(2).max(300) })).min(1).max(60).parse(JSON.parse(String(form.get("rows") ?? "[]")));
  } catch {
    return { error: "보낼 메시지를 확인해 주세요" };
  }
  const mine = new Set(scope.students.map((s) => s.id));
  if (rows.some((r) => !mine.has(r.studentId))) return { error: "우리 반 학생에게만 보낼 수 있어요" };
  const n = await repo.addNightNotices(rows, v.accountId);
  await repo.audit(v.accountId, "night.notice.send", `${scope.key} ${n}명`);
  revalidatePath("/student/night");
  return { sent: n };
}
