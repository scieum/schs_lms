// 교사 화면 AI 도우미의 규칙 부분 (키가 없을 때 쓰는 "자동" 결과 + AI 결과 검사).
// 순수 함수만 둔다. AI 호출은 lib/server/ai/teacher-ai.ts.
import { SUBJECT_GROUPS, type Course, type SubjectGroup } from "./curriculum";
import { matchHeaders, type Field } from "./roster";
import { sentences, toNeisSentence } from "./writing";

// ---------- 교사 홈: 오늘 브리핑 ----------

export interface BriefingInput {
  failed: number;
  waiting: number;
  /** 마감이 가까운 순서 */
  dueSoon: { id: string; title: string; dday: string; missing: number }[];
  /** 담당 학생 중 상담 기록이 없는 학생 수 */
  noCounsel: number;
}
export interface BriefingLine {
  text: string;
  href: string;
}

/** 규칙 브리핑: 생성 실패 → 마감 임박 → 검토 대기 → 상담 없는 학생 순으로 최대 3줄 */
export function briefingRule(b: BriefingInput): BriefingLine[] {
  const out: BriefingLine[] = [];
  if (b.failed) out.push({ text: `생성 실패 초안 ${b.failed}건은 직접 작성이 필요해요`, href: "/teacher/drafts" });
  const due = b.dueSoon.find((d) => d.missing > 0);
  if (due) out.push({ text: `"${due.title}" ${due.dday} 마감, 미응답 ${due.missing}명에게 알림을 보내요`, href: `/teacher/programs/${due.id}#remind` });
  if (b.waiting) out.push({ text: `검토 대기 초안 ${b.waiting}건을 확인해요`, href: "/teacher/drafts" });
  if (b.noCounsel) out.push({ text: `상담 기록이 없는 담당 학생이 ${b.noCounsel}명이에요`, href: "/teacher/counseling" });
  return out.slice(0, 3);
}

// ---------- 누가기록: 메모 다듬기 ----------

const FILLERS = /(^|\s)(어+|음+|그+|저기|뭐+|약간|이제|그러니까|아무튼|그래서|막)(?=\s|,|$)/g;

/** 받아쓰기·짧은 메모 → 누가기록 문체 1~2문장 (사실만, 순서만 정리) */
export function polishLogRule(raw: string): string {
  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(FILLERS, "$1")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const parts = sentences(cleaned)
    .flatMap((s) => (s.length > 80 ? s.split(/\s*,\s*/) : [s]))
    .map((s) => s.replace(/^[,\s]+|[,\s]+$/g, ""))
    .filter((s) => s.length >= 2);
  if (!parts.length) return "";
  // 3조각 이상이면 앞 조각들을 이어 2문장으로 맞춘다
  const two = parts.length <= 2 ? parts : [parts.slice(0, -1).map((p) => p.replace(/[.!?]$/, "")).join(", "), parts[parts.length - 1]];
  return two.map(toNeisSentence).filter(Boolean).join(" ");
}

// ---------- 동아리: 부원 명단 붙여넣기 ----------

export interface RosterPerson {
  id: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  studentNo: string;
}
export interface RosterMatch {
  matched: string[];
  /** 같은 이름이 여러 명이라 고르지 못한 줄 */
  ambiguous: string[];
  /** 명단에서 찾지 못한 줄 */
  unknown: string[];
}

/**
 * 엑셀 복사·텍스트 명단을 학생과 맞춘다. 한 줄(또는 쉼표로 나뉜 칸)에 한 명.
 * 학번(5자리) → 학년-반-번호 → 이름 순으로 찾는다. 이름은 AI에 보내지 않고 여기서만 맞춘다.
 */
