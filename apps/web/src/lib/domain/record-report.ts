// 학생부 점검 보고서 (Figma N39 ②): 기록 상태·검사 결과 → 반 / 과목·분반 / 선생님별 건수. 순수 함수만.
// 단위는 "건"(기록 1개 = 1건). 학생 이름·학번·글은 여기서 다루지 않는다 — 서버가 글로 검사한 결과(참·거짓)만 받는다.
// 숫자 정의:
//   미작성 = 글 없음 · 작성 중 = 글은 있으나 미확정 · 확정
//   바이트 초과 = 영역 나이스 한도 초과 (length.ts · writing.ts)
//   금칙어·실명 = forbidden.ts 금칙어(ban) 또는 이름·학번이 글에 남음 (N23 자동 검사와 같은 규칙)
//   맞춤법 · 근거 없는 문장 = N38 검사 결과가 남은 기록 (N38 결과가 없으면 0)
//   담임 미전달 = 프로그램 초안을 확정했지만 담임에게 아직 안 간 것 (프로그램 초안에서만 센다)
import { findForbidden } from "./forbidden";
import { neisBytes } from "./length";

export const REPORT_AREAS = ["세특", "자율·자치", "동아리", "진로", "행발", "프로그램 초안"] as const;
export type ReportArea = (typeof REPORT_AREAS)[number];
export type ReportAreaFilter = ReportArea | "all";

/** 주소 거르기 값 (?area=) — 한글 대신 짧은 영문 */
export const AREA_PARAM: Record<ReportAreaFilter, string> = {
  all: "all", 세특: "setuk", "자율·자치": "auto", 동아리: "club", 진로: "career", 행발: "behavior", "프로그램 초안": "program",
};
export function readArea(v: string | undefined | null): ReportAreaFilter {
  const hit = (Object.entries(AREA_PARAM) as [ReportAreaFilter, string][]).find(([, p]) => p === v);
  return hit ? hit[0] : "all";
}
export const AREA_TAB: Record<ReportAreaFilter, string> = { all: "전체", 세특: "세특", "자율·자치": "자율·자치", 동아리: "동아리", 진로: "진로", 행발: "행발", "프로그램 초안": "프로그램 초안" };

export type ReportStatus = "미작성" | "작성 중" | "확정";
export const ISSUE_KEYS = ["over", "forbidden", "spell", "ungrounded", "undelivered"] as const;
export type IssueKey = (typeof ISSUE_KEYS)[number];
/** 요약 칩 이름 · 표 머리 · 모바일 칩 */
export const ISSUE_LABEL: Record<IssueKey, { chip: string; head: string; short: string }> = {
  over: { chip: "바이트 초과", head: "바이트 초과", short: "바이트" },
  forbidden: { chip: "금칙어·실명 남음", head: "금칙어·실명", short: "실명" },
  spell: { chip: "맞춤법", head: "맞춤법", short: "맞춤법" },
  ungrounded: { chip: "근거 없는 문장", head: "근거 없음", short: "근거" },
  undelivered: { chip: "담임 미전달", head: "담임 미전달", short: "미전달" },
};

/** 기록 1건 (글은 없다) */
export interface ReportRecord {
  area: ReportArea;
  grade: number;
  classNo: number;
  /** 맡은 선생님 (세특 과목 담당 · 담임 · 동아리 지도 · 프로그램 담당) */
  teacherId: string | null;
  /** 선생님별 "맡은 것" 이름 (예: 진로 2-4, 물리학 2학년 1·2분반, 동아리 '로봇 만들기') */
  scope: string;
  /** 세특: 과목·분반 줄 (key = 과목ID|분반) */
  group?: { key: string; label: string; courseId: string; section: string | null };
  status: ReportStatus;
  issues: Partial<Record<IssueKey, boolean>>;
  /** 마지막으로 쓴 때 (ISO) */
  updatedAt: string | null;
}

