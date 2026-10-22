import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { canDeleteItem, canEditItem, canManageRoom, filterItems, isMember, kindCounts } from "@/lib/domain/collab";
import { isAdmin } from "@/lib/domain/policy";
import { namedRoom } from "@/lib/server/collab";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { RoomBoard, RoomHeaderActions } from "../room-board";

export const metadata = { title: "협업방 · 속초고 쌤기부" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; q?: string; i?: string }> };

// 협업방 (Figma N69 a · b): 머리(이름 · 소개 · 멤버 · 초대 · 올리기) → 종류 탭 → 목록 · 글 / 오른쪽 멤버. 멤버만 본다.
export default async function RoomPage({ params, searchParams }: Props) {
  const v = await requireCan("record.write");
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const row = await repo.getRoom(id);
  const me = { id: v.accountId, admin: isAdmin(v) };
  if (!row || (!row.memberIds.includes(me.id) && !me.admin)) notFound();
  const [room, all, teachers] = await Promise.all([namedRoom(row), repo.listItems([row.id]), repo.listTeachers()]);
  const list = filterItems(all, { kind: q.k, text: q.q });
  const selected = all.find((x) => x.id === q.i) ?? null;
  return (
    <>
      <PageHeader title={room.name} actions={<RoomHeaderActions roomId={room.id} />} />
      <PageBody>
        <RoomBoard
          room={room}
          items={list.map((x) => ({ ...x, editable: canEditItem(x, room, me), deletable: canDeleteItem(x, room, me) }))}
          counts={kindCounts(all)}
          kind={q.k ?? "전체"}
          text={q.q ?? ""}
          selectedId={selected?.id ?? null}
          me={me.id}
          manage={canManageRoom(room, me)}
          member={isMember(room, me.id)}
          teachers={teachers.filter((t) => !row.memberIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name, dept: t.dept ?? null }))}
        />
      </PageBody>
    </>
  );
}
