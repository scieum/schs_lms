// 성적(모의고사·내신)과 수능 최저 판정. 순수 함수만 둔다 — 화면·서버·테스트가 같이 쓴다.
// 모의고사 과목은 공통과목 그대로 쓴다 (PRD F5, 2026-10-16): 국어·수학·영어·한국사·탐구1(통합사회)·탐구2(통합과학).
// 수학 선택과목이나 사탐·과탐 세부 과목으로 나누지 않는다.

export const SUBJECTS = ["ko", "ma", "en", "hi", "t1", "t2"] as const;
export type SubjectKey = (typeof SUBJECTS)[number];
export const SUBJECT_LABEL: Record<SubjectKey, string> = { ko: "국어", ma: "수학", en: "영어", hi: "한국사", t1: "탐구1", t2: "탐구2" };

/** 과목별 등급(1~9). 비어 있으면 null (결시·미입력) */
export type Grades = Record<SubjectKey, number | null>;
export const emptyGrades = (): Grades => ({ ko: null, ma: null, en: null, hi: null, t1: null, t2: null });

export interface Exam {
  id: string;
  year: number;
  month: number;
  name: string; // 예: 10월 모의고사
}

export interface MockScore {
  examId: string;
  studentId: string;
  grades: Grades;
  createdAt: string;
}

/** 내신 (학기별) */
export interface SchoolGrade {
  studentId: string;
  grade: number; // 학년
  semester: 1 | 2;
  ko: number | null;
  ma: number | null;
  en: number | null;
  average: number; // 전 과목 평균 등급
}

export const examLabel = (e: Pick<Exam, "month">) => `${e.month}월`;
export const sortExams = <T extends Pick<Exam, "year" | "month">>(xs: T[]) => [...xs].sort((a, b) => a.year - b.year || a.month - b.month);
export const round1 = (n: number) => Math.round(n * 10 + 1e-9) / 10;

