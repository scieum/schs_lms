import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { requireCan } from "@/lib/server/viewer";
import { StampMaker } from "./maker";

export const metadata = { title: "도장 만들기 · 속초고 쌤기부" };

// 도장 만들기 (도구, Figma N71): 글자 · 모양 · 글꼴 · 색을 골라 투명 배경 PNG. 브라우저에서만 그리고 저장하지 않는다.
export default async function StampPage() {
  await requireCan("record.write");
  return (
    <>
      <PageHeader title="도장 만들기" />
      <PageBody>
        <StampMaker />
      </PageBody>
    </>
  );
}
