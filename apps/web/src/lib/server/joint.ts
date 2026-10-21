import "server-only";
import { schoolYear, type Course, type SubjectGroup } from "@/lib/domain/curriculum";
import { checkExternal, JOINT_SECTION, type ExternalInput, type JointKind } from "@/lib/domain/joint-curriculum";
import { nextPseudonymIds } from "@/lib/domain/roster";
import type { Student } from "@/lib/domain/types";
import { repo } from "./repo";

// 공동교육과정 수업 (Figma N54): 내 수업에서 만드는 편제표 밖 과목 + 우리 학교 · 다른 학교 학생 명단.
// 저장은 기존 틀 그대로 — 과목(school_courses, joint) · 배정(teacher_courses, 이동반 분반 "공동") · 명단(course_rosters).
// 그래서 세특 조각 모으기 · 글 짓기 · 글 모아 보기 · 내보내기에 다른 과목과 똑같이 나온다.

export type JointClass = { course: Course; own: Student[]; external: Student[] };

export type JointSave = {
  id?: string;
  kind: JointKind;
  subject: string;
  grade: number;
  semester: 1 | 2;
  ownIds: string[];
  external: ExternalInput[];
};

/** 내가 만든 공동교육과정 수업과 명단 (학년 · 학기 · 과목 순) */
export async function listMyJoint(teacherId: string): Promise<JointClass[]> {
  const [courses, rosters, students] = await Promise.all([
    repo.listCourses(schoolYear(), { joint: true }), repo.listCourseRosters(teacherId), repo.listStudents({ external: true }),
  ]);
  const byId = new Map(students.map((s) => [s.id, s]));
  return courses
    .filter((c) => c.joint && c.ownerId === teacherId)
    .map((course) => {
      const ids = rosters.find((r) => r.courseId === course.id && r.section === JOINT_SECTION)?.studentIds ?? [];
      const list = ids.map((id) => byId.get(id)).filter((s): s is Student => !!s).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
      return { course, own: list.filter((s) => !s.school), external: list.filter((s) => !!s.school) };
    });
}

/** 만들기 · 고치기. 다른 학교 학생은 새로 만들거나(id 없음) 고친다. 명단에서 뺀 학생 기록은 지우지 않는다 (C4) */
export async function saveJoint(teacherId: string, input: JointSave): Promise<{ course: Course; count: number }> {
  const subject = input.subject.trim().replace(/\s+/g, " ");
  if (!subject || subject.length > 40) throw new Error("과목 이름을 써 주세요");
  if (!(input.grade >= 1 && input.grade <= 3)) throw new Error("학년을 골라 주세요");
  if (input.semester !== 1 && input.semester !== 2) throw new Error("학기를 골라 주세요");
  for (const e of input.external) { const p = checkExternal(e); if (p) throw new Error(`${e.name || "다른 학교 학생"}: ${p}`); }
  const year = schoolYear();

  // 과목
  let course: Course;
  if (input.id) {
    const c = await repo.getCourse(input.id);
    if (!c?.joint || c.ownerId !== teacherId) throw new Error("내가 만든 공동교육과정 수업만 고칠 수 있어요");
    await repo.updateCourse(c.id, { subject, grade: input.grade, semester: input.semester, joint: input.kind });
    course = { ...c, subject, grade: input.grade, semester: input.semester, joint: input.kind };
  } else {
    const groups = await repo.getTeacherGroups(teacherId);
    const group: SubjectGroup = groups[0] ?? "교양";
    course = await repo.createCourse({ year, grade: input.grade, semester: input.semester, subject, group, type: null, credits: 1, joint: input.kind, ownerId: teacherId });
  }

  // 학생: 우리 학교는 등록된 학생만, 다른 학교는 이 수업 명단에 있던 학생만 고칠 수 있다
  const [own, rosters, all] = await Promise.all([repo.listStudents(), repo.getCourseRosters(teacherId, course.id), repo.listStudents({ external: true })]);
  const ownIds = new Set(own.map((s) => s.id));
  const before = new Set(rosters.find((r) => r.section === JOINT_SECTION)?.studentIds ?? []);
  const known = new Map(all.filter((s) => s.school && before.has(s.id)).map((s) => [s.id, s]));
  const keepOwn = [...new Set(input.ownIds)].filter((id) => ownIds.has(id));
  const ext: string[] = [];
  const fresh: ExternalInput[] = [];
  for (const e of input.external) {
    const was = e.id ? known.get(e.id) : undefined;
    if (was) {
      if (was.school !== e.school.trim() || was.grade !== e.grade || was.classNo !== e.classNo || was.number !== e.number || was.name !== e.name.trim()) await repo.updateExternalStudent(was.id, e);
      ext.push(was.id);
    } else fresh.push(e);
  }
  if (fresh.length) {
    const pids = nextPseudonymIds(await repo.existingPseudonymIds(), fresh.length);
    const made = await repo.createExternalStudents(fresh.map((e, i) => ({ ...e, pseudonymId: pids[i] })));
    ext.push(...made.map((s) => s.id));
  }
  const ids = [...keepOwn, ...ext];
  await repo.setCourseRoster(teacherId, course.id, JOINT_SECTION, ids);

  // 배정: 이동반 분반 "공동" 하나 (내 수업 폼의 다른 배정은 그대로)
  const mine = await repo.listTeacherCourses(teacherId);
  if (!mine.some((a) => a.courseId === course.id)) {
    await repo.setTeacherCourses(teacherId, [...mine, { teacherId, courseId: course.id, classes: [], mode: "moving", sections: [JOINT_SECTION] }]);
  }
  return { course, count: ids.length };
}

/** 수업 지우기: 과목을 내리고(active=false) 배정 · 명단을 뺀다. 써 둔 세특은 남는다 */
export async function deleteJoint(teacherId: string, courseId: string): Promise<Course> {
  const c = await repo.getCourse(courseId);
  if (!c?.joint || c.ownerId !== teacherId) throw new Error("내가 만든 공동교육과정 수업만 지울 수 있어요");
  await repo.setCourseRoster(teacherId, c.id, JOINT_SECTION, []);
  await repo.setTeacherCourses(teacherId, (await repo.listTeacherCourses(teacherId)).filter((a) => a.courseId !== c.id));
  await repo.archiveCourse(c.id);
  return c;
}
