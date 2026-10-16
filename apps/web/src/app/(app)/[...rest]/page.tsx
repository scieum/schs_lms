import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";

// 아직 만들지 않은 메뉴 (로드맵 2단계 이후)
export default function Pending() {
  return (
    <>
      <PageHeader title="준비 중이에요" />
      <PageBody>
        <Card>
          <p className="text-[15px]">이 화면은 다음 단계에서 열려요.</p>
          <ButtonLink href="/" kind="outline" size="sm" className="mt-4">홈으로</ButtonLink>
        </Card>
      </PageBody>
    </>
  );
}