export interface Counts {
  total: number;
  empty: number;
  writing: number;
  confirmed: number;
  over: number;
  forbidden: number;
  spell: number;
  ungrounded: number;
  undelivered: number;
  /** 확인 필요 = 다섯 가지 합 */
  check: number;
  /** 확정 / 전체 (%) */
  progress: number;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function tally(records: readonly ReportRecord[]): Counts {
  const c: Counts = { total: records.length, empty: 0, writing: 0, confirmed: 0, over: 0, forbidden: 0, spell: 0, ungrounded: 0, undelivered: 0, check: 0, progress: 0 };
  for (const r of records) {
    if (r.status === "미작성") c.empty++;
    else if (r.status === "작성 중") c.writing++;
    else c.confirmed++;
    for (const k of ISSUE_KEYS) if (r.issues[k]) c[k]++;
  }
  c.check = c.over + c.forbidden + c.spell + c.ungrounded + c.undelivered;
  c.progress = pct(c.confirmed, c.total);
  return c;
}

/** 영역으로 거르기 */
export const filterArea = (records: readonly ReportRecord[], area: ReportAreaFilter) => (area === "all" ? [...records] : records.filter((r) => r.area === area));

export interface ClassRow { key: string; grade: number; classNo: number; homeroom: string | null; students: number; counts: Counts }

/**
 * 반별 현황. students: 반별 학생 수 (key "2-3"), homerooms: 반 → 담임 이름.
 * 기록이 없는 반도 학생 수가 있으면 줄을 만든다.
 */
export function byClass(records: readonly ReportRecord[], students: Record<string, number>, homerooms: Record<string, string>): ClassRow[] {
  const groups = new Map<string, ReportRecord[]>();
  for (const k of Object.keys(students)) groups.set(k, []);
  for (const r of records) {
    const k = `${r.grade}-${r.classNo}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [g, c] = key.split("-").map(Number);
      return { key, grade: g, classNo: c, homeroom: homerooms[key] ?? null, students: students[key] ?? 0, counts: tally(list) };
    })
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
}

export interface GroupRow { key: string; label: string; courseId: string; section: string | null; teacherId: string | null; students: number; counts: Counts }

/** 세특 과목·분반별 (세특을 고르면 반 대신 이 줄) */
export function byGroup(records: readonly ReportRecord[]): GroupRow[] {
  const groups = new Map<string, ReportRecord[]>();
  for (const r of records) {
    if (!r.group) continue;
    if (!groups.has(r.group.key)) groups.set(r.group.key, []);
    groups.get(r.group.key)!.push(r);
  }
  return [...groups.values()]
    .map((list) => {
      const g = list[0].group!;
      return { key: g.key, label: g.label, courseId: g.courseId, section: g.section, teacherId: list[0].teacherId, students: list.length, counts: tally(list) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export interface TeacherRow { teacherId: string; scopes: string[]; records: number; confirmed: number; progress: number; check: number; last: string | null }

/** 선생님별 진행률 (진행률 낮은 순) */
export function byTeacher(records: readonly ReportRecord[]): TeacherRow[] {
  const groups = new Map<string, ReportRecord[]>();
  for (const r of records) {
    if (!r.teacherId) continue;
    if (!groups.has(r.teacherId)) groups.set(r.teacherId, []);
    groups.get(r.teacherId)!.push(r);
  }
  return [...groups.entries()]
    .map(([teacherId, list]) => {
      const c = tally(list);
      const last = list.reduce<string | null>((m, r) => (r.updatedAt && (!m || r.updatedAt > m) ? r.updatedAt : m), null);
      return { teacherId, scopes: [...new Set(list.map((r) => r.scope))], records: c.total, confirmed: c.confirmed, progress: c.progress, check: c.check, last };
    })
    .sort((a, b) => a.progress - b.progress || b.records - a.records);
}

/** 진행률 막대 색: 75%↑ 초록 · 55%↑ 인디고 · 그 아래 노랑 */
export function progressTone(p: number): "ok" | "key" | "wait" {
  return p >= 75 ? "ok" : p >= 55 ? "key" : "wait";
}

/** 기록 상태 (세특·창체·행발·프로그램 초안 공통) */
export function statusOf(content: string | null | undefined, confirmed: boolean): ReportStatus {
  if (!content || !content.trim()) return "미작성";
  return confirmed ? "확정" : "작성 중";
}

/**
 * 글로 세는 검사 (서버에서 부르고 결과만 넘긴다): 바이트 초과 · 금칙어(ban)·실명.
 * identity = 글에 남은 이 학생 이름·학번 (writing.findIdentity 결과)
 */
export function textIssues(text: string, o: { maxBytes: number; identity: string[] }): Pick<Record<IssueKey, boolean>, "over" | "forbidden"> {
  const body = text.trim();
  if (!body) return { over: false, forbidden: false };
  return {
    over: neisBytes(body) > o.maxBytes,
    forbidden: o.identity.length > 0 || findForbidden(body).some((h) => h.level === "ban"),
  };
}

/** 모바일 반 카드 문제 칩 (0 이 아닌 것만) */
export function issueChips(c: Counts): { key: IssueKey; label: string; n: number }[] {
  return ISSUE_KEYS.filter((k) => c[k] > 0).map((k) => ({ key: k, label: ISSUE_LABEL[k].short, n: c[k] }));
}

/** 엑셀 · 인쇄 파일 이름: 학생부점검_2학년_20261019.xlsx */
export function reportFileName(grade: number, ymd: string, ext = "xlsx"): string {
  return `학생부점검_${grade}학년_${ymd.replace(/-/g, "")}.${ext}`;
}
