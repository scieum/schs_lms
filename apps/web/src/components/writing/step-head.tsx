import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * 단계 머리 (Figma N32 398:310): 번호 점 24 + 제목 16 Bold + 설명 13. 끝난 단계는 초록 체크.
 * 기록 쓰기 화면의 ① 조각 모으기 → ② 본문 만들기 → ③ 본문·검사·확정 머리에 쓴다. right 는 필요할 때만(역량 보기).
 */
export function StepHead({ n, title, meta, done = false, right, className }: {
  n: number; title: string; meta?: ReactNode; done?: boolean; right?: ReactNode; className?: string;
}) {
  return (
    <div className={cx("flex min-h-6 items-center gap-2.5", className)}>
      <span aria-hidden className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", done ? "bg-ok-soft text-ok" : "bg-key-soft text-key-strong")}>
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <h3 className="shrink-0 whitespace-nowrap text-[16px] font-bold">
        <span className="sr-only">{n}단계{done ? " (끝)" : ""} </span>{title}
      </h3>
      {meta != null && meta !== "" && <span className="min-w-0 truncate text-[13px] text-mute">{meta}</span>}
      {right && <span className="ml-auto shrink-0">{right}</span>}
    </div>
  );
}

/** 단계 사이 구분선 + 간격 (1px #E5E8EB, 위아래 20) */
export const STEP_GAP = "border-t border-line pt-5";
