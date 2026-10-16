// 교과 세특: 과목별·학생별 기록. 고칠 때마다 새 버전을 추가하고 지우거나 덮어쓰지 않는다 (C4).
import type { Course, TeacherCourse } from "./curriculum";
import type { LengthUnit } from "./length";
import type { Student } from "./types";

export type SetukStatus = "draft" | "confirmed";

export interface SetukRecord {
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

/** 과목을 듣는 학생: 과목 학년 + 내가 맡은 반 (선택과목 수강 명단은 다음 단계) */
/** 과목 담당 학생. 이동반 명단(roster)이 있으면 명단대로, 없으면 맡은 반 학생 */
export function studentsInCourse(students: Student[], course: Course, assignment: TeacherCourse | undefined, roster?: string[] | null): Student[] {
  if (!assignment) return [];
  if (roster?.length) {
    const ids = new Set(roster);
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
