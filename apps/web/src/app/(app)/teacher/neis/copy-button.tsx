"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * 확정본을 복사한다 → 나이스 화면의 '나이스 입력' 버튼 창에 Ctrl+V 로 바로 읽는다 (파일 저장 없이).
 * 받아 오는 동안에도 누른 순간의 권한이 살도록 ClipboardItem 에 Promise 를 넘긴다.
 */
export function CopyButton({ href, disabled }: { href: string; disabled?: boolean }) {
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
  return (
    <button type="button" onClick={copy} disabled={disabled || state === "busy"} aria-live="polite"
      className={cx("inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control px-3.5 text-[13px] font-bold disabled:opacity-40",
        state === "done" ? "bg-key-soft text-key-strong" : state === "fail" ? "bg-[#fff] text-bad border border-hair" : "bg-key text-white hover:bg-key-strong")}>
      {state === "done" ? <Check size={15} /> : <Copy size={15} />}
      {state === "done" ? "복사됨" : state === "fail" ? "다시 복사" : "복사"}
    </button>
  );
}
