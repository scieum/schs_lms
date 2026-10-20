"use client";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";

// 게이트 진행 (Figma N49 570:786): ② AI가 쓰는 동안 메모 모아 쓰기 칸 자리에 — 머리(AI · 지금 하는 일 ↔ 그만 쓰기) · 한 줄 · 흰 칸 안 단계 줄.
// 서버는 한 번에 돌아오므로 시간으로 꾸며 넘기지 않는다: 지금은 ① 하나만 "지금", 나머지는 "아직"으로 정직하게 보여 준다.

export type GateStep = { name: string; value?: ReactNode; state: "done" | "current" | "todo" };

export function AiTag() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-chip bg-new-soft px-1.5 text-[11px] font-bold text-new">AI</span>;
}

export function GateProgress({ title, line, steps, onStop, small = false }: {
  title: string;
  line?: ReactNode;
  steps: GateStep[];
  onStop?: () => void;
  /** 작게 (누가기록 ③ — 안쪽 12) */
  small?: boolean;
}) {
  return (
    <div className={cx("flex flex-col gap-2.5 rounded-inner bg-bg", small ? "p-3" : "p-3.5 md:p-4")} role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <AiTag />
        <span className={cx("min-w-0 flex-1 truncate font-bold", small ? "text-[13px]" : "text-[15px]")}>{title}</span>
        {onStop && (
          <button type="button" onClick={onStop} className="h-8 shrink-0 whitespace-nowrap px-1 text-[13px] font-medium text-sub hover:text-ink">그만 쓰기</button>
        )}
      </div>
      {line && <p className="text-[12px] font-medium text-sub break-keep">{line}</p>}
      <ol className="flex flex-col rounded-control bg-[#fff] py-1">
        {steps.map((s) => (
          <li key={s.name} className="flex h-10 items-center gap-2.5 px-3">
            <StepMark state={s.state} />
            <span className={cx("min-w-0 flex-1 truncate text-[14px]", s.state === "current" ? "font-bold text-ink" : s.state === "done" ? "text-ink" : "text-mute")}>{s.name}</span>
            {s.value != null && (
              <span className={cx("shrink-0 whitespace-nowrap text-[13px] tabular-nums",
                s.state === "done" ? "font-medium text-[#00A05D]" : s.state === "current" ? "font-bold text-key-strong" : "text-mute")}>{s.value}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepMark({ state }: { state: GateStep["state"] }) {
  if (state === "done") return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[#00A05D]"><Check size={12} strokeWidth={3} /></span>
  );
  if (state === "current") return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
      <span className="block size-4 animate-spin rounded-full border-[2.5px] border-[#DFE3FF] border-t-key" />
    </span>
  );
  return <span aria-hidden className="flex size-5 shrink-0 items-center justify-center"><span className="block size-2 rounded-full bg-hair" /></span>;
}
