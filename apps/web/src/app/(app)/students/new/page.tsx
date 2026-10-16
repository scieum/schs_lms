import { Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Segmented } from "@/components/ui";
import { requireCan } from "@/lib/server/viewer";
import { ExcelUpload } from "./excel-upload";
import { OneForm } from "./one-form";

export const metadata = { title: "학생 등록 · 속초고등학교 학생관리시스템" };

export default async function NewStudentsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await requireCan("student.register");
  const one = (await searchParams).mode === "one";
  return (
    <>
      <PageHeader
        title="학생 등록"
        actions={
          <ButtonLink href="/students/template" kind="outline" size="sm" prefetch={false}>
            <Download size={14} /> <span className="hidden md:inline">양식 다운로드</span><span className="md:hidden">양식</span>
          </ButtonLink>
        }
      />
      <PageBody>
        <Segmented
          active={one ? 1 : 0}
          items={[
            { label: "엑셀로 여러 명", href: "/students/new" },
            { label: "한 명씩", href: "/students/new?mode=one" },
          ]}
        />
        {one ? <OneForm /> : <ExcelUpload />}
      </PageBody>
    </>
  );
}
