import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { addDays } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { ProgramForm } from "./program-form";

export const metadata = { title: "프로그램 등록 · 속초고등학교 학생관리시스템" };

export default async function NewProgramPage() {
  await requireCan("program.manage");
  const students = await repo.listStudents();
  const t = today();
  const end = addDays(t, 7);
  return (
    <>
      <PageHeader title="프로그램 등록" actions={<ButtonLink href="/teacher/programs" kind="outline" size="sm">목록</ButtonLink>} />
      <PageBody>
        <ProgramForm
          today={t}
          end={end}
          aiOn={aiEnabled()}
          students={students
            .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number)
            .map((s) => ({ id: s.id, name: s.name, classKey: `${s.grade}-${s.classNo}`, label: `${s.grade}-${s.classNo}-${s.number} ${s.name}` }))}
        />
      </PageBody>
    </>
  );
}
