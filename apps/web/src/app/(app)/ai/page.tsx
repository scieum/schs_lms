import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { AiWorkspace } from "./workspace";

export const metadata = { title: "AI 작업창 · 속초고 쌤기부" };

// AI 작업창 (Figma N70 a · b): 홈 바로 아래. 무엇이든 시키고 @로 맥락을 붙인다. 대화는 이 화면에만 (저장 안 함).
export default async function AiPage() {
  await requireCan("record.write");
  return (
    <>
      <PageHeader title="AI 작업창" />
      <PageBody>
        <AiWorkspace aiOn={aiEnabled()} />
      </PageBody>
    </>
  );
}
