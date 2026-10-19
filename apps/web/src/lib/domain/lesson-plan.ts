// 차시별 활동 메뉴 (Figma N43 ②): 분반·동아리·창체 영역의 수업 계획(차시 · 날짜 · 활동명 · 활동 내용).
// 엑셀 양식(N25 규칙 그대로 — AI 없음) 또는 운영계획서(HWPX · PDF — AI가 읽음)로 만들고, 교사가 확인 화면에서 고쳐 저장한다.
// 학생 메모 칸 위에 차시 칩이 생겨 누르면 활동명 · 날짜가 채워진다(활동 내용은 메모에 넣지 않음 — ② AI로 쓰기 배경으로만).

import { ACTIVITY_MAX, cleanActivity } from "./activity-name";
import { parseScope } from "./common-activity";

export type LessonScopeKind = "offering" | "club" | "homeroom";

export interface LessonPlan {
  id: string;
  schoolYear: number;
  scopeKind: LessonScopeKind;
  /** 공통 활동과 같은 범위 글 ("세특:<courseId>[:<분반>]" · "동아리:<clubId>" · "자율·자치:2-3" · "진로:2-3") */
  scopeId: string;
  title: string;
  source: "excel" | "doc";
  fileName: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonItem {
  id: string;
  planId: string;
  no: number;
  date: string | null; // YYYY-MM-DD
  title: string;
  detail: string;
  position: number;
}

/** 화면에 넘기는 차시 (칩 · 메뉴) */
export type LessonChipItem = Pick<LessonItem, "id" | "no" | "date" | "title" | "detail">;
/** 이 학생에게 이 차시 메모가 있음 */
export type LessonMark = { itemId: string; studentId: string };
/** 화면에 넘기는 차시 메뉴 묶음 (페이지 → 카드 · 편집기) */
export type LessonView = {
  scope: string;
  /** "물리학 1분반" */
  label: string;
  items: LessonChipItem[];
  marks: LessonMark[];
  students: { id: string; no: string; name: string }[];
  today: string;
  fileName: string | null;
  source: "excel" | "doc" | null;
};

/** 확인 화면 행 (저장 전) — id 가 있으면 고친 행, 없으면 새 행 */
export type LessonDraft = { id?: string; no: number; date: string | null; title: string; detail: string };

export const LESSON_MAX = 80;
export const DETAIL_MAX = 200;

/** 범위 → 표 scope_kind (행발은 차시 메뉴가 없음) */
export function lessonKindOf(scope: string): LessonScopeKind | null {
  const ref = parseScope(scope);
  if (!ref) return null;
  if (ref.kind === "세특") return "offering";
  if (ref.kind === "동아리") return "club";
  if (ref.kind === "자율·자치" || ref.kind === "진로") return "homeroom";
  return null;
}

/** 차시 메모를 남기는 메모 범위 (세특: record_memos). 조각 칸 · 생기부 조각이 "차시" 칩으로 보여 준다 */
export const lessonScope = (scope: string) => `${scope}#차시`;
export const isLessonScope = (scope: string) => scope.endsWith("#차시");

// ---------- 날짜 읽기 ----------

const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * 날짜 칸 → "YYYY-MM-DD" (못 읽으면 null = 확인 필요).
 * "2026-03-04" · "2026.3.4" · "2026. 3. 4." · "3.4" · "03/04" · "3월 4일" · "3/4(화)". 연도가 없으면 학년도(3월~이듬해 2월)로.
 */
export function parseLessonDate(cell: string | null | undefined, year: number): string | null {
  const s = String(cell ?? "").trim().replace(/\([^)]*\)/g, "").trim();
  if (!s) return null;
  let m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/.exec(s);
  if (m) {
    const mo = +m[1];
    return valid(mo <= 2 ? year + 1 : year, mo, +m[2]);
  }
  return null;
}

// ---------- 엑셀 양식 ----------

