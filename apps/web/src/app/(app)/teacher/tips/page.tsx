import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { isAdmin } from "@/lib/domain/policy";
import { canEditTip, filterTips, tipCounts } from "@/lib/domain/tips";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { NewTipButton, TipsBoard } from "./board";

export const metadata = { title: "생기부 팁 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ cat?: string; q?: string; t?: string }> };

// 생기부 팁 게시판 (Figma N57 a · b · c): PC = 왼쪽 목록 · 오른쪽 글, 모바일 = 목록 → 글(?t=). 분류 칩 · 찾기는 주소 쿼리.
export default async function TipsPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const all = await repo.listTips();
  const list = filterTips(all, { category: q.cat, text: q.q });
  const selected = all.find((t) => t.id === q.t) ?? list[0] ?? null;
  const me = { id: v.accountId, admin: isAdmin(v) };
  return (
    <>
      <PageHeader title="생기부 팁" actions={<NewTipButton />} />
      <PageBody>
        <TipsBoard
          tips={list}
          counts={tipCounts(all)}
          cat={q.cat ?? "전체"}
          text={q.q ?? ""}
          selected={selected}
          detailOnly={!!q.t}
          editable={selected ? canEditTip(selected, me) : false}
        />
      </PageBody>
    </>
  );
}
