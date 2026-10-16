import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card } from "@/components/ui";
import { RosterImport } from "@/components/admin/roster-import";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { TeacherForm } from "../teacher-form";

export const metadata = { title: "계정 추가 · 속초고등학교 학생관리시스템" };

// 교사 한 명 추가 · 명부 붙여넣기로 여러 명 추가. 학생은 학생 등록(엑셀·한 명씩)에서 만든다.
export default async function NewAccountPage() {
  await requireCan("account.manage");
  return (
    <>
      <PageHeader title="계정 추가" actions={<ButtonLink href="/students/new" kind="outline" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <AiBanner label="자동" title="첫 로그인" line="학교 인증코드로 들어와서 비밀번호를 새로 정해요" />
        <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
          <Card title="교사 한 명">
            <TeacherForm />
          </Card>
          <Card title="명부로 여러 명">
            <RosterImport aiOn={aiEnabled()} />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
