import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { requireCan } from "@/lib/server/viewer";
import { NewRoomForm } from "../room-board";

export const metadata = { title: "새 협업방 · 속초고 쌤기부" };

// 새 협업방 (Figma N69): 이름 · 소개 → 만든 뒤 방에서 선생님 초대
export default async function NewRoomPage() {
  await requireCan("record.write");
  return (
    <>
      <PageHeader title="새 협업방" />
      <PageBody>
        <NewRoomForm />
      </PageBody>
    </>
  );
}
