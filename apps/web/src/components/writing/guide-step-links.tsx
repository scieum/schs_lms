import Link from "next/link";
import { cx } from "@/components/ui";

/** 기재요령 패널(N43)이 열려 학생 목록이 숨으면(1280 이상) 카드 머리에 "‹ 이전 · 다음 ›" — globals.css data-guide-only */
export function GuideStepLinks({ prev, next }: { prev?: string; next?: string }) {
  const cls = "whitespace-nowrap px-0.5 text-[12px] font-medium";
  return (
    <span data-guide-only className="items-center gap-1 text-mute">
      {prev ? <Link href={prev} className={cx(cls, "hover:text-ink")}>‹ 이전</Link> : <span className={cx(cls, "text-faint")}>‹ 이전</span>}
      <span aria-hidden>·</span>
      {next ? <Link href={next} className={cx(cls, "hover:text-ink")}>다음 ›</Link> : <span className={cx(cls, "text-faint")}>다음 ›</span>}
    </span>
  );
}
