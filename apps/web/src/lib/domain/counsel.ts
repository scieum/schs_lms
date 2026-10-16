// 상담 기록 · 전년도 확정 생기부 · 정정 요청 · 추천. 순수 규칙만 둔다 (판정·필터·계산).
// 상담 기록과 확정본은 추가만 한다 (C4). 고칠 때는 prevId 로 이전 버전을 가리키는 새 기록을 더한다.
import { isAdmin } from "./policy";
import type { Student, Viewer } from "./types";

// ---------- 상담 기록 ----------

export const COUNSEL_AREAS = ["진로", "학습", "생활"] as const;
export type CounselArea = (typeof COUNSEL_AREAS)[number];

export interface CounselRecord {
  id: string;
  studentId: string;
  authorId: string;
  area: CounselArea;
  date: string; // YYYY-MM-DD
  content: string;
  /** 고친 기록이면 이전 버전 id (C4: 덮어쓰지 않는다) */
  prevId: string | null;
  createdAt: string; // ISO
}

export function isCounselArea(v: string): v is CounselArea {
  return (COUNSEL_AREAS as readonly string[]).includes(v);
}

/** 담임이 이 학생의 반을 맡고 있나 */
export function isHomeroomOf(v: Viewer, student: Pick<Student, "grade" | "classNo">): boolean {
  if (v.kind !== "teacher") return false;
  const h = v.teacher.homeroom;
  return !!h && h.grade === student.grade && h.classNo === student.classNo;
}

/**
 * 상담 기록 열람 (C6, PRD §7)
 * - 학생: 불가
 * - 관리자: 전체
 * - 담임: 자기 반 학생 기록 전체 (다른 교사 작성분 포함)
 * - 그 밖의 교사: 자기가 쓴 기록만
 */
export function canReadCounsel(v: Viewer, record: Pick<CounselRecord, "authorId">, student: Pick<Student, "grade" | "classNo">): boolean {
  if (v.kind !== "teacher" || v.mustChangePassword) return false;
  if (isAdmin(v)) return true;
  if (isHomeroomOf(v, student)) return true;
  return record.authorId === v.accountId;
}

/** 기록을 쓸 수 있나: 교사만 (담당 여부는 화면에서 고른 학생 목록으로 거른다) */
export function canWriteCounsel(v: Viewer): boolean {
  return v.kind === "teacher" && !v.mustChangePassword;
}

/** 볼 수 있는 기록만 남긴다. 학생을 모르는 기록은 버린다 */
export function visibleCounsel(v: Viewer, records: CounselRecord[], students: Map<string, Pick<Student, "grade" | "classNo">>): CounselRecord[] {
  return records.filter((r) => {
    const s = students.get(r.studentId);
    return !!s && canReadCounsel(v, r, s);
  });
}

