import { Lock } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";

/** 잠근 기능 화면: 주소로 들어와도 내용은 보여 주지 않는다 */
export function LockedFeature({ title, home }: { title: string; home: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-soft text-sub"><Lock size={22} /></span>
            <p className="text-[17px] font-bold">잠긴 기능이에요</p>
            <p className="text-[14px] text-sub">성적은 민감한 개인정보라 지금은 잠가 두었어요</p>
            <ButtonLink href={home} kind="outline" size="sm">홈으로</ButtonLink>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
