// 과목 신청 (개설·학생 신청) — 순수 규칙

/** 한 학년의 한 학기 신청 묶음: 마감일·최대 학점 */
export interface OfferingRound {
  id: string;
  year: number;
  semester: 1 | 2;
  /** 신청하는 학생의 학년 */
  grade: number;
  /** YYYY-MM-DD, 이날 끝(한국 시간 24시)까지 신청 */
  deadline: string;
  maxCredits: number;
}

/** 신청을 받는 과목 */
export interface Offering {
  id: string;
  roundId: string;
  subject: string;
  /** 분야 (수학·과학·예술·사회·기술 …) */
  field: string;
  credits: number;
  /** 한 반 정원 */
  capacity: number;
  /** 반 수 (반을 늘리면 1씩 오른다) */
  sections: number;
  /** 편제표 과목에서 열었으면 그 id */
  courseId: string | null;
}

export const DEFAULT_MAX_CREDITS = 16;

/** 전체 자리 = 한 반 정원 × 반 수 */
export function seats(o: Pick<Offering, "capacity" | "sections">): number {
  return o.capacity * o.sections;
}

/** 편제표 교과(군) → 짧은 분야 이름 */
export function fieldOf(group: string): string {
  if (group.startsWith("기술")) return "기술";
  if (group.startsWith("제2외국어")) return "외국어";
  return group;
}

export type SeatState = { count: number; seats: number; left: number; over: boolean; full: boolean };

export function seatState(o: Pick<Offering, "capacity" | "sections">, count: number): SeatState {
  const s = seats(o);
  return { count, seats: s, left: s - count, over: count > s, full: count >= s };
}

/** 학생 화면 잔여석 표시: 0 이하면 마감, 3석 이하면 적음 */
export function seatLabel(left: number): { text: string; low: boolean } {
  if (left <= 0) return { text: "마감", low: true };
  return { text: `잔여 ${left}석`, low: left <= 3 };
}

/** 마감일이 지났는가 (한국 시간 그날 24시까지 신청 가능) */
export function isClosed(deadline: string, now: Date): boolean {
  const end = new Date(`${deadline}T00:00:00+09:00`).getTime() + 86400000;
  return now.getTime() >= end;
}

/** "10.30" */
export function deadlineLabel(deadline: string): string {
  const [, m, d] = deadline.split("-");
  return `${Number(m)}.${d}`;
}

export type ApplyProblem =
  | { kind: "closed" }
  | { kind: "credits"; total: number; max: number }
  | { kind: "full"; subject: string }
  | { kind: "unknown" }
  | { kind: "duplicate"; subject: string };

/**
 * 신청 검사.
 * - 마감일 지남 → closed
 * - 학점 합이 최대 학점 초과 → credits
 * - 새로 담은 과목이 이미 정원만큼 찼으면 → full (이미 신청해 둔 과목은 자리를 지킨다)
 * counts 에는 나를 포함한 지금 신청 수가 들어 있다.
 */
export function checkApplication(args: {
  round: Pick<OfferingRound, "deadline" | "maxCredits">;
  offerings: Offering[];
  picked: string[];
  mine: string[];
  counts: Record<string, number>;
  now: Date;
}): ApplyProblem[] {
  const { round, offerings, picked, mine, counts, now } = args;
  const problems: ApplyProblem[] = [];
  if (isClosed(round.deadline, now)) problems.push({ kind: "closed" });
  const byId = new Map(offerings.map((o) => [o.id, o]));
  const list = [...new Set(picked)].map((id) => byId.get(id));
  if (list.some((o) => !o)) problems.push({ kind: "unknown" });
  const chosen = list.filter((o): o is Offering => !!o);
  const seen = new Set<string>();
  for (const o of chosen) {
    if (seen.has(o.subject)) problems.push({ kind: "duplicate", subject: o.subject });
    seen.add(o.subject);
  }
  const total = chosen.reduce((n, o) => n + o.credits, 0);
  if (total > round.maxCredits) problems.push({ kind: "credits", total, max: round.maxCredits });
  const had = new Set(mine);
  for (const o of chosen) {
    if (!had.has(o.id) && (counts[o.id] ?? 0) >= seats(o)) problems.push({ kind: "full", subject: o.subject });
  }
  return problems;
}

