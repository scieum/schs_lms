import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { LibraryPanel } from "@/components/writing/library-panel";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "문장 보관함 · 속초고등학교 학생관리시스템" };

// 문장 보관함 페이지 (Figma N35 ②): 편집기 옆 패널을 본문 폭(최대 880)으로 늘려 쓰고, 카드 버튼은 "복사".
// 본문에 넣기 · 조각으로 넣기는 각 편집 화면의 "보관함"에서. 교사 개인 보관함이라 학생 정보는 없다.
export default async function LibraryPage() {
  await requireCan("record.write");
  return (
    <>
      <PageHeader title="문장 보관함" />
      <PageBody>
        <LibraryPanel mode="page" />
      </PageBody>
    </>
  );
}
