import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { today } from "@/lib/domain/activity";
import { addDays } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { programFormOptions } from "../_lib/form-data";
import { ProgramForm } from "./program-form";

export const metadata = { title: "프로그램 등록 · 속초고 쌤기부" };

export default async function NewProgramPage() {
  const v = await requireCan("program.manage");
  const { students, teachers } = await programFormOptions();
  const t = today();
  return (
    <>
      {/* 모바일은 마법사 머리(뒤로 · 제목 · 임시 저장)가 대신한다. PC 제출 버튼은 5 확인 섹션에 */}
      <div className="hidden md:block"><PageHeader title="프로그램 등록" /></div>
      <PageBody>
        <ProgramForm today={t} end={addDays(t, 7)} aiOn={aiEnabled()} students={students} teachers={teachers} ownerId={v.accountId} />
      </PageBody>
    </>
  );
}
