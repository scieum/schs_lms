import Link from "next/link";
import { Tag, cx } from "@/components/ui";
import { AREA_LABEL, daysLeft, ddayLabel, md, sourceLabel, usesSurvey, type Program } from "@/lib/domain/program";
import { programStage, type Stage, type StageCounts } from "@/lib/domain/program-stage";
import { CardRunButton } from "./card-action";
import { CARD_BTN, StageDots } from "./stage-dots";

type CardAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "run"; run: "generate" | "retry"; label: string }
  | { kind: "tag"; label: string };

type Progress = { label: string; a: number; b: number; tone: "key" | "ok"; failed?: number };

export type CardView = { stage: Stage; draft: boolean; action: CardAction | null; progress: Progress | null; todo: boolean };

/** 목록 카드: 단계(programStage) → 카드 버튼 하나 + 진행 줄 (design-system N16 목록 표) */
export function cardView(p: Program, c: StageCounts, today: string): CardView {
  const stage = programStage(c, ddayLabel(p.endDate, today));
  const id = p.id;
  if (c.status === "draft") {
    return { stage, draft: true, action: { kind: "link", label: "이어서 쓰기", href: `/teacher/programs/${id}/edit` }, progress: null, todo: false };
  }
  const made = c.review + c.confirmed;
  const review: CardAction = { kind: "link", label: `검토 ${c.review}`, href: `/teacher/drafts?program=${id}` };
  const got = usesSurvey(p.source) ? "응답" : "제출";
  let action: CardAction | null = null;
  let progress: Progress;
  switch (stage.index) {
    case 0:
      if (stage.next.kind === "remind") action = { kind: "link", label: `알리기 ${stage.next.n}`, href: `/teacher/programs/${id}?remind=1` };
      progress = { label: got, a: c.evidence, b: c.targets, tone: "key" };
      break;
    case 1:
      if (c.ready > 0) action = { kind: "run", run: "generate", label: "초안 만들기" };
      progress = { label: got, a: c.evidence, b: c.targets, tone: "key" };
      break;
    case 2:
      if (c.failed > 0) action = { kind: "run", run: "retry", label: `다시 만들기 ${c.failed}` };
      else if (c.review > 0) action = review;
      progress = { label: "초안", a: made, b: c.evidence, tone: "ok", failed: c.failed };
      break;
    case 3:
      if (c.review > 0) action = review;
      progress = { label: "확정", a: c.confirmed, b: c.evidence, tone: "ok" };
      break;
    default:
      action = { kind: "tag", label: "전달 완료" };
      progress = { label: "전달", a: c.confirmed, b: c.targets, tone: "ok" };
  }
  return { stage, draft: false, action, progress, todo: !!action && action.kind !== "tag" };
}

/** 정렬: 할 일 있는 카드 → 그 밖 → 담임 전달·임시 저장. 같은 묶음 안에서는 마감일 가까운 순 */
export function cardOrder(v: CardView, p: Program, today: string): [number, number] {
  const group = v.todo ? 0 : v.draft || v.stage.index === 4 ? 2 : 1;
  return [group, Math.abs(daysLeft(p.endDate, today))];
}

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

function ProgressRow({ g }: { g: Progress }) {
  const done = pct(g.a, g.b);
  const bad = g.failed ? pct(g.failed, g.b) : 0;
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="shrink-0 whitespace-nowrap font-medium text-sub tabular-nums">{g.label} {g.a}/{g.b}</span>
      <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={cx("h-full", g.tone === "ok" ? "bg-ok" : "bg-key")} style={{ width: `${done}%` }} />
        {bad > 0 && <span className="h-full bg-bad" style={{ width: `${Math.min(bad, 100 - done)}%` }} />}
      </span>
      {g.failed ? (
        <span className="shrink-0 whitespace-nowrap font-bold text-bad">실패 {g.failed}</span>
      ) : (
        <span className="w-9 shrink-0 text-right font-bold tabular-nums">{done}%</span>
      )}
    </div>
  );
}

function ActionSlot({ a, programId }: { a: CardAction; programId: string }) {
  if (a.kind === "tag") return <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-chip bg-ok-soft px-2.5 text-[12px] font-bold text-ok">{a.label}</span>;
  if (a.kind === "run") return <CardRunButton programId={programId} kind={a.run} label={a.label} />;
  return <Link href={a.href} className={CARD_BTN}>{a.label}</Link>;
}

/** 프로그램 목록 카드 (Figma N16 목록). 카드 버튼은 따로 동작하고, 나머지 면은 상세로 간다 (겹친 링크 없이 덮개 링크) */
export function ProgramCard({ p, view, today }: { p: Program; view: CardView; today: string }) {
  const { stage, draft, action, progress } = view;
  const chip = draft ? <Tag tone="bg-soft text-sub">임시 저장</Tag> : stage.index > 0 || daysLeft(p.endDate, today) < 0 ? <Tag tone="bg-soft text-sub">마감</Tag> : <Tag>{ddayLabel(p.endDate, today)}</Tag>;
  return (
    <article className="surface relative flex h-full flex-col gap-2.5 rounded-card p-4 transition-colors hover:bg-[#fafbfc] md:p-5">
      <Link href={`/teacher/programs/${p.id}`} className="absolute inset-0 rounded-card" aria-label={`${p.title} 상세`} />
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{p.title}</h2>
        <span className="whitespace-nowrap">{chip}</span>
      </div>
      <div className="truncate text-[13px] text-mute">
        {AREA_LABEL[p.area]}{p.subject ? ` ${p.subject}` : ""} · {md(p.startDate)} ~ {md(p.endDate)} · {sourceLabel(p)} · {p.targetIds.length}명
      </div>
      <div className="mt-auto flex h-8 items-center gap-2">
        <StageDots current={draft ? null : stage.index} />
        <span className={cx("min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-bold", draft ? "text-mute" : "text-key-strong")}>{draft ? "발행 전" : stage.label}</span>
        {action && <ActionSlot a={action} programId={p.id} />}
      </div>
      {progress && <ProgressRow g={progress} />}
    </article>
  );
}
