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
export function studentsInCourse(students: Student[], course: Course, assignment: TeacherCourse | undefined, rosters?: SectionRoster[] | null, section?: string | null): Student[] {
  if (!assignment) return [];
  if (assignment.mode === "moving") {
    const list = (rosters ?? []).filter((r) => (assignment.sections ?? []).includes(r.section) && (!section || r.section === section));
    const ids = new Set(list.flatMap((r) => r.studentIds));
    return students.filter((s) => ids.has(s.id)).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  }
  const classes = new Set(assignment?.classes ?? []);
  return students
    .filter((s) => s.grade === course.grade && classes.has(s.classNo))
    .sort((a, b) => a.classNo - b.classNo || a.number - b.number);
}

export function statusLabel(r: SetukRecord | undefined): "미작성" | "작성 중" | "확정" {
  if (!r || !r.content.trim()) return "미작성";
  return r.status === "confirmed" ? "확정" : "작성 중";
}
