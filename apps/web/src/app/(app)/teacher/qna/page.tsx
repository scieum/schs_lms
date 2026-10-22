import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { isAdmin } from "@/lib/domain/policy";
import { canEditQuestion, filterQna, qnaCounts } from "@/lib/domain/qna";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { AskButton, QnaBoard } from "./board";

export const metadata = { title: "문의 게시판 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ cat?: string; s?: string; q?: string; t?: string }> };

// 문의 게시판 (도구, 2026-10-22): 생기부 팁과 같은 틀 — PC = 왼쪽 목록 · 오른쪽 문답, 모바일 = 목록 → 문답(?t=).
export default async function QnaPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const all = await repo.listQna();
  const list = filterQna(all, { category: q.cat, state: q.s, text: q.q });
  const selected = all.find((p) => p.id === q.t) ?? list[0] ?? null;
  const admin = isAdmin(v);
  return (
    <>
      <PageHeader title="문의 게시판" actions={<AskButton />} />
      <PageBody>
        <QnaBoard
          posts={list}
          counts={qnaCounts(all)}
          waiting={all.filter((p) => !p.answer).length}
          cat={q.cat ?? "전체"}
          state={q.s ?? "전체"}
          text={q.q ?? ""}
          selected={selected}
          detailOnly={!!q.t}
          editable={selected ? canEditQuestion(selected, { id: v.accountId, admin }) : false}
          admin={admin}
        />
      </PageBody>
    </>
  );
}
