"use client";
import { useActionState } from "react";
import type { GenState } from "./[id]/actions";
import { generateFromList, retryFailedFromList } from "./actions";
import { CARD_BTN } from "./stage-dots";

/** 목록 카드의 작은 soft 버튼 중 바로 실행하는 것 (초안 만들기 · 다시 만들기). 결과는 버튼 옆 한 줄 */
export function CardRunButton({ programId, kind, label }: { programId: string; kind: "generate" | "retry"; label: string }) {
  const [state, action, pending] = useActionState<GenState, FormData>(kind === "generate" ? generateFromList : retryFailedFromList, {});
  const msg = state.error ?? state.started;
  return (
    <form action={action} className="relative z-10 flex min-w-0 items-center gap-2">
      <input type="hidden" name="programId" value={programId} />
      {msg && !pending && <span role={state.error ? "alert" : "status"} title={msg} className={state.error ? "min-w-0 truncate text-[12px] text-bad" : "min-w-0 truncate text-[12px] text-ok"}>{msg}</span>}
      <button className={CARD_BTN} disabled={pending}>{pending ? "만드는 중…" : label}</button>
    </form>
  );
}