/** 고쳐진(뒤 버전이 있는) 기록은 숨기고 마지막 버전만, 날짜 최신순 */
export function latestCounsel(records: CounselRecord[]): CounselRecord[] {
  const replaced = new Set(records.map((r) => r.prevId).filter(Boolean));
  return records
    .filter((r) => !replaced.has(r.id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** 이번 주(월요일 시작) 첫날 YYYY-MM-DD */
export function weekStart(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - day);
  return ymd(d);
}

/** 이번 학기 첫날: 3~8월 = 3월 1일, 9~2월 = 9월 1일 */
export function semesterStart(now = new Date()): string {
  const m = now.getMonth(); // 0=1월
  if (m >= 2 && m <= 7) return `${now.getFullYear()}-03-01`;
  const y = m >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-09-01`;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface CounselStats {
  students: number;
  semester: number;
  week: number;
  none: number;
}

/** 숫자 타일: 담당 학생 수 · 이번 학기 상담 · 이번 주 · 기록 없는 학생 */
export function counselStats(studentIds: string[], records: CounselRecord[], now = new Date()): CounselStats {
  const ids = new Set(studentIds);
  const mine = records.filter((r) => ids.has(r.studentId));
  const sem = semesterStart(now);
  const wk = weekStart(now);
  const has = new Set(mine.map((r) => r.studentId));
  return {
    students: ids.size,
    semester: mine.filter((r) => r.date >= sem).length,
    week: mine.filter((r) => r.date >= wk).length,
    none: [...ids].filter((id) => !has.has(id)).length,
  };
}

export function countByStudent(records: CounselRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records) m.set(r.studentId, (m.get(r.studentId) ?? 0) + 1);
  return m;
}

/**
 * 교사의 담당 학생: 관리자 = 전체, 그 밖 = 우리 반 + 맡은 과목의 반 + 지도 동아리 부원 + 내가 상담한 학생
 * (선택과목 수강 명단은 다음 단계 — 지금은 과목 학년 + 맡은 반)
 */
export function assignedStudents(
  v: Viewer,
  students: Student[],
  ctx: { courseClasses: { grade: number; classes: number[] }[]; clubMemberIds: Iterable<string>; counseledIds: Iterable<string> },
): Student[] {
  if (v.kind !== "teacher") return [];
  const sorted = [...students].sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  if (isAdmin(v)) return sorted;
  const club = new Set(ctx.clubMemberIds);
  const counseled = new Set(ctx.counseledIds);
  return sorted.filter(
    (s) =>
      isHomeroomOf(v, s) ||
      club.has(s.id) ||
      counseled.has(s.id) ||
      ctx.courseClasses.some((c) => c.grade === s.grade && c.classes.includes(s.classNo)),
  );
}

/** 담임(자기 반)·관리자만 학생 기록 모아 보기 */
export function canViewStudentRecord(v: Viewer, student: Pick<Student, "grade" | "classNo">): boolean {
  if (v.kind !== "teacher" || v.mustChangePassword) return false;
  return isAdmin(v) || isHomeroomOf(v, student);
}

// ---------- 확정 생기부 (학생 열람) ----------

export const RECORD_AREAS = ["자율활동", "동아리활동", "진로활동", "교과세특"] as const;
export type RecordArea = (typeof RECORD_AREAS)[number];

/** 학년도가 끝나 확정된 생기부 한 칸 */
export interface PastRecord {
  id: string;
  studentId: string;
  year: number; // 학년도
  grade: number; // 그때 학년
  area: RecordArea;
  /** 활동 이름 또는 과목 이름 */
  title: string;
  content: string;
  teacherName: string;
  confirmedAt: string; // YYYY-MM-DD
}

export function isRecordArea(v: string): v is RecordArea {
  return (RECORD_AREAS as readonly string[]).includes(v);
}

/**
 * 학생이 볼 수 있는 학년도인가 (C5): 지난 학년도만.
 * 올해 기록은 초안·확정 모두 학생에게 보이지 않는다.
 */
export function studentCanSeeYear(recordYear: number, currentYear: number): boolean {
  return recordYear < currentYear;
}

/** 학생 본인 + 지난 학년도 기록만 */
export function recordsForStudent(v: Viewer, records: PastRecord[], currentYear: number): PastRecord[] {
  if (v.kind !== "student") return [];
  return records.filter((r) => r.studentId === v.accountId && studentCanSeeYear(r.year, currentYear));
}

/** 학년 탭: 1학년 ~ 지금 학년. 지금 학년은 잠긴다 */
export function gradeTabs(currentGrade: number): { grade: number; locked: boolean }[] {
  return Array.from({ length: Math.max(1, currentGrade) }, (_, i) => ({ grade: i + 1, locked: i + 1 >= currentGrade }));
}

/** 그 학년이었던 학년도 */
export function yearOfGrade(grade: number, currentGrade: number, currentYear: number): number {
  return currentYear - (currentGrade - grade);
}

export function countByArea(records: PastRecord[]): Record<RecordArea, number> {
  const out = { 자율활동: 0, 동아리활동: 0, 진로활동: 0, 교과세특: 0 } as Record<RecordArea, number>;
  for (const r of records) out[r.area] += 1;
  return out;
}

// ---------- 정정 요청 ----------

export interface CorrectionRequest {
  id: string;
  studentId: string;
  recordId: string;
  reason: string;
  status: "requested" | "done";
  createdAt: string;
}

// ---------- 추천 ----------

export const REC_KINDS = ["도서", "대회", "활동", "진로"] as const;
export type RecKind = (typeof REC_KINDS)[number];

export function isRecKind(v: string): v is RecKind {
  return (REC_KINDS as readonly string[]).includes(v);
}

/** 추천 카탈로그 한 항목 (교사·관리자가 넣는다) */
export interface RecItem {
  id: string;
  kind: RecKind;
  title: string;
  /** 짧은 설명: 저자 · 마감일 · 시간 */
  meta: string;
  /** 맞는 진로 키워드. 비어 있으면 모두에게 */
  careers: string[];
  createdBy: string;
  createdAt: string;
}

/** 학생이 담은 항목. AI 추천은 카탈로그에 없을 수 있어 제목·설명을 같이 남긴다 */
export interface RecInterest {
  id: string;
  studentId: string;
  itemId: string | null;
  kind: RecKind;
  title: string;
  meta: string;
  source: "catalog" | "ai";
  createdAt: string;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 희망 진로와 맞는 정도: 키워드가 진로에 들어 있거나 진로가 키워드에 들어 있으면 맞음 */
export function recScore(item: Pick<RecItem, "careers">, careerGoal: string | null): number {
  if (!item.careers.length) return 1;
  const g = norm(careerGoal ?? "");
  if (!g) return 0;
  let best = 0;
  for (const c of item.careers) {
    const k = norm(c);
    if (!k) continue;
    if (k === g) best = Math.max(best, 3);
    else if (g.includes(k) || k.includes(g)) best = Math.max(best, 2);
  }
  return best;
}

/** 희망 진로 기준 추천: 맞는 것만, 점수 높은 순 → 최근 순. 진로가 없으면 공통 항목만 */
export function matchRecs<T extends Pick<RecItem, "careers" | "createdAt">>(items: T[], careerGoal: string | null): T[] {
  return items
    .map((it) => ({ it, s: recScore(it, careerGoal) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.it.createdAt.localeCompare(a.it.createdAt))
    .map((x) => x.it);
}

export function countByKind<T extends { kind: RecKind }>(items: T[]): Record<RecKind, number> {
  const out = { 도서: 0, 대회: 0, 활동: 0, 진로: 0 } as Record<RecKind, number>;
  for (const it of items) out[it.kind] += 1;
  return out;
}

/** 희망 진로 입력 정리: 앞뒤 공백, 40자, 빈 값은 null */
export function cleanCareerGoal(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || null;
}

/** 최근 며칠 안에 넣은 항목인가 ("새로 추가" 태그) */
export function isFresh(createdAt: string, days = 7, now = new Date()): boolean {
  return now.getTime() - Date.parse(createdAt) < days * 86400000;
}