/** 탐구 두 과목 평균 (한 과목만 있으면 그 과목) */
export function inquiryAverage(g: Grades): number | null {
  const xs = [g.t1, g.t2].filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** 모의고사 평균 등급 = 국·수·영·탐(두 과목 평균)의 평균. 한국사는 뺀다. 있는 것만으로 계산, 소수 첫째 자리 */
export function mockAverage(g: Grades): number | null {
  const xs = [g.ko, g.ma, g.en, inquiryAverage(g)].filter((x): x is number => x !== null);
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

// ---------------------------------------------------------------- 수능 최저

/** 최저 기준에서 고르는 영역 (탐 = 탐구) */
export type Area = "ko" | "ma" | "en" | "tam";
export const AREAS: Area[] = ["ko", "ma", "en", "tam"];
export const AREA_SHORT: Record<Area, string> = { ko: "국", ma: "수", en: "영", tam: "탐" };
export const AREA_LABEL: Record<Area, string> = { ko: "국어", ma: "수학", en: "영어", tam: "탐구" };

/** 탐구 반영 방법: 1과목(좋은 것) · 2과목 평균 · 2과목 평균(소수점 버림) */
export type InquiryMode = "best" | "avg" | "avgFloor";
export const INQUIRY_LABEL: Record<InquiryMode, string> = { best: "탐구 1과목", avg: "탐구 2과목 평균", avgFloor: "탐구 2과목 평균(소수점 버림)" };

export interface MinRule {
  id: string;
  university: string;
  major: string;
  /** 고를 수 있는 영역 */
  pool: Area[];
  /** 몇 개를 고르는지 */
  pick: number;
  /** 등급 합 이내 */
  maxSum: number;
  /** 꼭 넣어야 하는 영역 (예: 수학 포함) */
  required: Area[];
  /** 한국사 n등급 이내 (없으면 null) */
  historyMax: number | null;
  inquiry: InquiryMode;
  note: string | null;
}
export type NewMinRule = Omit<MinRule, "id">;

/** 학생이 정한 목표 대학 (순위 1~3). 기준이 없으면 ruleId=null → 판정 불가 */
export interface StudentTarget {
  studentId: string;
  rank: number;
  university: string;
  major: string;
  ruleId: string | null;
}

export type Verdict = "충족" | "근접" | "미충족" | "자료 부족" | "판정 불가";

export interface Judgement {
  status: Verdict;
  /** 고른 영역과 그 등급 (자료가 다 있을 때) */
  used: { area: Area; grade: number }[];
  sum: number | null;
  /** 이 과목을 1등급만 올리면 충족 (근접일 때) */
  fixes: SubjectKey[];
  /** 한 줄 설명 */
  reason: string;
}

/** 기준이 말이 되는지. 이상하면 판정 불가 */
export function ruleProblems(r: Pick<MinRule, "pool" | "pick" | "maxSum" | "required" | "historyMax">): string[] {
  const p: string[] = [];
  const pool = new Set(r.pool);
  if (!r.pool.length || r.pool.some((a) => !AREAS.includes(a)) || pool.size !== r.pool.length) p.push("반영 영역을 골라 주세요");
  if (!Number.isInteger(r.pick) || r.pick < 1 || r.pick > r.pool.length) p.push("고르는 개수가 영역 수보다 많아요");
  if (!(r.maxSum > 0) || r.maxSum > 9 * Math.max(1, r.pick)) p.push("등급 합을 확인해 주세요");
  if (r.required.some((a) => !pool.has(a))) p.push("필수 영역은 반영 영역 안에 있어야 해요");
  if (r.required.length > r.pick) p.push("필수 영역이 고르는 개수보다 많아요");
  if (r.historyMax !== null && !(Number.isInteger(r.historyMax) && r.historyMax >= 1 && r.historyMax <= 9)) p.push("한국사 등급은 1~9예요");
  return p;
}

const poolText = (r: Pick<MinRule, "pool">) => (r.pool.length === 4 ? "국·수·영·탐" : r.pool.map((a) => AREA_SHORT[a]).join("·"));

/** 표에 쓰는 짧은 기준 (예: 2개 합 5, 수학 포함 2개 합 4) */
export function shortRule(r: Pick<MinRule, "pick" | "maxSum" | "required">): string {
  const req = r.required.length ? `${r.required.map((a) => AREA_LABEL[a]).join("·")} 포함 ` : "";
  return `${req}${r.pick}개 합 ${r.maxSum}`;
}

/** 기준 목록에 쓰는 설명 (예: 국·수·영·탐 중 2개 합 5) + 덧붙임 줄 */
export function describeRule(r: Pick<MinRule, "pool" | "pick" | "maxSum" | "required" | "historyMax" | "inquiry">): { main: string; extra: string } {
  const req = r.required.length ? ` (${r.required.map((a) => AREA_LABEL[a]).join("·")} 포함)` : "";
  const main = `${poolText(r)} 중 ${r.pick}개 합 ${r.maxSum}${req}`;
  const extra = [r.historyMax !== null ? `한국사 ${r.historyMax} 이내` : null, r.pool.includes("tam") ? INQUIRY_LABEL[r.inquiry] : null].filter(Boolean).join(" · ");
  return { main, extra };
}

/** 탐구 영역 등급. 모르는 과목은 fill 로 채운다 (낙관=1, 비관=9) */
function inquiryGrade(g: Grades, mode: InquiryMode, fill: number): number {
  const t1 = g.t1 ?? fill;
  const t2 = g.t2 ?? fill;
  if (mode === "best") return Math.min(t1, t2);
  const avg = (t1 + t2) / 2;
  return mode === "avgFloor" ? Math.floor(avg) : avg;
}

function areaGrade(g: Grades, a: Area, mode: InquiryMode, fill: number): number {
  return a === "tam" ? inquiryGrade(g, mode, fill) : g[a] ?? fill;
}

/** 필수 영역은 꼭 넣고, 나머지는 좋은 등급부터 골라 합을 최소로 만든다 */
function bestCombo(rule: MinRule, g: Grades, fill: number): { used: { area: Area; grade: number }[]; sum: number } {
  const req = rule.required.map((area) => ({ area, grade: areaGrade(g, area, rule.inquiry, fill) }));
  const rest = rule.pool
    .filter((a) => !rule.required.includes(a))
    .map((area) => ({ area, grade: areaGrade(g, area, rule.inquiry, fill) }))
    .sort((a, b) => a.grade - b.grade || AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const used = [...req, ...rest.slice(0, rule.pick - req.length)];
  return { used, sum: used.reduce((s, x) => s + x.grade, 0) };
}

function passes(rule: MinRule, g: Grades, fill: number): boolean {
  const { sum } = bestCombo(rule, g, fill);
  const history = rule.historyMax === null || (g.hi ?? fill) <= rule.historyMax;
  return sum <= rule.maxSum + 1e-9 && history;
}

/** 이 기준에 영향을 주는 과목 */
function relevantSubjects(rule: MinRule): SubjectKey[] {
  const xs: SubjectKey[] = [];
  for (const a of rule.pool) {
    if (a === "tam") xs.push("t1", "t2");
    else xs.push(a);
  }
  if (rule.historyMax !== null) xs.push("hi");
  return xs;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * 수능 최저 판정.
 * - 기준이 없거나 이상하면 "판정 불가"
 * - 빈 과목은 1등급(가장 좋음)과 9등급(가장 나쁨)으로 각각 넣어 본다.
 *   나빠도 통과 → 충족, 좋아도 실패 → 미충족, 그 사이 → 자료 부족
 * - 미충족인데 한 과목을 1등급만 올리면 충족 → 근접 (fixes 에 그 과목)
 */
export function judgeMinimum(rule: MinRule | null | undefined, g: Grades | null | undefined): Judgement {
  if (!rule || ruleProblems(rule).length) return { status: "판정 불가", used: [], sum: null, fixes: [], reason: "대학 기준이 없어요" };
  if (!g) return { status: "자료 부족", used: [], sum: null, fixes: [], reason: "성적이 없어요" };

  const pessimistic = passes(rule, g, 9);
  const optimistic = passes(rule, g, 1);
  const missing = relevantSubjects(rule).filter((k) => g[k] === null);
  const known = missing.length === 0;
  const combo = bestCombo(rule, g, 9);
  const used = known ? combo.used : [];
  const sum = known ? combo.sum : null;

  if (pessimistic) {
    const reason = known
      ? `${[...combo.used].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area)).map((u) => `${AREA_LABEL[u.area]} ${fmt(u.grade)}`).join(" + ")} = ${fmt(combo.sum)}`
      : "빈 과목이 있어도 충족";
    return { status: "충족", used: known ? combo.used : [], sum, fixes: [], reason };
  }
  if (optimistic) {
    return { status: "자료 부족", used, sum, fixes: [], reason: `${missing.map((k) => SUBJECT_LABEL[k]).join("·")} 성적이 없어요` };
  }

  // 미충족: 한 과목만 1등급 올려서 되는지 본다 (빈 과목은 비관적으로 둔 채)
  const fixes = relevantSubjects(rule).filter((k) => {
    const v = g[k];
    if (v === null || v <= 1) return false;
    return passes(rule, { ...g, [k]: v - 1 }, 9);
  });
  // 등급이 낮은(숫자가 큰) 과목부터 — 올리기 쉬운 과목을 먼저 보여 준다
  fixes.sort((a, b) => (g[b] ?? 0) - (g[a] ?? 0));
  if (fixes.length) {
    return { status: "근접", used, sum, fixes, reason: `${SUBJECT_LABEL[fixes[0]]} 1등급만 올리면 충족` };
  }
  const historyFail = rule.historyMax !== null && g.hi !== null && g.hi > rule.historyMax;
  const reason = historyFail
    ? `한국사 ${g.hi}등급 (기준 ${rule.historyMax} 이내)`
    : sum !== null
      ? `합 ${fmt(sum)} (기준 ${rule.maxSum})`
      : "기준보다 등급 합이 커요";
  return { status: "미충족", used, sum, fixes: [], reason };
}

/** 판정 개수 (표 위 숫자 타일) */
export function countVerdicts(vs: Verdict[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = { 충족: 0, 근접: 0, 미충족: 0, "자료 부족": 0, "판정 불가": 0 };
  for (const v of vs) c[v]++;
  return c;
}

export const VERDICT_TONE: Record<Verdict, string> = {
  충족: "bg-ok-soft text-ok",
  근접: "bg-wait-soft text-wait",
  미충족: "bg-bad-soft text-bad",
  "자료 부족": "bg-white text-sub",
  "판정 불가": "bg-white text-mute",
};

// ---------------------------------------------------------------- 추이

export interface TrendPoint {
  examId: string;
  label: string;
  average: number | null;
}

/** 시험 순서대로 평균 등급 */
export function averageTrend(exams: Exam[], scores: MockScore[]): TrendPoint[] {
  const byExam = new Map(scores.map((s) => [s.examId, s]));
  return sortExams(exams)
    .filter((e) => byExam.has(e.id))
    .map((e) => ({ examId: e.id, label: examLabel(e), average: mockAverage(byExam.get(e.id)!.grades) }));
}

/** 첫 시험 대비 가장 많이 오른 과목과 평균 변화 (등급은 낮을수록 좋음 → 오른 폭 = 처음 - 지금) */
export function trendSummary(exams: Exam[], scores: MockScore[]): { change: number | null; months: number; bestSubject: SubjectKey | null; text: string } {
  const sorted = sortExams(exams).filter((e) => scores.some((s) => s.examId === e.id));
  if (sorted.length < 2) return { change: null, months: 0, bestSubject: null, text: "모의고사가 두 번 이상 있어야 추이를 볼 수 있어요" };
  const first = scores.find((s) => s.examId === sorted[0].id)!;
  const last = scores.find((s) => s.examId === sorted[sorted.length - 1].id)!;
  const a0 = mockAverage(first.grades);
  const a1 = mockAverage(last.grades);
  const months = (sorted[sorted.length - 1].year - sorted[0].year) * 12 + sorted[sorted.length - 1].month - sorted[0].month;
  let best: SubjectKey | null = null;
  let bestGain = 0;
  for (const k of ["ko", "ma", "en", "t1", "t2"] as SubjectKey[]) {
    const x0 = first.grades[k];
    const x1 = last.grades[k];
    if (x0 !== null && x1 !== null && x0 - x1 > bestGain) {
      bestGain = x0 - x1;
      best = k;
    }
  }
  if (a0 === null || a1 === null) return { change: null, months, bestSubject: best, text: "평균을 낼 성적이 부족해요" };
  const change = round1(a0 - a1);
  const dir = change > 0 ? `평균 ${change.toFixed(1)}등급 올랐어요` : change < 0 ? `평균 ${(-change).toFixed(1)}등급 내려갔어요` : "평균이 그대로예요";
  const subj = best ? `. ${SUBJECT_LABEL[best]}이 가장 많이 올랐어요` : "";
  return { change, months, bestSubject: best, text: `${months}개월간 ${dir}${subj}` };
}

// ---------------------------------------------------------------- 성적 파일 검사

export const SCORE_FIELDS = ["number", "name", "ko", "ma", "en", "hi", "t1", "t2"] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];
export const SCORE_FIELD_LABEL: Record<ScoreField, string> = { number: "번호", name: "이름", ...SUBJECT_LABEL };
/** 양식 1행 제목 */
export const SCORE_TEMPLATE_COLUMNS = SCORE_FIELDS.map((f) => SCORE_FIELD_LABEL[f]);

export type ColumnMap = Partial<Record<ScoreField, number>>;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// 순서 중요: 한국사를 국어보다 먼저, 탐구1·2를 탐구보다 먼저
const HEADER_RULES: [ScoreField, RegExp][] = [
  ["number", /^(번호|번|no\.?|출석번호)$/],
  ["name", /^(이름|성명|학생|학생명|학생이름)$/],
  ["hi", /한국사|^한$/],
  ["t1", /탐구1|탐1|통합사회|^사회$|탐구\(1\)/],
  ["t2", /탐구2|탐2|통합과학|^과학$|탐구\(2\)/],
  ["ko", /국어|^국$/],
  ["ma", /수학|^수$/],
  ["en", /영어|^영$/],
];
const SKIP = /원점수|표준|백분위|석차|등급컷/;

/** 엑셀 1행 제목을 읽어 열을 맞춘다. 같은 과목이 여럿이면 '등급'이 들어간 열을 먼저 */
export function matchScoreHeaders(headers: string[]): { map: ColumnMap; missing: ScoreField[]; renamed: { from: string; to: ScoreField }[] } {
  const map: ColumnMap = {};
  const renamed: { from: string; to: ScoreField }[] = [];
  const preferred = (i: number) => /등급/.test(headers[i] ?? "");
  headers.forEach((raw, i) => {
    const h = norm(raw ?? "");
    if (!h || SKIP.test(h)) return;
    const hit = HEADER_RULES.find(([, re]) => re.test(h));
    if (!hit) return;
    const f = hit[0];
    if (map[f] !== undefined && !(preferred(i) && !preferred(map[f]!))) return;
    map[f] = i;
  });
  for (const f of SCORE_FIELDS) {
    const i = map[f];
    if (i !== undefined && norm(headers[i]) !== norm(SCORE_FIELD_LABEL[f])) renamed.push({ from: headers[i], to: f });
  }
  const missing = SCORE_FIELDS.filter((f) => map[f] === undefined);
  return { map, missing, renamed };
}

/** 엑셀 열 번호 → 글자 (0 → A) */
export function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 열 맞춤이 말이 되는지 (같은 열을 두 번 쓰지 않기, 범위 안) */
export function validColumnMap(map: ColumnMap, width: number): string | null {
  const used = new Set<number>();
  for (const f of SCORE_FIELDS) {
    const i = map[f];
    if (i === undefined) return `${SCORE_FIELD_LABEL[f]} 열을 골라 주세요`;
    if (!Number.isInteger(i) || i < 0 || i >= width) return `${SCORE_FIELD_LABEL[f]} 열이 파일에 없어요`;
    if (used.has(i)) return `${colLetter(i)}열을 두 번 골랐어요`;
    used.add(i);
  }
  return null;
}

export type ScoreRowStatus = "정상" | "빈 칸" | "범위 오류" | "이름 불일치" | "명단에 없음" | "번호 중복";
export interface RosterEntry {
  id: string;
  number: number;
  name: string;
}
export interface CheckedScoreRow {
  line: number; // 엑셀 행 번호
  raw: Record<ScoreField, string>;
  number: number | null;
  name: string;
  studentId: string | null;
  grades: Grades;
  status: ScoreRowStatus;
  problems: string[];
}

/** 등급 칸 읽기: 빈 칸·"-"·"결시" → null, "2등급" → 2, 1~9 정수만 */
export function parseGrade(v: string): { ok: true; value: number | null } | { ok: false } {
  const s = v.trim().replace(/등급$/, "").trim();
  if (!s || /^[-—–]$/.test(s) || s === "결시" || s === "미응시") return { ok: true, value: null };
  if (!/^\d+(\.0+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= 1 && n <= 9 ? { ok: true, value: n } : { ok: false };
}

const sameName = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/**
 * 성적 행 검사. 번호로 우리 반 명단을 찾고 이름까지 같아야 한다.
 * 번호·이름이 하나라도 안 맞으면 전체를 반영하지 않는다 (PRD F5-2).
 */
export function checkScoreRows(rows: Record<ScoreField, string>[], roster: RosterEntry[]): CheckedScoreRow[] {
  const byNumber = new Map(roster.map((r) => [r.number, r]));
  const seen = new Map<number, number>();
  for (const r of rows) {
    const n = Number(r.number.trim());
    if (Number.isInteger(n)) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return rows.map((raw, i) => {
    const problems: string[] = [];
    const n = Number(raw.number.trim());
    const number = raw.number.trim() && Number.isInteger(n) ? n : null;
    const name = raw.name.trim();
    const grades = emptyGrades();
    let blank = 0;
    let range = 0;
    for (const k of SUBJECTS) {
      const p = parseGrade(raw[k] ?? "");
      if (!p.ok) {
        range++;
        problems.push(`${SUBJECT_LABEL[k]} 값이 1~9가 아니에요`);
      } else {
        grades[k] = p.value;
        if (p.value === null) blank++;
      }
    }
    const who = number !== null ? byNumber.get(number) : undefined;
    let status: ScoreRowStatus;
    if (number === null || !who) {
      status = "명단에 없음";
      problems.unshift(number === null ? "번호가 없어요" : `${number}번 학생이 우리 반에 없어요`);
    } else if ((seen.get(number) ?? 0) > 1) {
      status = "번호 중복";
      problems.unshift(`${number}번이 두 번 나와요`);
    } else if (!sameName(who.name, name)) {
      status = "이름 불일치";
      problems.unshift(`${number}번은 명단에서 다른 이름이에요`);
    } else if (range) {
      status = "범위 오류";
    } else if (blank) {
      status = "빈 칸";
      problems.push(`${SUBJECTS.filter((k) => grades[k] === null).map((k) => SUBJECT_LABEL[k]).join("·")} 칸이 비어 있어요`);
    } else {
      status = "정상";
    }
    return { line: i + 2, raw, number, name, studentId: who?.id ?? null, grades, status, problems };
  });
}

/** 반영 규칙: 번호·이름이 하나라도 틀리면 전체 막기. 범위 오류 행은 빼고, 빈 칸은 결시로 반영 */
export function summarizeScoreRows(rows: CheckedScoreRow[], rosterSize: number) {
  const count = (s: ScoreRowStatus) => rows.filter((r) => r.status === s).length;
  const mismatch = count("이름 불일치") + count("명단에 없음") + count("번호 중복");
  const applicable = rows.filter((r) => r.status === "정상" || r.status === "빈 칸");
  const notInFile = rosterSize - new Set(rows.map((r) => r.studentId).filter(Boolean)).size;
  return {
    total: rows.length,
    ok: count("정상"),
    blank: count("빈 칸"),
    range: count("범위 오류"),
    mismatch,
    needsCheck: rows.length - count("정상"),
    blocked: mismatch > 0,
    applicable: mismatch > 0 ? 0 : applicable.length,
    notInFile: Math.max(0, notInFile),
  };
}

// ---------------------------------------------------------------- 저장 형태 (상담 명단·공부 계획)

/** 수능 최저 상담 명단 (담임이 확인 후 저장) */
export interface MinCounselList {
  id: string;
  grade: number;
  classNo: number;
  examId: string | null;
  items: { studentId: string; reason: string }[];
  createdBy: string;
  createdAt: string;
}

/** 학생 공부 계획 (AI 성적 분석 → 학생이 확인 후 담기) */
export interface StudyPlan {
  id: string;
  studentId: string;
  items: string[];
  createdAt: string;
}

// ---------------------------------------------------------------- 사진·PDF 성적표 (AI 읽기)

/** 이름 없이 번호·등급만 있는 행 (사진·PDF 성적표를 AI가 읽은 결과) */
export type NumberedScoreRow = Record<Exclude<ScoreField, "name">, string>;

/**
 * 번호로 우리 반 명단의 이름을 채운다. AI에는 이름을 받지 않고 서버에서만 이름을 붙인다.
 * 명단에 없는 번호는 이름을 비워 둔다 → checkScoreRows 가 '명단에 없음'으로 막는다.
 */
export function withRosterNames(rows: NumberedScoreRow[], roster: RosterEntry[]): Record<ScoreField, string>[] {
  const byNumber = new Map(roster.map((r) => [r.number, r.name]));
  return rows.map((r) => {
    const n = Number(r.number.trim());
    return { ...r, name: (r.number.trim() && Number.isInteger(n) ? byNumber.get(n) : undefined) ?? "" };
  });
}

// ---------------------------------------------------------------- 모집요강 문구 → 최저 기준 (AI 대체 규칙)

export type ParsedMinRule = Pick<MinRule, "pool" | "pick" | "maxSum" | "required" | "historyMax" | "inquiry"> & { found: boolean };

const AREA_WORD: [Area, RegExp][] = [
  ["ko", /국어|국(?=[\s,·/]|$)/],
  ["ma", /수학|수(?=[\s,·/]|$)/],
  ["en", /영어|영(?=[\s,·/]|$)/],
  ["tam", /탐구|탐(?=[\s,·/]|$)/],
];

/**
 * 모집요강 문구에서 최저 기준을 규칙으로 뽑는다 (AI가 꺼져 있을 때).
 * 예: "국어, 수학, 영어, 탐구(1과목) 중 2개 영역 등급 합 5 이내, 한국사 4등급 이내"
 * 대학·학과 이름은 뽑지 않는다. pick·maxSum 을 못 찾으면 found=false.
 */
export function parseMinRuleText(text: string): ParsedMinRule {
  const t = text.replace(/\s+/g, " ");
  const sum = t.match(/(\d)\s*개?\s*(?:영역|과목)?\s*(?:등급\s*)?합\s*(?:이|계)?\s*(\d+(?:\.\d+)?)/);
  const before = sum ? t.slice(Math.max(0, (sum.index ?? 0) - 60), sum.index) : "";
  const poolSeg = before.includes("중") ? before.slice(0, before.lastIndexOf("중")) : "";
  const pool = AREAS.filter((a) => AREA_WORD.find(([x]) => x === a)![1].test(poolSeg));
  const required = AREAS.filter((a) => new RegExp(AREA_LABEL[a] + String.raw`\s*\(?\s*(?:필수|포함|반드시)`).test(t));
  const hist = t.match(/한국사\s*(\d)\s*등급/);
  const inquiry: InquiryMode = /2\s*과목\s*평균/.test(t) ? (/절사|버림|소수점\s*이하\s*(?:절사|버림)/.test(t) ? "avgFloor" : "avg") : "best";
  return {
    pool: pool.length >= 2 ? pool : [...AREAS],
    pick: sum ? Number(sum[1]) : 2,
    maxSum: sum ? Number(sum[2]) : 5,
    required,
    historyMax: hist ? Number(hist[1]) : null,
    inquiry,
    found: !!sum,
  };
}
