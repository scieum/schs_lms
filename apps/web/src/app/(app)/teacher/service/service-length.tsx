"use client";
import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { SERVICE_ACTIVITY_MAX_BYTES, serviceActivityCheck } from "@/lib/domain/length";
import { shortenServiceActivity, type ShortenResult } from "./actions";

// 봉사 활동내용 50자 (Figma N42 ④ · 컴포넌트 492:16018): "24자 · 72 / 150B" 칩 · 넘음 줄 · ✦ 줄이기(Haiku) → 줄인 글.
// 막지 않고 경고만 (보내기 · 확인 모두 된다). 줄인 글은 "넣기" · "바꾸고 확인"을 눌러야 저장된다.

export function ServiceLengthChip({ text, className }: { text: string; className?: string }) {
  const c = serviceActivityCheck(text);
  return (
    <span className={cx("inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-1.5 text-[12px] font-medium tabular-nums",
      c.over ? "bg-wait-soft text-[#9A6400]" : "bg-soft text-sub", className)}
      aria-label={`활동내용 ${c.chars}자 · ${c.bytes} / ${SERVICE_ACTIVITY_MAX_BYTES}바이트${c.over ? " · 넘음" : ""}`}>
      {c.over && <span aria-hidden className="size-1.5 rounded-full bg-wait" />}{c.chars}자 · {c.bytes} / {SERVICE_ACTIVITY_MAX_BYTES}B
    </span>
  );
}

/** 넘음 줄 + ✦ 줄이기 + 줄인 글 상자 (확인서 올리기 · 받은함이 같이 쓴다). editable = 받은함(줄인 글을 고칠 수 있음) */
/** 줄이기 상태 (버튼 자리가 화면마다 달라 훅으로) */
export function useShorten(text: string, studentId?: string | null) {
  const [res, setRes] = useState<ShortenResult | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    const r = await shortenServiceActivity({ text, studentId }).catch((): ShortenResult => ({ ok: false, error: "줄이지 못했어요 · 다시 눌러 주세요" }));
    setRes(r);
    if (r.ok) setDraft(r.text);
    setPending(false);
  };
  return { res, setRes, draft, setDraft, pending, run };
}

export function ShortenButton({ sh, full }: { sh: ReturnType<typeof useShorten>; full?: boolean }) {
  return (
    <button type="button" onClick={sh.run} disabled={sh.pending}
      className={cx("inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:opacity-50", full ? "h-11 md:h-8" : "h-8")}>
      <Sparkles size={13} /> {sh.pending ? "줄이는 중…" : "줄이기"}
    </button>
  );
}

export function ShortenBox({ text, studentId, onApply, applyLabel, keepLabel = "그대로 두기", editable = false, hint, busy, sh: given, line = true }: {
  text: string; studentId?: string | null; onApply: (v: string) => void | Promise<void>; applyLabel: string; keepLabel?: string; editable?: boolean; hint?: string; busy?: boolean;
  /** 받은함처럼 버튼이 밖에 있으면 같은 상태를 넘긴다 */ sh?: ReturnType<typeof useShorten>; line?: boolean;
}) {
  const own = useShorten(text, studentId);
  const { res, setRes, draft, setDraft } = given ?? own;
  const ok = res?.ok ? res : null;
  return (
    <div className={cx("flex flex-col gap-2", !line && !res && "hidden")}>
      {!ok && line && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <p className="flex min-w-0 flex-1 items-start gap-1.5 break-keep text-[13px] font-medium text-[#9A6400]">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait" />
            <span>활동내용이 50자(나이스 150B)를 넘어요<span className="hidden md:inline"> · 나이스 칸에 다 들어가지 않아요</span></span>
          </p>
          <ShortenButton sh={given ?? own} full />
        </div>
      )}
      {res && !res.ok && <p className="text-[12px] text-bad" role="alert">{res.error}</p>}
      {ok && (
        <div className={cx("flex flex-col gap-2.5 rounded-inner p-3.5", editable ? "bg-bg" : "border border-line bg-[#fff]")}>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-[#0B8FB0]"><Sparkles size={13} />줄인 글</span>
            <span className="hidden min-w-0 truncate text-[12px] text-mute md:inline">{editable ? "확인서에 있는 말로만 줄였어요 · 고쳐 써도 돼요" : "뜻은 그대로 · 확인서에 있는 말로만"}</span>
            <span className="flex-1" />
            <ServiceLengthChip text={editable ? draft : ok.text} />
          </div>
          {editable ? (
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} aria-label="줄인 활동내용"
              className="h-11 w-full rounded-field border-[1.5px] border-key bg-[#fff] px-3 text-[14px] outline-none" />
          ) : <p className="text-[14px] leading-[22px]">{ok.text}</p>}
          {ok.notice && <p className="text-[12px] text-[#9A6400]">{ok.notice}</p>}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-[12px] text-mute">
              {hint ?? <><Lock size={11} className="shrink-0" /> 학생 이름 없이 활동내용만 보내요</>}
            </span>
            <div className="flex gap-2 [&>*]:h-11 [&>*]:flex-1 md:[&>*]:h-8 md:[&>*]:flex-none">
              <button type="button" onClick={() => setRes(null)} className="whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold">{keepLabel}</button>
              <button type="button" disabled={busy || (editable ? draft.trim().length < 2 : false)} onClick={() => onApply((editable ? draft : ok.text).trim())}
                className="whitespace-nowrap rounded-control bg-key px-3 text-[13px] font-bold text-white hover:bg-key-strong disabled:opacity-40">{applyLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
