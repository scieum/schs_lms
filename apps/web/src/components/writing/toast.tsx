"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cx } from "@/components/ui";

// N42 복사 토스트 (Figma 컴포넌트 492:16019): 네이비 r12 · 20 원 ✓ + 흰 글 14 Medium · 4초 · 행동 버튼 없음.
// PC 는 본문 아래 가운데 40 띄움, 모바일은 탭 바 위 16. 실패는 같은 자리 빨간 원 ✕.

export function Toast({ text, fail }: { text: string; fail?: boolean }) {
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-[95] mx-auto flex w-fit max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-card bg-navy px-5 py-3.5 text-white shadow-[0_8px_24px_rgba(28,32,51,0.24)] md:bottom-10 md:left-[calc(50%+120px)] md:right-auto md:-translate-x-1/2">
      <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full", fail ? "bg-bad" : "bg-ok")}>
        {fail ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 text-[14px] font-medium leading-5">{text}</span>
    </div>
  );
}

export function useToast(delay = 4000) {
  const [t, setT] = useState<{ text: string; fail?: boolean; key: number } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const show = useCallback((text: string, fail?: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    setT({ text, fail, key: Date.now() });
    timer.current = window.setTimeout(() => setT(null), delay);
  }, [delay]);
  return { show, node: t ? <Toast key={t.key} text={t.text} fail={t.fail} /> : null };
}
