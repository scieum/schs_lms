import { ArrowRight } from "lucide-react";
import { cx } from "@/components/ui";
import type { AutoCheck } from "@/lib/domain/auto-check";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";

/**
 * 진행 줄 (Figma N40 484:725): 학생 이름 아래 한 줄 — 메모 n개 → 글 지금/목표 → 검사 상태.
 * 세 단계(① 활동 메모 → ② AI로 쓰기 → ③ 글 확인·확정)가 어디까지 왔는지 한눈에.
 */
export function WritingProgress({ memos, text, unit, max, check }: {
  /** 활동 메모 수 (null = 불러오는 중) */
  memos: number | null;
  text: string;
  unit: LengthUnit;
  max: number;
  check: AutoCheck;
}) {
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  const value = measure(text, unit);
  const [checkText, tone] =
    check.status === "empty" ? ["글 없음", "text-mute"]
    : check.status === "block" ? [`확정 불가 ${check.rows.length}`, "text-bad"]
    : check.status === "check" ? [`확인 ${check.rows.length}`, "text-[#9A6400]"]
    : ["통과", "text-ok"];
  const arrow = <ArrowRight aria-hidden size={12} className="shrink-0 text-faint" />;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control bg-bg px-3 py-2 text-[12px] text-mute md:gap-x-2.5" aria-label="쓰기 진행">
      <span className="whitespace-nowrap">메모 <b className="text-[13px] text-ink">{memos == null ? "…" : `${memos}개`}</b></span>
      {arrow}
      <span className="whitespace-nowrap">글 <b className={cx("text-[13px] tabular-nums", value > max ? "text-bad" : "text-ink")}>{value.toLocaleString()} / {max.toLocaleString()}{u}</b></span>
      {arrow}
      <span className="whitespace-nowrap">검사 <b className={cx("text-[13px]", tone)}>{checkText}</b></span>
    </p>
  );
}
