"use client";
import { forwardRef } from "react";
import { BookOpen, Link2, Search } from "lucide-react";
import { cx } from "@/components/ui";
import { GUIDE_URL, guideSource, VERDICT_LABEL, type GuideEntry } from "@/lib/domain/guide-bank";

// N43 기재요령 답 (492:26449): 판정 태그 + 짧은 답 → 설명 한 줄 → 원문(그대로) + N34 기재요령 칩(쪽) + 항목 → [이 글에서 찾기] · 원문 PDF.

const TONE = { 불가: "bg-bad-soft text-bad", 가능: "bg-ok-soft text-ok", 조건: "bg-wait-soft text-[#9A6400]" } as const;

export const GuideAnswerCard = forwardRef<HTMLElement, {
  entry: GuideEntry;
  /** AI 정리의 인용 번호 [1] */
  n?: number;
  /** 이 글에서 찾기 (편집기 글이 없거나 find 규칙이 없으면 숨김) */
  onFind?: () => void;
  highlight?: boolean;
}>(function GuideAnswerCard({ entry, n, onFind, highlight }, ref) {
  return (
    <article ref={ref} id={`guide-${entry.id}`} tabIndex={-1}
      className={cx("flex scroll-mt-4 flex-col gap-3 rounded-inner border bg-[#fff] p-4 outline-none transition-colors", highlight ? "border-key" : "border-line")}>
      <div className="flex items-start gap-2">
        <span className={cx("mt-px shrink-0 whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold leading-4", TONE[entry.verdict])}>
          {n ? `[${n}] ` : ""}{VERDICT_LABEL[entry.verdict]}
        </span>
        <h3 className="min-w-0 flex-1 break-keep text-[15px] font-bold leading-[22px]">{entry.short}</h3>
      </div>
      {entry.note && <p className="break-keep text-[13px] leading-5 text-sub">{entry.note}</p>}
      <div className="flex flex-col gap-2 rounded-control bg-bg px-3 py-2.5">
        <p className="break-keep text-[13px] leading-5 text-sub">“{entry.quote}”</p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-chip border border-line bg-[#fff] px-2 text-[12px] font-medium text-sub">
            <BookOpen size={12} className="shrink-0" aria-hidden />{guideSource(entry)}
          </span>
          <span className="min-w-0 truncate text-[12px] text-mute">{entry.section === "분량" ? "입력 분량" : entry.section}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onFind && entry.find?.length ? (
          <button type="button" onClick={onFind}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] md:h-8 md:flex-none">
            <Search size={14} aria-hidden /> 이 글에서 찾기
          </button>
        ) : null}
        <a href={GUIDE_URL} target="_blank" rel="noreferrer"
          className="ml-auto inline-flex h-10 items-center gap-1 whitespace-nowrap px-1 text-[13px] font-medium text-sub hover:text-ink md:ml-0 md:h-8">
          <Link2 size={14} aria-hidden /> 원문 PDF
        </a>
      </div>
    </article>
  );
});
