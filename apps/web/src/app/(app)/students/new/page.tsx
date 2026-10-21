import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Segmented } from "@/components/ui";
import { requireCan } from "@/lib/server/viewer";
import { ExcelUpload, RegisterHeaderButton } from "./excel-upload";
import { OneForm } from "./one-form";

export const metadata = { title: "학생 등록 · 속초고 쌤기부" };

export default async function NewStudentsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await requireCan("student.register");
  const one = (await searchParams).mode === "one";
  return (
    <>
      <PageHeader title="학생 등록" actions={one ? undefined : <RegisterHeaderButton />} />
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
