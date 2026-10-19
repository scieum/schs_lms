"use client";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";

// 고른 학생 바 (Figma N28 누가기록 한꺼번에 · N35 성취수준 한꺼번에): 네이비 #1C2033 r12, "고른 n명에게" ↔ 해제.
// row = 한 줄(N28: 칩 줄 + 넣기) · stack = 두 줄(N35: 위 "고른 n명에게 ↔ 해제", 아래 버튼 줄).
// floating = 모바일은 탭바 위 고정, PC는 목록 아래 제자리.

export function PickBar({ count, onClear, children, action, layout = "row", floating = true, clearLabel }: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  /** row: 해제 오른쪽 버튼 (넣기) */
  action?: ReactNode;
  layout?: "row" | "stack";
  floating?: boolean;
  clearLabel?: ReactNode;
}) {
  const clear = (
    <button type="button" onClick={onClear} className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[#9EAAFF]">
      {clearLabel ?? (<><span className="md:hidden">해제</span><span className="hidden md:inline">선택 해제</span></>)}
    </button>
  );
  const pos = floating ? "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-20 md:static" : "";
  if (layout === "stack") {
    return (
      <div data-sticky-cta={floating || undefined} className={cx(pos, "flex flex-col gap-2.5 rounded-[12px] bg-navy px-4 py-3")}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 whitespace-nowrap text-[13px] font-bold text-white">고른 {count}명에게</span>
          {clear}
        </div>
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    );
  }
  return (
    <div data-sticky-cta={floating || undefined} className={cx(pos, "mt-3 flex items-center gap-2.5 rounded-[12px] bg-navy py-2 pl-4 pr-2 md:rounded-inner")}>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-white">고른 {count}명에게</span>
      {children}
      {clear}
      {action}
    </div>
  );
}

/** N28 체크박스 (18 · r4, 켬 인디고) */
export function PickBox({ on, onClick, label, dim }: { on: boolean; onClick: () => void; label: string; dim?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}
      className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-[4px]", on ? "bg-key text-white" : "border-[1.5px] border-faint bg-[#fff]", dim && "opacity-60")}>
      {on && <Check size={12} strokeWidth={3} />}
    </button>
  );
}