export function matchRosterText(text: string, people: RosterPerson[]): RosterMatch {
  const res: RosterMatch = { matched: [], ambiguous: [], unknown: [] };
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      res.matched.push(id);
    }
  };
  const lines = text
    .replace(/\r\n/g, "\n")
    .split(/\n|;/)
    .flatMap((l) => (/\t/.test(l) || /\d/.test(l) ? [l] : l.split(/,/)))
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const no = line.match(/(?<!\d)([1-3]\d{4})(?!\d)/)?.[1];
    if (no) {
      const s = people.find((p) => p.studentNo === no);
      if (s) { add(s.id); continue; }
    }
    const gcn =
      line.match(/([1-3])\s*학년\s*(\d{1,2})\s*반\s*(\d{1,2})\s*번/) ??
      line.match(/(?<!\d)([1-3])\s*[-.]\s*(\d{1,2})\s*[-.]\s*(\d{1,2})(?!\d)/) ??
      line.match(/(?<!\d)([1-3])\t+(\d{1,2})\t+(\d{1,2})(?!\d)/);
    // 번호 없이 학년·반만 있으면 동명이인 좁히기에만 쓴다
    const gc = gcn ?? line.match(/([1-3])\s*학년\s*(\d{1,2})\s*반/) ?? line.match(/(?<!\d)([1-3])\s*-\s*(\d{1,2})(?![\d-])/);
    const [g, c, n] = gc ? [Number(gc[1]), Number(gc[2]), Number(gcn?.[3] ?? 0)] : [0, 0, 0];
    if (gcn) {
      const s = people.find((p) => p.grade === g && p.classNo === c && p.number === n);
      if (s) { add(s.id); continue; }
    }
    const names = [...line.matchAll(/[가-힣]{2,5}/g)].map((m) => m[0]).filter((w) => !/^(학년|학생|번호|이름|성명|남자|여자|부원|동아리)$/.test(w));
    let done = false;
    for (const w of names) {
      let same = people.filter((p) => p.name.replace(/\s/g, "") === w);
      if (same.length > 1 && gc) same = same.filter((p) => p.grade === g && p.classNo === c);
      if (same.length === 1) { add(same[0].id); done = true; break; }
      if (same.length > 1) { res.ambiguous.push(line); done = true; break; }
    }
    if (!done) res.unknown.push(line);
  }
  return res;
}

// ---------- 내 교과·과목: 추천 ----------

const DEPT_RULES: [RegExp, SubjectGroup][] = [
  [/국어|문학|독서/, "국어"],
  [/수학/, "수학"],
  [/영어/, "영어"],
  [/사회|역사|한국사|지리|윤리|도덕|정치|경제/, "사회"],
  [/과학|물리|화학|생명|생물|지구/, "과학"],
  [/체육/, "체육"],
  [/음악|미술|예술/, "예술"],
  [/정보|기술|가정|컴퓨터/, "기술·가정/정보"],
  [/한문|일본어|중국어|독일어|프랑스어|스페인어|제2외국어/, "제2외국어/한문"],
  [/교양|진로/, "교양"],
];

/** 부서(교과) 이름 → 교과. "과학과" → 과학. 못 찾으면 빈 배열 */
export function deptGroups(dept: string | null | undefined): SubjectGroup[] {
  if (!dept) return [];
  return [...new Set(DEPT_RULES.filter(([re]) => re.test(dept)).map(([, g]) => g))];
}

export interface CourseSuggestion {
  groups: SubjectGroup[];
  courseIds: string[];
}

/** 규칙 추천: 부서로 교과를 고르고, 이미 고른 교과가 있으면 그것도 포함해 그 교과의 편제표 과목을 모두 담는다 */
export function suggestCoursesRule(dept: string | null | undefined, current: SubjectGroup[], courses: Pick<Course, "id" | "group">[]): CourseSuggestion {
  const groups = [...new Set([...deptGroups(dept), ...current])];
  return { groups, courseIds: courses.filter((c) => groups.includes(c.group)).map((c) => c.id) };
}

/** AI 추천을 편제표·교과 목록 안으로 거른다 */
export function cleanCourseSuggestion(s: { groups: string[]; courseIds: string[] }, courses: Pick<Course, "id" | "group">[]): CourseSuggestion {
  const ids = new Set(courses.map((c) => c.id));
  const courseIds = [...new Set(s.courseIds)].filter((id) => ids.has(id));
  const fromCourses = courses.filter((c) => courseIds.includes(c.id)).map((c) => c.group);
  const groups = [...new Set([...s.groups.filter((g): g is SubjectGroup => (SUBJECT_GROUPS as readonly string[]).includes(g)), ...fromCourses])];
  return { groups, courseIds };
}

// ---------- 상담: 다음 질문 ----------

const QUESTIONS: Record<string, string[]> = {
  진로: ["지난 상담 뒤로 관심 분야에서 새로 찾아본 것이 있나요?", "희망 진로와 이어지는 과목이나 활동 중 이번 학기에 해 볼 것은 무엇인가요?", "진로를 정할 때 가장 고민되는 점은 무엇인가요?"],
  학습: ["지난번에 세운 공부 계획 중 지킨 것과 어려웠던 것은 무엇인가요?", "요즘 가장 시간이 많이 드는 과목은 무엇이고 이유는 무엇인가요?", "다음 시험까지 꼭 바꾸고 싶은 공부 습관 하나는 무엇인가요?"],
  생활: ["요즘 학교생활에서 가장 힘든 순간은 언제인가요?", "지난 상담 뒤로 친구나 반 분위기에서 달라진 점이 있나요?", "선생님이 도와주면 좋겠는 일이 있나요?"],
};

