import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { addDays } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireProgram } from "../../_lib/data";
import { programFormOptions } from "../../_lib/form-data";
import { ProgramForm } from "../../new/program-form";

export const metadata = { title: "프로그램 수정 · 속초고등학교 학생관리시스템" };

/** 프로그램 수정: 담당 교사(등록·공동)와 관리자만 */
export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { program } = await requireProgram(id);
  const { students, teachers } = await programFormOptions();
  const t = today();
  return (
    <>
      {/* 모바일은 마법사 머리(뒤로 · 제목)가 대신한다 */}
      <div className="hidden md:block"><PageHeader title="프로그램 수정" actions={<ButtonLink href={`/teacher/programs/${id}`} kind="outline" size="sm">취소</ButtonLink>} /></div>
      <PageBody>
        <ProgramForm today={t} end={addDays(t, 7)} aiOn={aiEnabled()} students={students} teachers={teachers} ownerId={program.ownerId} initial={program} />
      </PageBody>
    </>
  );
}
