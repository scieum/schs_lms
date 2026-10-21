import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { isAdmin } from "@/lib/domain/policy";
import { schoolYear } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { listMyJoint } from "@/lib/server/joint";
import { type JointRow } from "./joint-card";
import { semesterOf } from "@/lib/domain/writing";
import { RosterBox, type RosterCourse } from "./roster-box";
import { SubjectsForm } from "./subjects-form";
import { TeacherPicker } from "./teacher-picker";

export const metadata = { title: "내 수업 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ teacher?: string }> };

export default async function SubjectsPage({ searchParams }: Props) {
  const v = await requireCan("subjects.assign");
  const admin = isAdmin(v);
  const { teacher } = await searchParams;
  // 관리자만 다른 교사를 고를 수 있다. URL에는 이름 대신 계정 id(UUID)만 쓴다 (C3)
  const teachers = admin ? await repo.listTeachers() : [];
  const target = admin && teacher && teachers.some((t) => t.id === teacher) ? teacher : v.accountId;

  const [groups, all, courses, students, rosters, joint] = await Promise.all([
    repo.getTeacherGroups(target),
    repo.listTeacherCourses(target),
    repo.listCourses(schoolYear()),
    repo.listStudents(),
    repo.listCourseRosters(target),
    target === v.accountId ? listMyJoint(target) : Promise.resolve([]),
  ]);
  // 공동교육과정 수업(N54)은 아래 카드에서만 다룬다 — 편제표 과목 배정 폼 · 이동반 명단에는 안 넣는다
  const assigned = all.filter((a) => courses.some((c) => c.id === a.courseId));
  const jointRows: JointRow[] = joint.map((j) => ({
    id: j.course.id, kind: j.course.joint!, subject: j.course.subject, grade: j.course.grade, semester: j.course.semester,
    own: j.own.map((s) => s.id), external: j.external.map((s) => ({ id: s.id, school: s.school!, grade: s.grade, classNo: s.classNo, number: s.number, name: s.name })),
  }));
  // 이동반 명단 칸: 이동반 과목마다 분반별 (학년·학기 순)
  const rosterCourses: RosterCourse[] = assigned.flatMap((a) => {
    const c = courses.find((x) => x.id === a.courseId);
    if (!c || a.mode !== "moving" || !a.sections?.length) return [];
    const rs = rosters.filter((x) => x.courseId === c.id);
    return [{ id: c.id, label: c.subject, grade: c.grade, meta: `${c.grade}학년 ${c.semester}학기 · ${c.type ?? "직접 입력"}`, sections: a.sections.map((name) => ({ name, count: rs.find((r) => r.section === name)?.studentIds.length ?? 0, ids: rs.find((r) => r.section === name)?.studentIds ?? [] })) }];
  });
  const fixed = assigned.filter((a) => a.mode !== "moving").map((a) => {
    const c = courses.find((x) => x.id === a.courseId);
    return c ? `${c.subject} ${a.classes.join(", ")}반` : null;
  }).filter(Boolean);
  // 학년별 반 목록: 등록된 학생 기준, 없으면 1~8반
  const classesByGrade: Record<number, number[]> = {};
  for (const g of [1, 2, 3]) {
    const set = [...new Set(students.filter((s) => s.grade === g).map((s) => s.classNo))].sort((a, b) => a - b);
    classesByGrade[g] = set.length ? set : [1, 2, 3, 4, 5, 6, 7, 8];
  }

  return (
    <>
      <PageHeader
        title={target === v.accountId ? "내 수업" : "수업 지정"}
        actions={admin ? <ButtonLink href="/admin/curriculum" kind="outline" size="sm">편제표</ButtonLink> : undefined}
      />
      <PageBody>
        {admin && <TeacherPicker teachers={teachers.map((t) => ({ id: t.id, name: t.name }))} value={target} />}
        {courses.length === 0 && (
          <p className="rounded-inner bg-wait-soft px-4 py-3 text-sm text-[#9a6400]">
            편제표에 과목이 없어요. {admin ? "편제표에서 먼저 과목을 넣어 주세요" : "관리자 선생님께 편제표 입력을 요청해 주세요"}
          </p>
        )}
        {/* key: 교사를 바꾸면 폼 상태를 새로 시작 */}
        <RosterBox
          teacherId={target}
          courses={rosterCourses}
          fixedNote={fixed.length ? fixed.join(" · ") : null}
          students={rosterCourses.length ? students.map((s) => ({ id: s.id, studentNo: s.studentNo, grade: s.grade, classNo: s.classNo, number: s.number, name: s.name })) : []}
        />
        <SubjectsForm
          key={target} teacherId={target} initialGroups={groups} initialCourses={assigned} courses={courses} classesByGrade={classesByGrade}
          semester={semesterOf()}
          joint={target === v.accountId ? { rows: jointRows, students: students.map((s) => ({ id: s.id, studentNo: s.studentNo, grade: s.grade, classNo: s.classNo, number: s.number, name: s.name })) } : undefined}
        />
      </PageBody>
    </>
  );
}
