"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addDays, checkApplication, DAY_LABEL, isPastDeadline, remainingSeats, seoulNow, SESSION_LABEL, sessionPeriods, suggestPattern, weekday, weekDays, weekStart,
  type Place, type Session,
} from "@/lib/domain/night";
import { aiJson } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type ApplyState = { error?: string; done?: "saved" | "requested"; days?: number };

const nextWeek = (today: string) => weekDays(addDays(weekStart(today), 7));

/** 다음 주 야자 신청. 마감 전이면 바로 신청(고르지 않은 날은 취소), 마감 뒤면 담임 승인 요청 */
export async function applyNight(_: ApplyState, form: FormData): Promise<ApplyState> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { error: "학생만 신청할 수 있어요" };
  const id = v.student.id;
  let dates: string[];
  try {
    dates = z.array(z.string()).max(5).parse(JSON.parse(String(form.get("dates") ?? "[]")));
  } catch {
    return { error: "요일을 다시 골라 주세요" };
  }
  const session = String(form.get("session") ?? "");
  const place = String(form.get("place") ?? "");
  const now = seoulNow();
  const allowed = nextWeek(now.date);
  const problem = checkApplication({ dates, session, place }, allowed);
  if (problem) return { error: problem };

  const all = await repo.listNightSignups(allowed[0], allowed[4]);
  if (remainingSeats(all, dates, session as Session, place as Place, id) <= 0) return { error: "고른 시간·장소에 남은 자리가 없어요. 다른 장소를 골라 주세요" };

  if (isPastDeadline(now, allowed[0])) {
    const note = String(form.get("note") ?? "").trim();
    if (note.length < 2) return { error: "마감이 지났어요. 사유를 쓰면 담임 선생님께 승인 요청이 가요" };
    const pending = await repo.listNightRequests([id], "대기");
    if (pending.length >= 3) return { error: "승인을 기다리는 요청이 이미 있어요" };
    await repo.addNightRequest({ studentId: id, dates: [...dates].sort(), session: session as Session, place: place as Place, note: note.slice(0, 100) });
    revalidatePath("/student/night");
    revalidatePath("/homeroom/night");
    return { done: "requested", days: dates.length };
  }

  const mine = all.filter((s) => s.studentId === id && s.status === "신청");
  const drop = mine.map((s) => s.date).filter((d) => !dates.includes(d));
  await repo.saveNightSignups(id, dates.map((date) => ({ date, session: session as Session, place: place as Place })));
  if (drop.length) await repo.cancelNightSignups(id, drop);
  revalidatePath("/student/night");
  revalidatePath("/homeroom/night");
  return { done: "saved", days: dates.length };
}

// ---------------------------------------------------------------- AI 신청 도우미

export type Suggestion = { ok: true; weekdays: number[]; session: Session; place: Place; text: string; source: "AI" | "자동" } | { ok: false; error: string };

const AiOut = z.object({
  weekdays: z.array(z.number().int().min(1).max(5)).max(5),
  session: z.enum(["1", "2", "both"]),
  reason: z.string(),
});

/** 지난 4주 신청·출석 기록으로 다음 주 신청을 미리 채운다. AI 에는 가명ID·요일·교시·출석만 보낸다 */
export async function suggestNight(): Promise<Suggestion> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const id = v.student.id;
  const today = seoulNow().date;
  const from = addDays(weekStart(today), -28);
  const [history, att] = await Promise.all([repo.listNightSignups(from, today, [id]), repo.listNightAttendance(from, today, [id])]);
  const rule = suggestPattern(id, history, att);
  if (!rule) return { ok: false, error: "지난 기록이 부족해요. 직접 골라 주세요" };

  const lines = history
    .filter((s) => s.status === "신청")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const st = sessionPeriods(s.session).map((p) => `${p}교시 ${att.find((a) => a.date === s.date && a.period === p)?.status ?? "기록 없음"}`).join(", ");
      return `${s.date.slice(5)}(${DAY_LABEL[weekday(s.date)]}) ${SESSION_LABEL[s.session]}: ${st}`;
    });
  const res = await aiJson(AiOut, {
    model: "fast",
    system:
      "고등학생의 야간 자율학습 다음 주 신청을 미리 채워 준다. 지난 4주 기록에서 자주 신청하고 잘 출석한 요일(1=월~5=금)과 교시(1, 2, both=1·2교시 연속)를 고른다. 결석이 많은 요일은 뺀다. reason 은 학생에게 보여 줄 한 줄(50자 이내, 해요체, 예: '월·수·목 출석률 100% — 같은 요일, 1·2교시 연속으로 채울까요?').",
    content: `학생 ${v.student.pseudonymId} 지난 기록:\n${lines.join("\n")}`,
  });
  if (!res.ok || !res.data.weekdays.length) return { ok: true, weekdays: rule.weekdays, session: rule.session, place: rule.place, text: rule.text, source: "자동" };
  return { ok: true, weekdays: [...new Set(res.data.weekdays)].sort(), session: res.data.session, place: rule.place, text: res.data.reason.slice(0, 80), source: "AI" };
}