/** 양식 본문 줄(차시 · 날짜 · 활동명 · 활동 내용) → 확인 화면 행. 활동명 없는 줄은 건너뛴다 */
export function lessonsFromTemplate(body: { line: number; cells: string[] }[], year: number): { items: LessonDraft[]; skipped: number[] } {
  const items: LessonDraft[] = [];
  const skipped: number[] = [];
  for (const { line, cells } of body) {
    const [no, date, title, detail] = cells;
    const t = cleanActivity(title);
    if (!t) { skipped.push(line); continue; }
    items.push({ no: Number.parseInt(no, 10) || 0, date: parseLessonDate(date, year), title: t, detail: String(detail ?? "").trim().slice(0, DETAIL_MAX) });
  }
  return { items: normalizeLessons(items), skipped };
}

/** 다듬기: 활동명 40자 · 내용 200자 · 차시 번호가 없거나 겹치면 순서대로 · 최대 80차시 */
export function normalizeLessons(items: readonly LessonDraft[]): LessonDraft[] {
  const out: LessonDraft[] = [];
  const used = new Set<number>();
  let next = 1;
  for (const it of items.slice(0, LESSON_MAX)) {
    const title = cleanActivity(it.title).slice(0, ACTIVITY_MAX);
    if (!title) continue;
    let no = Number.isInteger(it.no) && it.no > 0 && it.no < 1000 && !used.has(it.no) ? it.no : 0;
    if (!no) { while (used.has(next)) next++; no = next; }
    used.add(no);
    next = Math.max(next, no + 1);
    out.push({ ...(it.id ? { id: it.id } : {}), no, date: it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null, title, detail: String(it.detail ?? "").replace(/\s+/g, " ").trim().slice(0, DETAIL_MAX) });
  }
  return out;
}

/** 날짜를 못 찾은 행 수 (확인 필요) */
export const needDate = (items: readonly { date: string | null }[]) => items.filter((i) => !i.date).length;

// ---------- 칩 순서 ----------

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/** 오늘에 가까운 차시부터 (지난 차시가 같은 거리면 지난 것 먼저), 날짜 없는 차시는 뒤에 번호 순 */
export function nearToday<T extends { no: number; date: string | null }>(items: readonly T[], today: string): T[] {
  return [...items].sort((a, b) => {
    if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : a.no - b.no;
    const da = dayDiff(a.date, today), db = dayDiff(b.date, today);
    return Math.abs(da) - Math.abs(db) || da - db || a.no - b.no;
  });
}

/** 반 단위 카드의 "오늘 차시": 오늘 날짜 차시, 없으면 오늘 이전 마지막 차시, 그것도 없으면 첫 차시 */
export function currentLesson<T extends { no: number; date: string | null }>(items: readonly T[], today: string): T | undefined {
  const dated = items.filter((i) => i.date).sort((a, b) => a.date!.localeCompare(b.date!));
  return dated.find((i) => i.date === today) ?? [...dated].reverse().find((i) => i.date! <= today) ?? [...items].sort((a, b) => a.no - b.no)[0];
}

/** 번호 순 (전체 차시 목록) */
export const byNo = <T extends { no: number }>(items: readonly T[]) => [...items].sort((a, b) => a.no - b.no);

/** "10.14" */
export const lessonMd = (d: string | null) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");

/** 남길 메모 날짜: 차시 날짜, 없으면 오늘 */
export const lessonDate = (item: { date: string | null } | null | undefined, today: string) => item?.date ?? today;

// ---------- 여러 학생에게 ----------

/** "전체 고르기": 이 차시 메모가 아직 없는 학생만 */
export function pickAllWithout(studentIds: readonly string[], marks: readonly { itemId: string; studentId: string }[], itemId: string): string[] {
  const done = new Set(marks.filter((m) => m.itemId === itemId).map((m) => m.studentId));
  return studentIds.filter((id) => !done.has(id));
}

/** 이 학생이 메모를 남긴 차시 id */
export function doneItems(marks: readonly { itemId: string; studentId: string }[], studentId: string): string[] {
  return [...new Set(marks.filter((m) => m.studentId === studentId).map((m) => m.itemId))];
}

// ---------- ② AI로 쓰기 배경 ----------

