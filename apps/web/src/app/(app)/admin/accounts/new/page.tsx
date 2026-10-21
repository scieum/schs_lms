import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { RosterImport } from "@/components/admin/roster-import";
import { requireCan } from "@/lib/server/viewer";
import { TeacherForm } from "../teacher-form";

export const metadata = { title: "계정 추가 · 속초고 쌤기부" };

const GRAY = "flex min-w-0 flex-col rounded-card bg-soft p-5 md:p-6";

// 계정 추가 (Figma N25 342:10318 · 모바일 342:10670): 교사 한 명 | 명부로 여러 명(교사명부_양식.xlsx). 모바일은 명부 카드가 위.
// 학생은 학생 등록(엑셀·한 명씩)에서 만든다. 첫 로그인은 학교 인증코드 → 비밀번호 변경.
export default async function NewAccountPage() {
  await requireCan("account.manage");
  return (
    <>
      <PageHeader title="계정 추가" actions={<ButtonLink href="/students/new" kind="outline" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <section className={`${GRAY} md:order-2`}>
            <h2 className="mb-4 text-[17px] font-bold md:text-lg">명부로 여러 명</h2>
            <RosterImport />
          </section>
          <section className={`${GRAY} md:order-1`}>
            <h2 className="mb-4 text-[17px] font-bold md:text-lg">교사 한 명</h2>
            <TeacherForm />
            <p className="mt-3 text-[12px] text-mute">첫 로그인은 학교 인증코드로 들어와 비밀번호를 새로 정해요</p>
          </section>
        </div>
      </PageBody>
    </>
  );
}
