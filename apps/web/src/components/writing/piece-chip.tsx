import { cx } from "@/components/ui";
import type { PieceSource } from "@/lib/domain/merge";

/** 출처 칩 (Figma N32 398:295): 조각 칸 · 합치기 · 생기부 조각에서 같은 색 */
export const PIECE_CHIP: Record<PieceSource, string> = {
  누가기록: "bg-key-soft text-key-strong",
  메모: "bg-soft text-sub",
  본문: "bg-line text-ink",
  "특색 활동": "bg-navy-2 text-white",
  "공통 활동": "bg-[#DFE3FF] text-[#2F43B8]",
  "자료 요약": "bg-new-soft text-new",
};

export function PieceChip({ source, className }: { source: PieceSource; className?: string }) {
  return <span className={cx("shrink-0 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] font-medium", PIECE_CHIP[source], className)}>{source}</span>;
}
