import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, StatTiles, Tag, cx } from "@/components/ui";
import { countByKind, isFresh, isRecKind, matchRecs, REC_KINDS } from "@/lib/domain/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { CareerToggle } from "../../me/forms";
import { AiRecs, InterestButton, KindIcon, RemoveInterest } from "./client";

export const metadata = { title: "추천 활동 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ kind?: string }> };

export default async function RecsPage({ searchParams }: Props) {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return null;
  const q = await searchParams;
  const goal = v.student.careerGoal;
  const kind = q.kind && isRecKind(q.kind) ? q.kind : null;

  const [items, interests] = await Promise.all([repo.listRecItems(), repo.listRecInterests(v.accountId)]);
  const matched = matchRecs(items, goal);
  const counts = countByKind(matched);
  const shown = kind ? matched.filter((i) => i.kind === kind) : matched;
  const picked = new Set(interests.map((i) => i.itemId).filter(Boolean));

  return (
    <>
      <PageHeader title="나에게 맞는 추천" actions={<CareerToggle current={goal} />} />
      <PageBody>
        <StatTiles items={[["도서", `${counts.도서}개`], ["대회", `${counts.대회}개`], ["활동", `${counts.활동}개`], ["진로 특강", `${counts.진로}개`]]} />
        <AiRecs goal={goal} />

        <nav className="flex gap-1 overflow-x-auto" aria-label="분류">
          {[null, ...REC_KINDS].map((k) => (
            <Link key={k ?? "all"} href={k ? `/student/recs?kind=${encodeURIComponent(k)}` : "/student/recs"} scroll={false}
              aria-current={k === kind ? "page" : undefined}
              className={cx("shrink-0 rounded-control px-3.5 py-2 text-sm", k === kind ? "bg-key font-bold text-white" : "text-sub hover:bg-soft")}>
              {k ?? "전체"}
            </Link>
          ))}
        </nav>

        {!goal && (
          <Card>
            <div className="py-6 text-center">
              <p className="font-bold">희망 진로를 정하면 맞춤 추천이 보여요</p>
              <p className="mt-1 text-sm text-sub">지금은 모두에게 맞는 항목만 보여요</p>
            </div>
          </Card>
        )}

        {shown.length === 0 ? (
          <Card><p className="py-6 text-center text-sm text-mute">맞는 추천이 아직 없어요</p></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
            {shown.map((it) => (
              <article key={it.id} className="flex flex-col gap-3 rounded-card bg-soft p-5 md:p-6">
                <div className="flex items-start gap-1.5">
                  <KindIcon kind={it.kind} />
                  <span className="flex-1" />
                  {isFresh(it.createdAt) && <Tag>새로 추가</Tag>}
                  <Tag tone="bg-white text-sub">{it.kind}</Tag>
                </div>
                <div>
                  <h2 className="text-[17px] font-bold">{it.title}</h2>
                  {it.meta && <p className="mt-1 text-[13px] text-mute">{it.meta}</p>}
                </div>
                <InterestButton itemId={it.id} on={picked.has(it.id)} />
              </article>
            ))}
          </div>
        )}

        <Card title="담은 항목" action={<span className="text-[13px] text-mute">{interests.length}개</span>}>
          {interests.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">관심 담기를 누르면 여기에 모여요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {interests.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-inner bg-white px-4 py-3">
                  <Tag tone="bg-soft text-sub">{i.kind}</Tag>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.title}</span>
                    {i.meta && <span className="block truncate text-xs text-mute">{i.meta}</span>}
                  </span>
                  {i.source === "ai" && <Tag>AI</Tag>}
                  <RemoveInterest id={i.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
