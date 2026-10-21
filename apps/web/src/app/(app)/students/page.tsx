import { UserPlus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, StatTiles } from "@/components/ui";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { StudentSearch } from "./student-search";

export const metadata = { title: "학생 · 속초고 쌤기부" };

export default async function StudentsPage() {
  await requireCan("student.list");
  const students = await repo.listStudents();
  const byGrade = [1, 2, 3].map((g) => students.filter((s) => s.grade === g).length);
  return (
    <>
      <PageHeader
        title="학생"
        actions={<ButtonLink href="/students/new" size="sm"><UserPlus size={14} /> 학생 등록</ButtonLink>}
      />
      <PageBody>
        <StatTiles items={[["전체", `${students.length}명`], ["1학년", `${byGrade[0]}명`], ["2학년", `${byGrade[1]}명`], ["3학년", `${byGrade[2]}명`]]} />
        <StudentSearch
          aiOn={aiEnabled()}
          students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, classNo: s.classNo, number: s.number, gender: s.gender, studentNo: s.studentNo, pseudonymId: s.pseudonymId }))}
        />
      </PageBody>
    </>
  );
}
