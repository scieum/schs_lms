"use client";
import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import { adviseAction, retryDrafts, type AdviceState } from "./actions";

/** A4·오류 처리 배너: 규칙 요약 한 줄 + "해결 제안"(키가 있으면 AI가 조치 문장으로) + 다시 시도 */
export function AdviceBanner({ title, line, failed, aiOn, retryLabel = "다시 시도" }: { title: string; line: string; failed: number; aiOn: boolean; retryLabel?: string }) {
  const [st, act, busy] = useActionState<AdviceState, FormData>(adviseAction, {});
  const [hidden, setHidden] = useState(-1);
  const label = st.label ?? (aiOn ? "AI" : "자동");
  const open = !!st.lines?.length && hidden !== (st.n ?? 0);
  return (
    <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
      <div className="flex items-center gap-3 md:gap-4">
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{title}</div>
          <div className="truncate text-[13px] text-sub">{busy ? "만드는 중이에요" : line}</div>
        </div>
        <form action={act}>
          <Button size="sm" kind="outline" disabled={busy || failed === 0}>{busy ? "만드는 중…" : "해결 제안"}</Button>
        </form>
        <form action={retryDrafts}>
          <Button size="sm" disabled={failed === 0}>{retryLabel}</Button>
        </form>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
          {st.error && <p className="text-wait">AI 대신 규칙으로 정리했어요 ({st.error})</p>}
          <ul className="flex flex-col gap-1.5">
            {st.lines!.map((l) => <li key={l} className="rounded-inner bg-white px-4 py-2.5 text-[14px]">{l}</li>)}
          </ul>
          <Button type="button" size="sm" kind="ghost" className="self-end" onClick={() => setHidden(st.n ?? 0)}>닫기</Button>
        </div>
      )}
    </div>
  );
}
