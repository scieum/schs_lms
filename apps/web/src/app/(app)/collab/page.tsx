import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";
import { KIND_LABEL } from "@/lib/domain/collab";
import { namedRoom } from "@/lib/server/collab";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "협업방 · 속초고 쌤기부" };

// 협업방 모두 보기 (Figma N69 d): 내가 든 방 카드 — 이름 · 소개 · 멤버 수 · 최근 올린 것 3개.
export default async function CollabListPage() {
  const v = await requireCan("record.write");
  const rows = await repo.listRooms(v.accountId);
  const [rooms, items] = await Promise.all([Promise.all(rows.map(namedRoom)), repo.listItems(rows.map((r) => r.id))]);
  return (
    <>
      <PageHeader title="협업방" actions={<ButtonLink href="/collab/new" size="sm"><Plus size={14} /> 새 협업방</ButtonLink>} />
      <PageBody>
        <p className="text-[14px] text-sub">동학년부가 아니어도, 교과가 달라도 방을 만들어 선생님을 초대해요. 수행평가 · 차시별 활동 · 프롬프트 · 자료 · 함께 쓰는 메모를 나눠요.</p>
        {rooms.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Users size={28} className="text-mute" />
              <p className="font-bold">아직 든 협업방이 없어요</p>
              <p className="text-[13px] text-sub">방을 만들거나, 다른 선생님이 초대하면 여기와 사이드바 &quot;협업&quot;에 나와요</p>
              <ButtonLink href="/collab/new" size="sm">새 협업방 만들기</ButtonLink>
            </div>
          </Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((r) => {
              const recent = items.filter((x) => x.roomId === r.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
              return (
                <li key={r.id}>
                  <Link href={`/collab/${r.id}`} className="surface flex h-full flex-col gap-2 rounded-card p-5 hover:ring-2 hover:ring-key-soft">
                    <span className="text-[17px] font-bold">{r.name}</span>
                    {r.intro && <span className="line-clamp-2 text-[13px] text-sub">{r.intro}</span>}
                    <span className="text-[12px] text-mute">멤버 {r.members.length}명 · {r.members.slice(0, 4).map((m) => m.name).join(", ")}{r.members.length > 4 ? " 외" : ""}</span>
                    <span className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
                      {recent.length === 0 && <span className="text-[12px] text-mute">아직 올린 것이 없어요</span>}
                      {recent.map((x) => <span key={x.id} className="truncate text-[13px]"><b className="mr-1 text-[12px] text-key-strong">{KIND_LABEL[x.kind]}</b>{x.title}</span>)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
