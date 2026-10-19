"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * 확정본을 복사한다 → 나이스 화면의 '나이스 입력' 버튼 창에 Ctrl+V 로 바로 읽는다 (파일 저장 없이).
 * 받아 오는 동안에도 누른 순간의 권한이 살도록 ClipboardItem 에 Promise 를 넘긴다.
 * N47: 행의 주 동작 하나. 확정 0이면 회색(흐린 인디고 아님) + title "확정한 학생이 없어요".
 */
export function CopyButton({ href, disabled, className }: { href: string; disabled?: boolean; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  async function copy() {
    setState("busy");
    const text = fetch(href, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.text();
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("fail");
    }
  }
  const off = disabled || state === "busy";
  return (
    <button type="button" onClick={copy} disabled={off} aria-live="polite" title={disabled ? "확정한 학생이 없어요" : undefined}
      className={cx("inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3.5 text-[15px] font-bold md:h-9 md:w-[112px] md:text-[14px]",
        disabled ? "bg-soft text-faint" : state === "done" ? "bg-key-soft text-key-strong" : state === "fail" ? "border border-hair bg-[#fff] text-bad" : "bg-key text-white hover:bg-key-strong", className)}>
      {state === "done" ? <Check size={16} /> : <Copy size={16} />}
      {state === "done" ? "복사됨" : state === "fail" ? "다시 복사" : "복사"}
    </button>
  );
}