/** 규칙 질문: 가장 최근 상담 영역의 기본 질문 3개 (기록이 없으면 진로) */
export function counselQuestionsRule(records: { area: string; date: string }[]): string[] {
  const latest = [...records].sort((a, b) => b.date.localeCompare(a.date))[0];
  return QUESTIONS[latest?.area ?? "진로"] ?? QUESTIONS.진로;
}

// ---------- 학생 등록: 엑셀 열 맞추기 ----------

const LOOSE: [Field, RegExp][] = [
  ["grade", /학년|grade|year/i],
  ["classNo", /반|학급|class|room/i],
  ["number", /번호|번|출석|number|no\b|num/i],
  ["name", /이름|성명|학생명|name/i],
  ["gender", /성별|남녀|gender|sex/i],
  ["track", /계열|track/i],
];

/** 양식 이름으로 맞추고, 남은 열은 포함 관계로 느슨하게 맞춘다 (키가 없을 때) */
export function guessHeaders(headers: string[]): Partial<Record<Field, number>> {
  const map = { ...matchHeaders(headers).map };
  const used = new Set(Object.values(map));
  for (const [f, re] of LOOSE) {
    if (map[f] !== undefined) continue;
    const idx = headers.findIndex((h, i) => !used.has(i) && !!h && re.test(h));
    if (idx >= 0) {
      map[f] = idx;
      used.add(idx);
    }
  }
  return map;
}

/** AI 가 준 열 번호를 검사: 범위 안, 한 열은 한 항목에만 */
export function cleanHeaderMap(raw: Partial<Record<Field, number | null>>, count: number): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  const used = new Set<number>();
  for (const [f, v] of Object.entries(raw) as [Field, number | null][]) {
    if (v === null || v === undefined || !Number.isInteger(v) || v < 0 || v >= count || used.has(v)) continue;
    out[f] = v;
    used.add(v);
  }
  return out;
}

// ---------- 학생 목록: 말로 찾기 ----------

export interface StudentFilter {
  grade?: number;
  classNo?: number;
  number?: number;
  gender?: "남" | "여";
  /** 이름 일부 (서버 안에서만 쓴다) */
  name?: string;
}

/** "2학년 3반 여학생", "1-2", "김민" → 필터. 남은 말은 rest 로 */
export function parseStudentQuery(q: string): { filter: StudentFilter; rest: string } {
  let s = ` ${q.trim()} `;
  const filter: StudentFilter = {};
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(m[0], " ");
    }
  };
  take(/(?<!\d)([1-3])\s*[-.]\s*(\d{1,2})(?:\s*[-.]\s*(\d{1,2}))?(?!\d)/, (m) => {
    filter.grade = Number(m[1]);
    filter.classNo = Number(m[2]);
    if (m[3]) filter.number = Number(m[3]);
  });
  take(/([1-3])\s*학년/, (m) => (filter.grade = Number(m[1])));
  take(/(\d{1,2})\s*반/, (m) => (filter.classNo = Number(m[1])));
  take(/(\d{1,2})\s*번/, (m) => (filter.number = Number(m[1])));
  take(/(여학생|여자|여)(?=\s|$|학생)/, () => (filter.gender = "여"));
  take(/(남학생|남자|남)(?=\s|$|학생)/, () => (filter.gender = "남"));
  s = s.replace(/학생들?|전체|모두|찾아\s*줘|보여\s*줘|목록|명단|중에?서?/g, " ").replace(/\s+/g, " ").trim();
  const name = s.match(/^[가-힣]{1,5}$/)?.[0];
  if (name) {
    filter.name = name;
    s = "";
  }
  return { filter, rest: s };
}

export function filterStudents<T extends { grade: number; classNo: number; number: number; gender: string; name: string }>(list: T[], f: StudentFilter): T[] {
  return list.filter(
    (s) =>
      (f.grade === undefined || s.grade === f.grade) &&
      (f.classNo === undefined || s.classNo === f.classNo) &&
      (f.number === undefined || s.number === f.number) &&
      (f.gender === undefined || s.gender === f.gender) &&
      (!f.name || s.name.includes(f.name)),
  );
}

export function filterLabel(f: StudentFilter): string {
  return [
    f.grade && `${f.grade}학년`,
    f.classNo && `${f.classNo}반`,
    f.number && `${f.number}번`,
    f.gender && `${f.gender}학생`,
    f.name && `이름에 "${f.name}"`,
  ].filter(Boolean).join(" · ");
}
