"use client";
import { useActionState, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { analyzeResponsesAction, draftReminder, generateDrafts, sendReminder, type AnalyzeState, type GenState, type RemindDraft } from "./actions";

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
        <span className="hidden md:block"><Button size="sm" kind="outline" disabled={!missing || drafting}>{drafting ? "만드는 중…" : "문구 만들기"}</Button></span>
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

/** T2 응답 분석: 설문 답 → 공통 주제·눈에 띄는 응답·근거가 얇은 학생 (화면 표시만, 저장하지 않음) */
export function AnalyzeBox({ programId, submitted, aiOn }: { programId: string; submitted: number; aiOn: boolean }) {
  const [st, act, busy] = useActionState<AnalyzeState, FormData>(analyzeResponsesAction, {});
  const [hidden, setHidden] = useState(-1);
  const label = st.label ?? (aiOn ? "AI" : "자동");
  const open = !!st.themes && hidden !== (st.n ?? 0);
  return (
    <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
      <form action={act} className="flex items-center gap-3 md:gap-4">
        <input type="hidden" name="programId" value={programId} />
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">응답 분석</div>
          <div className="truncate text-[13px] text-sub">
            {busy ? "읽는 중이에요" : st.error && !st.themes ? st.error : submitted ? `제출 ${submitted}명의 답에서 공통 주제·근거 부족 학생을 찾아요` : "제출된 응답이 아직 없어요"}
          </div>
        </div>
        <Button size="sm" kind="outline" disabled={busy || !submitted}>{busy ? "보는 중…" : open ? "다시 분석" : "분석하기"}</Button>
      </form>
      {open && (
        <div className="mt-3 flex flex-col gap-2.5 text-[13px]">
          {st.error && <p className="text-wait">AI 대신 규칙으로 봤어요 ({st.error})</p>}
          {st.summary && <p className="rounded-inner bg-white px-4 py-3 text-[14px]">{st.summary}</p>}
          <div className="grid gap-2.5 md:grid-cols-3">
            <div className="flex flex-col gap-1.5 rounded-inner bg-white p-3.5">
              <span className="font-bold">공통 주제</span>
              {st.themes!.length ? <div className="flex flex-wrap gap-1.5">{st.themes!.map((t) => <span key={t} className="rounded-chip bg-soft px-2 py-1 text-sub">{t}</span>)}</div> : <span className="text-mute">겹치는 주제가 적어요</span>}
            </div>
            <div className="flex flex-col gap-1.5 rounded-inner bg-white p-3.5">
              <span className="font-bold">눈에 띄는 응답</span>
              {st.highlights!.length ? st.highlights!.map((x) => <span key={x.who} className="text-sub"><b className="font-medium text-ink">{x.who}</b> · {x.note}</span>) : <span className="text-mute">없어요</span>}
            </div>
            <div className="flex flex-col gap-1.5 rounded-inner bg-white p-3.5">
              <span className="font-bold">근거가 얇은 학생</span>
              {st.thin!.length ? st.thin!.map((x) => <span key={x.who} className="text-sub"><b className="font-medium text-ink">{x.who}</b> · {x.note}</span>) : <span className="text-mute">없어요</span>}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="flex-1 text-[12px] text-mute">이름·학번은 가린 뒤 가명ID로 보내요 · 저장하지 않아요</span>
            <Button type="button" size="sm" kind="ghost" onClick={() => setHidden(st.n ?? 0)}>닫기</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 표 위 거르기 칸: 고르면 바로 적용 (찾기 버튼 없이) */
export function AutoSelect({ name, value, label, options }: { name: string; value: string; label: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-9 shrink-0 rounded-field bg-white px-3 text-[13px] outline-none">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