/** 고른 메모의 활동명("[빗면 실험] …")과 같은 차시의 활동 내용 → "수업 활동 배경" 줄 (학생 행동이 아님) */
export function lessonBackground(items: readonly LessonItem[], pieceTexts: readonly string[]): string[] {
  const names = new Set(pieceTexts.map((t) => /^\s*\[([^\]]+)\]/.exec(t)?.[1]?.trim()).filter(Boolean) as string[]);
  return byNo(items)
    .filter((i) => names.has(i.title) && i.detail.trim())
    .slice(0, 8)
    .map((i) => `${i.no}차시${i.date ? `(${lessonMd(i.date)})` : ""} ${i.title}: ${i.detail.trim()}`);
}

// ---------- 운영계획서 가리기 (AI에 보내기 전) ----------

/** 계획서 글에 학교 학생 이름 · 학번이 섞여 있으면 가린다 (이름 → "학생", 5자리 학번 → "학번"). 가린 수만 센다 */
export function scrubPeople(text: string, people: readonly { name: string; studentNo?: string }[]): { text: string; removed: number } {
  let out = text;
  let removed = 0;
  const names = [...new Set(people.map((p) => p.name.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of names) {
    const parts = out.split(n);
    removed += parts.length - 1;
    out = parts.join("학생");
  }
  const nos = new Set(people.map((p) => p.studentNo).filter((x): x is string => !!x && /^\d{5}$/.test(x)));
  out = out.replace(/(?<!\d)\d{5}(?!\d)/g, (m) => (nos.has(m) ? (removed++, "학번") : m));
  return { text: out, removed };
}

// ---------- 운영계획서 규칙 읽기 (AI 키가 없을 때 · "자동") ----------

const DATE_RE = /(\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}\s*[.일]?|\d{1,2}\s*[./월]\s*\d{1,2}\s*일?)(?:\s*\([^)]*\))?/;
const NO_RE = /^(\d{1,2})\s*(?:차시|회차|회|주차|주)?\.?$/;

/**
 * 표 줄("5 | 10.14 | 빗면 실험 | 경사각을 …")이나 "5차시 10.14 빗면 실험: …" 줄에서 차시를 뽑는다.
 * 차시 번호로 시작하는 줄만 읽는다 (제목 · 평가 계획 줄은 건너뜀). 못 읽으면 [].
 */
export function lessonsFromText(text: string, year: number): LessonDraft[] {
  const out: LessonDraft[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let cells = line.includes("|") ? line.split("|").map((c) => c.trim()).filter(Boolean) : [];
    if (!cells.length) {
      const m = /^(\d{1,2})\s*(?:차시|회차|주차)[.)]?\s+(.*)$/.exec(line);
      if (!m) continue;
      const rest = m[2];
      const d = DATE_RE.exec(rest);
      const body = (d ? rest.replace(d[0], " ") : rest).trim();
      const [title, ...detail] = body.split(/\s*[:：–-]\s+|\s{2,}/);
      cells = [m[1], d?.[1] ?? "", title ?? "", detail.join(" ")];
    }
    const n = NO_RE.exec(cells[0]);
    if (!n) continue;
    const restCells = cells.slice(1);
    const di = restCells.findIndex((c) => DATE_RE.test(c) && c.replace(DATE_RE, "").trim().length <= 2);
    const date = di >= 0 ? parseLessonDate(DATE_RE.exec(restCells[di])![1], year) : null;
    // "미정" · "-" 같은 날짜 자리 글은 날짜 없음으로 건너뛴다
    const blank = di < 0 ? restCells.findIndex((c) => /^(?:미정|추후|미확정|[-–—·]|tbd)$/i.test(c)) : -1;
    const words = restCells.filter((_, i) => i !== di && i !== blank);
    if (!words[0]) continue;
    out.push({ no: +n[1], date, title: words[0], detail: words.slice(1).join(" · ") });
  }
  return normalizeLessons(out);
}

// ---------- 운영계획서 AI 결과 다듬기 ----------

/** AI가 돌려준 행 → 확인 화면 행 (날짜 글자는 다시 읽는다 — 모르면 null) */
export function lessonsFromAi(rows: readonly { no?: number | null; date?: string | null; title?: string | null; detail?: string | null }[], year: number): LessonDraft[] {
  return normalizeLessons(rows.map((r) => ({
    no: Number(r.no) || 0,
    date: r.date ? parseLessonDate(r.date, year) : null,
    title: String(r.title ?? ""),
    detail: String(r.detail ?? ""),
  })));
}
