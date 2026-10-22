// 교과 세특: 과목별·학생별 기록. 고칠 때마다 새 버전을 추가하고 지우거나 덮어쓰지 않는다 (C4).
import type { Course, TeacherCourse } from "./curriculum";
import type { LengthUnit } from "./length";
import type { Student } from "./types";
import type { RecordProv } from "./provenance";

export type SetukStatus = "draft" | "confirmed";

export interface SetukRecord extends RecordProv {
  id: string;
  courseId: string;
  studentId: string;
  authorId: string;
  content: string;
  unit: LengthUnit;
  max: number;
  status: SetukStatus;
  createdAt: string; // ISO
}

/** 학생별 마지막 버전만 남긴다 */
export function latestByStudent(records: SetukRecord[]): Map<string, SetukRecord> {
  const m = new Map<string, SetukRecord>();
  for (const r of records) {
    const prev = m.get(r.studentId);
    if (!prev || prev.createdAt < r.createdAt) m.set(r.studentId, r);
  }
  return m;
}

export type SectionRoster = { section: string; studentIds: string[] };

/**
 * 과목 담당 학생.
 * - 이동반: 분반 명단대로. section 을 주면 그 분반만, 없으면 모든 분반을 합쳐서
 * - 고정반: 과목 학년 + 맡은 반
 */
/** 고정반 반 이름 ("3반") ↔ 반 번호 */
export const classSection = (n: number) => `${n}반`;
const classOfSection = (s: string | null | undefined) => { const m = s?.match(/^(\d+)반$/); return m ? Number(m[1]) : null; };

/**
 * 탭 · 범위로 나눌 칸 (2026-10-22 "고정반이지만 반은 따로따로"): 이동반 = 분반마다, 고정반 = 반이 둘 이상이면 반마다("1반" · "2반"), 하나면 [null].
 */
export function courseSections(a: TeacherCourse): (string | null)[] {
  if (a.mode === "moving" && a.sections?.length) return a.sections;
  return a.classes.length > 1 ? [...a.classes].sort((x, y) => x - y).map(classSection) : [null];
}

/** 이 담당(분반 · 고정반 반)에 있는 칸인가 */
export function sectionAllowed(a: TeacherCourse, section: string | null | undefined): boolean {
  if (!section) return true;
  if (a.mode === "moving") return (a.sections ?? []).includes(section);
  const n = classOfSection(section);
  return n !== null && a.classes.includes(n);
}

export function studentsInCourse(students: Student[], course: Course, assignment: TeacherCourse | undefined, rosters?: SectionRoster[] | null, section?: string | null): Student[] {
  if (!assignment) return [];
  if (assignment.mode === "moving") {
    const list = (rosters ?? []).filter((r) => (assignment.sections ?? []).includes(r.section) && (!section || r.section === section));
    const ids = new Set(list.flatMap((r) => r.studentIds));
    return students.filter((s) => ids.has(s.id)).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  }
  // 고정반 "3반" 칸이면 그 반만
  const one = classOfSection(section);
  const classes = new Set(one !== null && assignment.classes.includes(one) ? [one] : assignment?.classes ?? []);
  // 고정반은 본교 반 그대로 (다른 학교 학생은 공동교육과정 명단에만)
  return students
    .filter((s) => !s.school && s.grade === course.grade && classes.has(s.classNo))
    .sort((a, b) => a.classNo - b.classNo || a.number - b.number);
}

export function statusLabel(r: SetukRecord | undefined): "미작성" | "작성 중" | "확정" {
  if (!r || !r.content.trim()) return "미작성";
  return r.status === "confirmed" ? "확정" : "작성 중";
}
