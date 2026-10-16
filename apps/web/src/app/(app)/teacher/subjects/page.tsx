import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { isAdmin } from "@/lib/domain/policy";
import { schoolYear } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { SubjectsForm } from "./subjects-form";
import { TeacherPicker } from "./teacher-picker";

export const metadata = { title: "내 교과·과목 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ teacher?: string }> };

export default async function SubjectsPage({ searchParams }: Props) {
  const v = await requireCan("subjects.assign");
  const admin = isAdmin(v);
  const { teacher } = await searchParams;
  // 관리자만 다른 교사를 고를 수 있다. URL에는 이름 대신 계정 id(UUID)만 쓴다 (C3)
  const teachers = admin ? await repo.listTeachers() : [];
  const target = admin && teacher && teachers.some((t) => t.id === teacher) ? teacher : v.accountId;

  const [groups, assigned, courses, students] = await Promise.all([
    repo.getTeacherGroups(target),
    repo.listTeacherCourses(target),
    repo.listCourses(schoolYear()),
    repo.listStudents(),
  ]);
  // 학년별 반 목록: 등록된 학생 기준, 없으면 1~8반
  const classesByGrade: Record<number, number[]> = {};
  for (const g of [1, 2, 3]) {
    const set = [...new Set(students.filter((s) => s.grade === g).map((s) => s.classNo))].sort((a, b) => a - b);
    classesByGrade[g] = set.length ? set : [1, 2, 3, 4, 5, 6, 7, 8];
  }

  return (
    <>
      <PageHeader
        title={target === v.accountId ? "내 교과·과목" : "교과·과목 지정"}
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
        <SubjectsForm key={target} teacherId={target} initialGroups={groups} initialCourses={assigned} courses={courses} classesByGrade={classesByGrade} />
      </PageBody>
    </>
  );
}
