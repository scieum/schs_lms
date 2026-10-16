import { DAY_LABEL, weekday, type NightAttendance } from "./night";
import type { Verdict } from "./scores";

// 담임 화면(H1 우리 반 브리핑, 봉사 받은함)의 규칙 계산. AI 가 꺼져 있을 때도 이 결과를 그대로 보여 준다.

// ---------------------------------------------------------------- 우리 반 브리핑 (H1)

export type BriefKind = "최저" | "야자" | "정정" | "초안";
export interface BriefSignal {
  kind: BriefKind;
  text: string;
  weight: number;
}
export interface BriefInput {
  studentId: string;
  verdict: Verdict | null;
  verdictReason: string | null;
  /** 최근 4주 야자 결석·조퇴 기록 */
  absences: NightAttendance[];
  /** 아직 처리하지 않은 정정 요청 수 */
  pendingCorrections: number;
  /** 최근 받은 확정 초안 수 */
  newDrafts: number;
}
export interface BriefPick {
  studentId: string;
  score: number;
  signals: BriefSignal[];
}

/** 결석이 가장 많이 몰린 요일 (2회 이상일 때만) */
export function peakAbsenceDay(absences: Pick<NightAttendance, "date">[]): number | null {
  const by = new Map<number, number>();
  for (const a of absences) by.set(weekday(a.date), (by.get(weekday(a.date)) ?? 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return top && top[1] >= 2 ? top[0] : null;
}

/** 학생 한 명에게서 먼저 볼 이유를 찾는다. weight 가 클수록 급하다 */
export function briefSignals(x: BriefInput): BriefSignal[] {
  const out: BriefSignal[] = [];
  if (x.verdict === "근접") out.push({ kind: "최저", text: `최저 근접 — ${x.verdictReason ?? "한 과목만 올리면 충족"}`, weight: 4 });
  else if (x.verdict === "미충족") out.push({ kind: "최저", text: `최저 미충족 — ${x.verdictReason ?? "기준을 확인해 주세요"}`, weight: 3 });
  else if (x.verdict === "자료 부족") out.push({ kind: "최저", text: "최저 판정에 필요한 성적이 비어 있어요", weight: 1 });
  const bad = x.absences.filter((a) => a.status !== "출석");
  const days = new Set(bad.map((a) => a.date)).size;
  if (days >= 2) {
    const peak = peakAbsenceDay(bad);
    out.push({ kind: "야자", text: `4주 야자 결석·조퇴 ${days}일${peak !== null ? ` (${DAY_LABEL[peak]}요일에 몰림)` : ""}`, weight: days >= 3 ? 3 : 2 });
  }
  if (x.pendingCorrections > 0) out.push({ kind: "정정", text: `정정 요청 ${x.pendingCorrections}건 대기`, weight: 2 });
  if (x.newDrafts > 0) out.push({ kind: "초안", text: `새 초안 ${x.newDrafts}건 확인`, weight: 1 });
  return out.sort((a, b) => b.weight - a.weight);
}

/** 먼저 볼 학생 n명: 이유 점수 합이 큰 순. 점수가 같으면 이유가 많은 순 → 입력 순서 */
export function pickBriefing(inputs: BriefInput[], n = 3): BriefPick[] {
  return inputs
    .map((x, i) => {
      const signals = briefSignals(x);
      return { studentId: x.studentId, score: signals.reduce((s, g) => s + g.weight, 0), signals, i };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.signals.length - a.signals.length || a.i - b.i)
    .slice(0, n)
    .map(({ studentId, score, signals }) => ({ studentId, score, signals }));
}

/** 규칙 브리핑 한 줄 */
export function briefingLine(picks: BriefPick[], counts: { near: number; pendingFix: number }): string {
  if (!picks.length) return "먼저 볼 학생이 없어요";
  const parts = [`먼저 볼 학생 ${picks.length}명`];
  if (counts.near) parts.push(`최저 근접 ${counts.near}명`);
  if (counts.pendingFix) parts.push(`정정 요청 ${counts.pendingFix}건`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------- 봉사 누적 (봉사 받은함)

export interface ServiceRow {
  studentId: string;
  hours: number;
  status: string; // "sent" | "confirmed" | …
  createdAt: string;
}
export interface ServiceTotal {
  studentId: string;
  confirmed: number;
  waiting: number;
  records: number;
}

/** 학생별 확인된 누적 시간·확인 대기 건수. 학생 목록 순서를 지킨다 */
export function serviceTotals(studentIds: string[], rows: ServiceRow[]): ServiceTotal[] {
  return studentIds.map((id) => {
    const mine = rows.filter((r) => r.studentId === id);
    return {
      studentId: id,
      confirmed: mine.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.hours, 0),
      waiting: mine.filter((r) => r.status === "sent").length,
      records: mine.length,
    };
  });
}

/** 누락 확인: 0시간 학생, 반 평균의 절반이 안 되는 학생, 오래(staleDays일 넘게) 확인을 기다리는 건 */
export function serviceCheck(totals: ServiceTotal[], rows: ServiceRow[], today: string, staleDays = 7) {
  const n = totals.length;
  const sum = totals.reduce((s, t) => s + t.confirmed, 0);
  const avg = n ? Math.round((sum / n) * 10) / 10 : 0;
  const zero = totals.filter((t) => t.confirmed === 0 && t.waiting === 0).map((t) => t.studentId);
  const low = totals.filter((t) => t.confirmed > 0 && avg > 0 && t.confirmed < avg / 2).map((t) => t.studentId);
  const limit = Date.parse(`${today}T00:00:00Z`) - staleDays * 86400000;
  const stale = rows.filter((r) => r.status === "sent" && Date.parse(r.createdAt) < limit).length;
  const parts = [`평균 ${avg}시간`];
  if (zero.length) parts.push(`기록 없는 학생 ${zero.length}명`);
  if (low.length) parts.push(`평균 절반 미만 ${low.length}명`);
  if (stale) parts.push(`${staleDays}일 넘게 확인 대기 ${stale}건`);
  const text = n ? (zero.length || low.length || stale ? parts.join(" · ") : `${parts[0]} · 빠진 학생이 없어요`) : "우리 반 학생이 없어요";
  return { avg, zero, low, stale, text };
}
