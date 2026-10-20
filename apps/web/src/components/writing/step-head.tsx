"use client";
import { useContext, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { StepperContext } from "./write-steps";

/**
 * 단계 머리 (Figma N32 398:310): 번호 점 24 + 제목 16 Bold + 설명 13. 끝난 단계는 초록 체크.
 * 단계 표시(N48) 안에서는 제목을 화면에서 숨기고(단계 표시가 대신 보여 줌) hint 만 한 줄로 보여 준다 — right(역량 보기)는 그대로.
 */
export function StepHead({ n, title, meta, done = false, right, className, hint }: {
  n: number; title: string; meta?: ReactNode; done?: boolean; right?: ReactNode; className?: string;
  /** 단계 표시 안에서 보여 줄 안내 한 줄 (N48 ① "본 일을 한 줄씩 남겨요") */
  hint?: ReactNode;
}) {
  const stepped = useContext(StepperContext);
  if (stepped) {
    const heading = <h3 className="sr-only">{n}단계 {title}</h3>;
    if (!hint && !right) return heading;
    return (
      <div className={cx("flex min-h-6 items-center gap-2.5", className)}>
        {heading}
        {hint && <span className="min-w-0 flex-1 truncate text-[13px] text-mute">{hint}</span>}
        {right && <span className="ml-auto shrink-0">{right}</span>}
      </div>
    );
  }
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
