"use client";
import { useActionState, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { draftReminder, generateDrafts, sendReminder, type GenState, type RemindDraft } from "./actions";

/** T2 AI 배너: 미응답 독촉 메시지 → 문구 확인·수정 → 확인 후 보내기 */
export function RemindBox({ programId, missing, aiOn, last }: { programId: string; missing: number; aiOn: boolean; last: string | null }) {
  const [draft, draftAction, drafting] = useActionState<RemindDraft, FormData>(draftReminder, {});
  const [sent, sendAction, sending] = useActionState<RemindDraft, FormData>(sendReminder, {});
  const [text, setText] = useState<{ n: number; v: string } | null>(null);
  const value = text && text.n === (draft.n ?? 0) ? text.v : draft.text ?? "";
  const [sentFor, setSentFor] = useState(-1);
  const open = !!draft.text && !(sent.sent && sentFor === (draft.n ?? 0));

  return (
    <div id="remind" className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
      <form action={draftAction} className="flex items-center gap-3 md:gap-4">
        <input type="hidden" name="programId" value={programId} />
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", aiOn ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{aiOn ? "AI" : "자동"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">미응답 독촉 메시지</div>
          <div className="truncate text-[13px] text-sub">
            {sent.sent ?? (missing ? `미응답 ${missing}명에게 보낼 문구를 만들어요${last ? ` · 마지막 알림 ${last}` : ""}` : "미응답 학생이 없어요")}
          </div>
        </div>
        <Button size="sm" disabled={!missing || drafting} className="hidden md:inline-flex">{drafting ? "만드는 중…" : "문구 만들기"}</Button>
        <button disabled={!missing || drafting} aria-label="문구 만들기" className="text-mute md:hidden"><ChevronRight size={20} /></button>
      </form>
      {draft.error && <p className="mt-2 text-[13px] text-wait">AI 대신 기본 문구를 넣었어요 ({draft.error})</p>}
      {open && (
        <form action={sendAction} onSubmit={() => setSentFor(draft.n ?? 0)} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="programId" value={programId} />
          <textarea name="message" rows={2} maxLength={300} value={value} onChange={(e) => setText({ n: draft.n ?? 0, v: e.target.value })}
            className="w-full resize-y rounded-field bg-white p-3 text-[14px] outline-none focus:ring-2 focus:ring-key" aria-label="보낼 문구" />
          {sent.error && <p className="text-[13px] text-bad" role="alert">{sent.error}</p>}
          <div className="flex items-center justify-end gap-2">
            <span className="flex-1 text-[12px] text-mute">학생 앱 알림으로 남아요 · 이름은 넣지 않아요</span>
            <Button size="sm" disabled={sending || !value.trim()}><Send size={14} /> {sending ? "보내는 중…" : "확인 후 보내기"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** 초안 만들기 (일괄) */
export function GenerateButton({ programId, ready, disabled }: { programId: string; ready: number; disabled?: boolean }) {
  const [state, action, pending] = useActionState<GenState, FormData>(generateDrafts, {});
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="programId" value={programId} />
      <Button size="sm" kind="outline" className="w-full" disabled={pending || disabled || ready === 0}>
        {pending ? "만드는 중…" : ready ? `초안 만들기 ${ready}명` : "초안 만들기"}
      </Button>
      {state.error && <p className="text-[12px] text-bad" role="alert">{state.error}</p>}
      {state.started && <p className="text-[12px] text-ok" role="status">{state.started}</p>}
    </form>
  );
}
