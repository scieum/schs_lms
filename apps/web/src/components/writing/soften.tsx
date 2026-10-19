"use client";
import { Sparkles } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { bluntLine, type BluntHit } from "@/lib/domain/soften";
import { BeforeAfter } from "./before-after";
import { SaveBookmark } from "./library-save";

// 순화하기 (Figma N34 ③ 417:96281 · 417:99896): 메모 칸 바로 아래 알림 줄 → 순화 결과(메모 / 순화한 글) → "조각으로 넣기".
// 걸린 말은 규칙(lib/domain/soften.ts)으로 찾고, 바꾸는 일만 AI(Haiku)가 한다. AI가 꺼져 있으면 버튼을 숨긴다.

export function SoftenNotice({ hits, onRun, busy }: { hits: BluntHit[]; onRun?: () => void; busy?: boolean }) {
  if (!hits.length) return null;
  return (
    <div className="flex flex-col gap-3 rounded-control bg-new-soft p-3 md:flex-row md:items-center md:gap-2 md:py-2">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] leading-5">
        <Sparkles size={14} className="mt-[3px] shrink-0 text-new" />
        <span className="break-keep">생기부에 쓰기 어려운 말이 있어요 · <b>{bluntLine(hits)}</b></span>
      </p>
      {onRun && (
        <button type="button" onClick={onRun} disabled={busy}
          className="h-10 shrink-0 whitespace-nowrap rounded-control bg-[#fff] px-3 text-[13px] font-bold text-key-strong disabled:opacity-50 md:h-[30px]">
          {busy ? "순화하는 중…" : "순화하기"}
        </button>
      )}
    </div>
  );
}

export function SoftenResult({ memo, soft, hits, label = "AI", busy, onRedo, onKeep, onInsert, insertLabel = "조각으로 넣기" }: {
  memo: string; soft: string; hits: BluntHit[]; label?: "AI" | "자동"; busy?: boolean;
  onRedo: () => void; onKeep: () => void; onInsert: () => void; insertLabel?: string;
}) {
  const redo = (
    <button type="button" onClick={onRedo} disabled={busy} className="h-9 whitespace-nowrap rounded-control px-2 text-[13px] font-medium text-sub hover:bg-[#fff] disabled:opacity-40">
      {busy ? "순화하는 중…" : "다시 순화"}
    </button>
  );
  return (
    <div className="flex flex-col gap-3 rounded-inner bg-bg px-4 py-3.5" role="region" aria-label="순화한 글">
      <div className="flex items-center gap-2">
        <span className={cx("rounded-chip px-1.5 py-px text-[11px] font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
        <span className="min-w-0 flex-1 text-[14px] font-bold">순화한 글</span>
        <span className="whitespace-nowrap text-[12px] tabular-nums text-mute">{[...soft].length}자 · {neisBytes(soft).toLocaleString()}B</span>
        <SaveBookmark text={soft} source="soften" />
      </div>
      <BeforeAfter before={memo} after={soft} beforeLabel="메모" afterLabel="순화한 글" beforeMarks={hits.map((h) => ({ start: h.start, end: h.end }))} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <span className="min-w-0 flex-1 text-[12px] text-mute">사실은 그대로 두고 말투만 바꿨어요</span>
        <span className="hidden md:inline">{redo}</span>
        <div className="flex gap-2 [&>*]:h-11 [&>*]:flex-1 md:[&>*]:h-9 md:[&>*]:flex-none">
          <Button type="button" kind="outline" size="sm" onClick={onKeep}>그대로 두기</Button>
          <Button type="button" size="sm" onClick={onInsert} disabled={busy}>{insertLabel}</Button>
        </div>
        <span className="flex justify-center md:hidden">{redo}</span>
      </div>
    </div>
  );
}
