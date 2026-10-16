// 창체 누가기록과 봉사활동. 누가기록은 추가만 한다 (C4).
import type { Student, Viewer } from "./types";

export const AREAS = ["자율·자치", "동아리", "진로"] as const;
export type ActivityArea = (typeof AREAS)[number];

export interface Club {
  id: string;
  year: number;
  name: string;
  advisorId: string;
}

export interface ActivityLog {
  id: string;
  area: ActivityArea;
  studentId: string;
  authorId: string;
  clubId: string | null;
  date: string; // YYYY-MM-DD
  content: string;
  createdAt: string;
}

/** 쓸 수 있는 영역: 교사는 동아리(맡은 동아리), 담임은 자율·자치·진로(우리 반)까지 */
export function areasFor(v: Viewer): ActivityArea[] {
  if (v.kind !== "teacher") return [];
  return v.teacher.homeroom ? ["동아리", "자율·자치", "진로"] : ["동아리"];
}

export function isAreaOf(v: string): v is ActivityArea {
  return (AREAS as readonly string[]).includes(v);
}

/** 이 학생에게 이 영역 기록을 쓸 수 있나. 동아리는 '내가 지도하는 그 동아리 부원'만 */
export function canLog(
  v: Viewer,
  area: ActivityArea,
  student: Student,
  club?: { advisorId: string; memberIds: Set<string> },
): boolean {
  if (v.kind !== "teacher" || v.mustChangePassword) return false;
  if (area === "동아리") return !!club && club.advisorId === v.accountId && club.memberIds.has(student.id);
  const h = v.teacher.homeroom;
  return !!h && h.grade === student.grade && h.classNo === student.classNo;
}

/** 담임 반 학생 */
export function homeroomStudents(v: Viewer, students: Student[]): Student[] {
  if (v.kind !== "teacher" || !v.teacher.homeroom) return [];
  const { grade, classNo } = v.teacher.homeroom;
  return students.filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
}

// ---------- 봉사활동 ----------

export type ServiceStatus = "sent" | "confirmed";

export interface ServiceRecord {
  id: string;
  studentId: string;
  uploaderId: string;
  /** 봉사 시작일 */
  date: string;
  /** 봉사 마감일. 당일 봉사면 date 와 같다 */
  endDate: string;
  hours: number;
  organization: string;
  activity: string;
  fileName: string;
  mime: string;
  filePath: string;
  status: ServiceStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export const SERVICE_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const SERVICE_MAX_BYTES = 8 * 1024 * 1024;

/** 기간 봉사(여러 날)까지 한 확인서에 적힌 시간의 상한 */
export const SERVICE_MAX_HOURS = 200;

/** 봉사 시간: 0.5시간 단위, 0 초과 SERVICE_MAX_HOURS 이하 */
export function parseHours(raw: string | number | null | undefined): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/시간|h/gi, "").trim());
  if (!Number.isFinite(n) || n <= 0 || n > SERVICE_MAX_HOURS) return null;
  return Math.round(n * 2) / 2;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 봉사 기간 정리: 마감일이 없거나 시작일보다 빠르면 당일 봉사로 본다 */
export function servicePeriod(start: string | null | undefined, end: string | null | undefined): { date: string; endDate: string } | null {
  if (!start || !YMD.test(start)) return null;
  return { date: start, endDate: end && YMD.test(end) && end >= start ? end : start };
}

/** 화면 표시: "2026-10-12" 또는 "2026-10-12 ~ 10-14" (해가 바뀌면 연도까지) */
export function periodLabel(r: { date: string; endDate: string }): string {
  if (!r.endDate || r.endDate === r.date) return r.date;
  return `${r.date} ~ ${r.endDate.slice(0, 4) === r.date.slice(0, 4) ? r.endDate.slice(5) : r.endDate}`;
}

/** 확인서에서 읽은 학번·이름으로 학생 찾기. 학번이 우선, 이름은 한 명일 때만 */
export function matchStudent(students: Student[], hint: { studentNo?: string | null; name?: string | null }): Student | null {
  const no = hint.studentNo?.replace(/\D/g, "");
  if (no) {
    const s = students.find((x) => x.studentNo === no);
    if (s) return s;
  }
  const name = hint.name?.replace(/\s/g, "");
  if (name) {
    const same = students.filter((x) => x.name === name);
    if (same.length === 1) return same[0];
  }
  return null;
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
