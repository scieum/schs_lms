import { UserPlus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, ButtonLink, Card, Row, StatTiles } from "@/components/ui";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "학생 · 속초고등학교 학생관리시스템" };

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
        <Card>
          {students.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">아직 등록된 학생이 없어요</p>
          ) : (
            students.map((s, i) => (
              <Row
                key={s.id}
                last={i === students.length - 1}
                lead={<Avatar name={s.name} />}
                title={s.name}
                meta={`${s.grade}학년 ${s.classNo}반 ${s.number}번 · 학번 ${s.studentNo}`}
                right={<span className="text-[13px] font-medium text-key-strong">{s.pseudonymId}</span>}
              />
            ))
          )}
        </Card>
      </PageBody>
    </>
  );
}
