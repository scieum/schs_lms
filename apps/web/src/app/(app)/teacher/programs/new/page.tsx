import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { addDays } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { programFormOptions } from "../_lib/form-data";
import { ProgramForm } from "./program-form";

export const metadata = { title: "프로그램 등록 · 속초고등학교 학생관리시스템" };

export default async function NewProgramPage() {
  const v = await requireCan("program.manage");
  const { students, teachers } = await programFormOptions();
  const t = today();
  return (
    <>
      <PageHeader title="프로그램 등록" actions={<span className="hidden md:block"><Button form="program-form" name="intent" value="draft" kind="outline" size="sm">임시 저장</Button></span>} />
      <PageBody>
        <ProgramForm today={t} end={addDays(t, 7)} aiOn={aiEnabled()} students={students} teachers={teachers} ownerId={v.accountId} />
      </PageBody>
    </>
  );
}