export function problemMessage(p: ApplyProblem): string {
  switch (p.kind) {
    case "closed": return "신청이 마감됐어요";
    case "credits": return `최대 ${p.max}학점까지 담을 수 있어요 (지금 ${p.total}학점)`;
    case "full": return `${p.subject}은(는) 자리가 없어요`;
    case "duplicate": return `${p.subject}을(를) 두 번 담았어요`;
    case "unknown": return "없는 과목이 있어요. 새로 고쳐 주세요";
  }
}

/** 관리자 화면 숫자: 개설 과목 수 · 신청률(%) · 정원 초과 과목 수 */
export function offeringStats(offerings: Offering[], counts: Record<string, number>, applicants: number, eligible: number) {
  return {
    total: offerings.length,
    rate: eligible > 0 ? Math.round((applicants / eligible) * 100) : 0,
    over: offerings.filter((o) => (counts[o.id] ?? 0) > seats(o)).length,
  };
}

/** 정원 초과 과목마다 모두 들으려면 반을 몇 개 더 열어야 하는지 */
export function sectionSuggestions(offerings: Offering[], counts: Record<string, number>): { offering: Offering; add: number }[] {
  return offerings
    .filter((o) => (counts[o.id] ?? 0) > seats(o))
    .map((o) => ({ offering: o, add: Math.ceil((counts[o.id] ?? 0) / o.capacity) - o.sections }))
    .filter((x) => x.add > 0);
}

// 희망 진로 → 먼저 볼 과목 (AI가 꺼져 있을 때 쓰는 규칙)
const CAREER_RULES: [RegExp, string[]][] = [
  [/디자인|미술|건축|예술|패션|영상/, ["미술 창작", "미술", "기하", "정보"]],
  [/의사|의학|약|간호|생명|보건|수의/, ["생명과학Ⅱ", "화학Ⅱ", "생명과학", "화학", "미적분Ⅱ"]],
  [/공학|기계|전기|전자|물리|항공|자동차|로봇/, ["물리학Ⅱ", "미적분Ⅱ", "기하", "물리학"]],
  [/컴퓨터|소프트웨어|프로그래|개발|인공지능|AI|데이터|게임/, ["정보", "미적분Ⅱ", "인공지능 수학", "확률과 통계"]],
  [/경영|경제|회계|금융|무역|마케팅/, ["경제", "확률과 통계", "경제 수학", "사회와 문화"]],
  [/교사|교육|상담|심리|사회복지/, ["생활과 윤리", "사회와 문화", "윤리와 사상"]],
  [/법|정치|행정|외교|경찰/, ["정치와 법", "생활과 윤리", "사회와 문화"]],
  [/환경|지구|기후|해양|지리/, ["지구과학Ⅱ", "지구과학", "기후변화와 환경생태", "한국지리"]],
];

const norm = (s: string) => s.replace(/\s+/g, "").replace(/II/g, "Ⅱ").replace(/I/g, "Ⅰ");

/** 규칙으로 고른 진로 맞춤 과목 id (최대 n개, 열린 과목 중에서만) */
export function careerPicks(careerGoal: string | null, offerings: Offering[], n = 3): string[] {
  if (!careerGoal) return [];
  const names = CAREER_RULES.filter(([re]) => re.test(careerGoal)).flatMap(([, list]) => list).map(norm);
  const out: string[] = [];
  for (const name of names) {
    const o = offerings.find((x) => norm(x.subject) === name);
    if (o && !out.includes(o.id)) out.push(o.id);
    if (out.length >= n) break;
  }
  return out;
}
