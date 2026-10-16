// 야간 자율학습(야자). 신청·출석·잔여석·출석률·신청 패턴. 순수 함수만 둔다.
// 날짜는 모두 'YYYY-MM-DD' 문자열(한국 시간 기준 날짜)로 다룬다.

export type Period = 1 | 2;
export const PERIODS: Record<Period, { label: string; start: string; end: string }> = {
  1: { label: "1교시", start: "18:30", end: "19:50" },
  2: { label: "2교시", start: "20:10", end: "21:20" },
};

/** 신청 단위: 1교시 · 2교시 · 1·2교시 연속 */
export type Session = "1" | "2" | "both";
export const SESSIONS: Session[] = ["1", "2", "both"];
export const SESSION_LABEL: Record<Session, string> = { "1": "1교시", "2": "2교시", both: "1·2교시 연속" };
export const sessionPeriods = (s: Session): Period[] => (s === "1" ? [1] : s === "2" ? [2] : [1, 2]);
export function sessionTime(s: Session): string {
  const ps = sessionPeriods(s);
  return `${PERIODS[ps[0]].start} – ${PERIODS[ps[ps.length - 1]].end}`;
}
export const isSession = (s: string): s is Session => (SESSIONS as string[]).includes(s);

export const PLACES = [
  { id: "자습실 A", seats: 40 },
  { id: "자습실 B", seats: 30 },
  { id: "도서관", seats: 20 },
] as const;
export type Place = (typeof PLACES)[number]["id"];
export const isPlace = (s: string): s is Place => PLACES.some((p) => p.id === s);
export const placeSeats = (p: Place): number => PLACES.find((x) => x.id === p)!.seats;

/** 야자 신청 (학생·날짜 하나에 하나). 취소하면 status=취소 */
export interface NightSignup {
  studentId: string;
  date: string;
  session: Session;
  place: Place;
  status: "신청" | "취소";
}

export type AttendStatus = "출석" | "결석" | "조퇴";
export const ATTEND: AttendStatus[] = ["출석", "결석", "조퇴"];
export const isAttend = (s: string): s is AttendStatus => (ATTEND as string[]).includes(s);
/** 칸을 누를 때마다 출석 → 결석 → 조퇴 → 출석 */
export const nextAttend = (s: AttendStatus | null): AttendStatus => (s === null ? "출석" : ATTEND[(ATTEND.indexOf(s) + 1) % ATTEND.length]);

export interface NightAttendance {
  studentId: string;
  date: string;
  period: Period;
  status: AttendStatus;
}

/** 신청·변경 요청 (마감 뒤 신청, 이번 주 변경은 담임 승인) */
export interface NightRequest {
  id: string;
  studentId: string;
  dates: string[];
  session: Session;
  place: Place;
  note: string;
  status: "대기" | "승인" | "반려";
  createdAt: string;
}

// ---------------------------------------------------------------- 날짜

const toUtc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => fromUtc(toUtc(ymd) + n * 86400000);
/** 0=일 … 6=토 */
export const weekday = (ymd: string) => new Date(toUtc(ymd)).getUTCDay();
export const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
/** 그 주 월요일 */
export const weekStart = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));
/** 그 주 월~금 */
export const weekDays = (ymd: string) => [0, 1, 2, 3, 4].map((i) => addDays(weekStart(ymd), i));
export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
/** 10.19 */
export const mdLabel = (ymd: string) => `${Number(ymd.slice(5, 7))}.${Number(ymd.slice(8, 10))}`;
/** 10.12 (월) */
export const dayLabel = (ymd: string) => `${mdLabel(ymd)} (${DAY_LABEL[weekday(ymd)]})`;

