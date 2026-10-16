import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card } from "@/components/ui";
import { requireCan } from "@/lib/server/viewer";
import { TeacherForm } from "../teacher-form";

export const metadata = { title: "계정 추가 · 속초고등학교 학생관리시스템" };

// 교사 한 명 추가. 학생은 학생 등록(엑셀·한 명씩)에서 만든다.
export default async function NewAccountPage() {
  await requireCan("account.manage");
  return (
    <>
      <PageHeader title="계정 추가" actions={<ButtonLink href="/students/new" kind="outline" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <AiBanner label="자동" title="첫 로그인" line="학교 인증코드로 들어와서 비밀번호를 새로 정해요" />
        <Card title="교사 한 명" className="md:max-w-[520px]">
          <TeacherForm />
        </Card>
      </PageBody>
    </>
  );
}
