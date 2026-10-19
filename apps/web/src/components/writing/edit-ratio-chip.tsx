import { cx } from "@/components/ui";
import { PROVENANCE_DEFAULTS, ratioLevel } from "@/lib/domain/provenance";

// N38 수정 칩 (469:21388): 충분 #EEF0FF/#3D56E0 "수정 23%" · 적음 #FFF5E0/#9A6400 "수정 4%"(long 이면 "· 더 고쳐 주세요") · 직접 #F2F4F6/#4E5968 "직접 씀".
// ratio === undefined 는 모름(마이그레이션 전 글) → 그리지 않는다. null = AI 원안 없음(직접 씀).

const TONE = { enough: "bg-key-soft text-key-strong", low: "bg-wait-soft text-[#9A6400]", own: "bg-soft text-sub" } as const;

export function EditRatioChip({ ratio, min = PROVENANCE_DEFAULTS.editRatioMin, long = false, className }: {
  ratio: number | null | undefined;
  min?: number;
  /** 수정 줄(PC): 적음이면 "· 더 고쳐 주세요"까지 */
  long?: boolean;
  className?: string;
}) {
  if (ratio === undefined) return null;
  const lv = ratioLevel(ratio, min);
  const text = lv === "own" ? "직접 씀" : `수정 ${ratio}%${lv === "low" && long ? " · 더 고쳐 주세요" : ""}`;
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold tabular-nums", TONE[lv], className)}>{text}</span>;
}
