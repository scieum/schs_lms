import { cx } from "@/components/ui";
import { STAGES } from "@/lib/domain/program-stage";

/** 목록 카드의 작은 soft 버튼 (높이 32 · 13 굵게). 카드 전체 링크 위로 올린다(z-10) */
export const CARD_BTN = "relative z-10 inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:opacity-60";

/**
 * 목록 카드의 단계 점 (Figma N16): 점 6 다섯 개 · 간격 4.
 * 지난 = #9EAAFF, 지금 = 16×6 알약 인디고, 남은 = #D9DDE3. current 가 null 이면 모두 남은 단계(발행 전).
 */
export function StageDots({ current, className }: { current: number | null; className?: string }) {
  return (
    <span className={cx("flex shrink-0 items-center gap-1", className)} role="img" aria-label={current === null ? "발행 전" : `${current + 1}/${STAGES.length} ${STAGES[current]}`}>
      {STAGES.map((name, i) => (
        <span
          key={name}
          className={cx(
            "h-1.5 rounded-full",
            current !== null && i === current ? "w-4 bg-key" : "w-1.5",
            current !== null && i < current ? "bg-[#9EAAFF]" : current !== null && i === current ? "" : "bg-hair",
          )}
        />
      ))}
    </span>
  );
}