/** 한국 시간 기준 오늘 날짜와 시각 */
export function seoulNow(d: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** 다음 주 신청 마감: 그 주 시작 전날(일요일) 22:00 */
export const DEADLINE_TIME = "22:00";
export function deadlineOf(targetWeekStart: string): { date: string; time: string } {
  return { date: addDays(targetWeekStart, -1), time: DEADLINE_TIME };
}
export function isPastDeadline(now: { date: string; time: string }, targetWeekStart: string): boolean {
  const d = deadlineOf(targetWeekStart);
  return now.date > d.date || (now.date === d.date && now.time >= d.time);
}

// ---------------------------------------------------------------- 출석 판정

export type CellStatus = AttendStatus | "미신청" | "미확인";

/** 학생 한 명의 그날 그 교시 칸 상태 */
export function cellStatus(signup: NightSignup | undefined, att: NightAttendance | undefined, period: Period): CellStatus {
  if (!signup || signup.status !== "신청" || !sessionPeriods(signup.session).includes(period)) return "미신청";
  return att?.status ?? "미확인";
}

/** 하루 한 교시 반 요약 */
export function periodSummary(cells: CellStatus[]) {
  const signed = cells.filter((c) => c !== "미신청").length;
  const present = cells.filter((c) => c === "출석").length;
  const absent = cells.filter((c) => c === "결석" || c === "조퇴").length;
  const unchecked = cells.filter((c) => c === "미확인").length;
  return { signed, present, absent, unchecked };
}

const key = (studentId: string, date: string, period: Period) => `${studentId}|${date}|${period}`;

/** 요일별 출석률: 신청한 교시 중 출석한 비율. 신청이 없으면 null */
export function dailyRates(dates: string[], signups: NightSignup[], att: NightAttendance[]): { date: string; rate: number | null; signed: number; present: number }[] {
  const atts = new Map(att.map((a) => [key(a.studentId, a.date, a.period), a]));
  return dates.map((date) => {
    let signed = 0;
    let present = 0;
    for (const s of signups) {
      if (s.date !== date || s.status !== "신청") continue;
      for (const p of sessionPeriods(s.session)) {
        const a = atts.get(key(s.studentId, date, p));
        if (!a) continue; // 아직 확인 안 한 교시는 빼고 센다
        signed++;
        if (a.status === "출석") present++;
      }
    }
    return { date, signed, present, rate: signed ? Math.round((present / signed) * 100) : null };
  });
}

/** 학생이 그 기간에 신청한 날 수 / 한 교시라도 출석한 날 수 */
export function studentDays(studentId: string, dates: string[], signups: NightSignup[], att: NightAttendance[]) {
  const set = new Set(dates);
  const signed = signups.filter((s) => s.studentId === studentId && s.status === "신청" && set.has(s.date)).map((s) => s.date);
  const attended = new Set(att.filter((a) => a.studentId === studentId && set.has(a.date) && a.status === "출석").map((a) => a.date));
  return { signed: new Set(signed).size, attended: signed.filter((d) => attended.has(d)).length };
}

// ---------------------------------------------------------------- 잔여석

/** 그 날짜·교시·장소에 이미 신청한 사람 수 (본인 제외) */
export function takenSeats(signups: NightSignup[], date: string, period: Period, place: Place, exceptStudent?: string): number {
  return signups.filter((s) => s.status === "신청" && s.date === date && s.place === place && s.studentId !== exceptStudent && sessionPeriods(s.session).includes(period)).length;
}

/** 고른 날들 중 가장 빡빡한 날 기준 잔여석 */
export function remainingSeats(signups: NightSignup[], dates: string[], session: Session, place: Place, exceptStudent?: string): number {
  const cap = placeSeats(place);
  if (!dates.length) {
    return cap;
  }
  let min: number = cap;
  for (const d of dates) for (const p of sessionPeriods(session)) min = Math.min(min, cap - takenSeats(signups, d, p, place, exceptStudent));
  return Math.max(0, min);
}

// ---------------------------------------------------------------- 신청 검사

export function checkApplication(input: { dates: string[]; session: string; place: string }, allowedDates: string[]): string | null {
  if (!input.dates.length) return "요일을 하나 이상 골라 주세요";
  if (input.dates.some((d) => !allowedDates.includes(d))) return "신청할 수 없는 날짜가 있어요";
  if (new Set(input.dates).size !== input.dates.length) return "같은 날을 두 번 골랐어요";
  if (!isSession(input.session)) return "시간을 골라 주세요";
  if (!isPlace(input.place)) return "장소를 골라 주세요";
  return null;
}

// ---------------------------------------------------------------- 신청 패턴 (신청 도우미의 기본값)

/**
 * 지난 기록으로 다음 주 신청을 미리 채운다.
 * 지난 4주에 2번 이상 신청했고 출석률이 75% 이상인 요일, 가장 많이 고른 시간·장소.
 */
export function suggestPattern(studentId: string, history: NightSignup[], att: NightAttendance[]): { weekdays: number[]; session: Session; place: Place; rate: number | null; text: string } | null {
  const mine = history.filter((s) => s.studentId === studentId && s.status === "신청");
  if (!mine.length) return null;
  const atts = new Map(att.filter((a) => a.studentId === studentId).map((a) => [`${a.date}|${a.period}`, a.status]));
  const byDay = new Map<number, { n: number; signed: number; present: number }>();
  for (const s of mine) {
    const w = weekday(s.date);
    const e = byDay.get(w) ?? { n: 0, signed: 0, present: 0 };
    e.n++;
    for (const p of sessionPeriods(s.session)) {
      const st = atts.get(`${s.date}|${p}`);
      if (!st) continue;
      e.signed++;
      if (st === "출석") e.present++;
    }
    byDay.set(w, e);
  }
  const weekdays = [...byDay.entries()]
    .filter(([w, e]) => w >= 1 && w <= 5 && e.n >= 2 && (e.signed === 0 || e.present / e.signed >= 0.75))
    .map(([w]) => w)
    .sort();
  if (!weekdays.length) return null;
  const mode = <T,>(xs: T[]) => {
    const c = new Map<T, number>();
    xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const picked = mine.filter((s) => weekdays.includes(weekday(s.date)));
  const session = mode(picked.map((s) => s.session));
  const place = mode(picked.map((s) => s.place));
  let signed = 0;
  let present = 0;
  for (const w of weekdays) {
    signed += byDay.get(w)!.signed;
    present += byDay.get(w)!.present;
  }
  const rate = signed ? Math.round((present / signed) * 100) : null;
  const days = weekdays.map((w) => DAY_LABEL[w]).join("·");
  const text = `${days} 출석률 ${rate ?? "-"}% — 같은 요일, ${SESSION_LABEL[session]}${session === "both" ? "으로" : "로"} 채울까요?`;
  return { weekdays, session, place, rate, text };
}

// ---------------------------------------------------------------- 결석 패턴 (출결 살펴보기의 기본값)

/** 이번 주 2회 이상 결석(조퇴 포함)한 학생과 결석이 몰린 요일 */
export function absencePattern(att: NightAttendance[], dates: string[], minCount = 2): { students: { studentId: string; count: number }[]; peakDay: number | null; text: string } {
  const set = new Set(dates);
  const bad = att.filter((a) => set.has(a.date) && a.status !== "출석");
  const per = new Map<string, Set<string>>();
  for (const a of bad) {
    const s = per.get(a.studentId) ?? new Set<string>();
    s.add(a.date);
    per.set(a.studentId, s);
  }
  const students = [...per.entries()].map(([studentId, ds]) => ({ studentId, count: ds.size })).filter((x) => x.count >= minCount).sort((a, b) => b.count - a.count);
  const byDay = new Map<number, number>();
  for (const a of bad) byDay.set(weekday(a.date), (byDay.get(weekday(a.date)) ?? 0) + 1);
  const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const peakDay = peak && peak[1] >= 2 ? peak[0] : null;
  const text = students.length
    ? `이번 주 ${minCount}회 이상 결석 ${students.length}명${peakDay !== null ? ` (${DAY_LABEL[peakDay]}요일에 몰려 있어요)` : ""}`
    : "이번 주 결석이 몰린 학생은 없어요";
  return { students, peakDay, text };
}

/** 담임 → 학생 확인 메시지 */
export interface NightNotice {
  id: string;
  studentId: string;
  body: string;
  createdBy: string;
  createdAt: string;
}
