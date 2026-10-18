"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, FileText, RotateCw, Send, Sparkles, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { STAGES, type NextAction, type Stage } from "@/lib/domain/program-stage";
import { generateDrafts, retryFailedDrafts, setProgramStatus, type GenState } from "./actions";
import { RemindBox } from "./parts";

// 프로그램 상세 단계 (Figma N16 상세 285:4342 · 286:4325): 다섯 단계 표시 + 지금 할 일 버튼 하나
// 모바일은 탭바 바로 위에 고정, PC는 단계 카드 오른쪽 아래.

const SUB = ["설문·서류 모으기", "응답 끝", "AI가 초안 만들기", "초안 검토 화면", "담임 받은 초안으로"];

export function StageStepper({ stage, pct, actions }: { stage: Stage; pct: number; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-start">
        {STAGES.map((label, i) => {
          const done = i < stage.index;
          const now = i === stage.index;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
              {/* 앞 단계 점에서 이 점까지 잇는 선 */}
              {i > 0 && <span aria-hidden className={cx("absolute left-[-50%] top-[11px] h-0.5 w-full", i <= stage.index ? "bg-[#9EAAFF]" : "bg-line")} />}
              <span className={cx("relative z-[1] flex size-6 items-center justify-center rounded-full text-[12px] font-bold",
                now ? "bg-key text-white" : done ? "bg-key-soft text-key-strong" : "border-[1.5px] border-hair bg-[#fff] text-mute")}>
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cx("whitespace-nowrap text-[12px]", now ? "font-bold text-key-strong" : "text-mute")}>{label}</span>
              <span className="hidden whitespace-nowrap text-[11px] text-faint md:block">{SUB[i]}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-end gap-6 border-t border-line pt-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[14px]"><b className="text-[16px]">{stage.line.split(" · ")[0]}</b>{stage.line.includes(" · ") && <span className="text-mute"> · {stage.line.split(" · ").slice(1).join(" · ")}</span>}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-line md:max-w-[300px]" aria-hidden>
          <div className="h-full rounded-full bg-key" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
      {actions && <div className="hidden shrink-0 md:block">{actions}</div>}
      </div>
    </div>
  );
}

type Ctx = { programId: string; missing: number; aiOn: boolean; last: string | null };

/** 단계에 맞는 버튼 (주 버튼 하나 + 둘째 버튼). 모바일은 고정 바, PC는 카드 안 */
export function NextActions({ stage, ctx, mobile }: { stage: Stage; ctx: Ctx; mobile?: boolean }) {
  const [remind, setRemind] = useState(false);
  const openRemind = () => setRemind(true);
  const h = mobile ? "h-[52px] text-[15px]" : "h-11 text-[14px]";
  const bar = (
    <div className={cx("flex items-center gap-2", mobile ? "w-full" : "justify-end")}>
      {stage.secondary && <ActionButton a={stage.secondary} ctx={ctx} kind="outline" cls={cx(h, mobile ? "w-[112px] shrink-0" : "px-4")} onRemind={openRemind} />}
      <ActionButton a={stage.next} ctx={ctx} kind="primary" cls={cx(h, mobile ? "flex-1" : "px-5")} onRemind={openRemind} />
    </div>
  );
  return (
    <>
      {mobile ? (
        <div data-sticky-cta className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+66px)] z-20 border-t border-line bg-[#fff] px-5 py-3 md:hidden">{bar}</div>
      ) : bar}
      {remind && <RemindSheet ctx={ctx} onClose={() => setRemind(false)} />}
    </>
  );
}

/** 미응답 알리기 시트 (모바일 아래 시트 · PC 가운데 창). 목록의 '알리기'로 들어오면(?remind=1) 열린 채로 시작 */
export function RemindSheet({ ctx, onClose, startOpen }: { ctx: Ctx; onClose?: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen ?? true);
  if (!open) return null;
  const close = () => { setOpen(false); onClose?.(); };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="미응답 알리기" onClick={close}>
      <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-t-card bg-[#fff] p-5 md:rounded-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
          <h2 className="flex-1 text-[17px] font-bold">미응답 {ctx.missing}명에게 알리기</h2>
          <button type="button" onClick={close} aria-label="닫기" className="text-mute"><X size={20} /></button>
        </div>
        <RemindBox programId={ctx.programId} missing={ctx.missing} aiOn={ctx.aiOn} last={ctx.last} />
      </div>
    </div>
  );
}

function ActionButton({ a, ctx, kind, cls, onRemind }: { a: NextAction; ctx: Ctx; kind: "primary" | "outline"; cls: string; onRemind: () => void }) {
  const [gen, genAction, generating] = useActionState<GenState, FormData>(generateDrafts, {});
  const [retry, retryAction, retrying] = useActionState<GenState, FormData>(retryFailedDrafts, {});
  const msg = gen.error ?? gen.started ?? retry.error ?? retry.started;
  const base = cx("whitespace-nowrap", cls.includes("flex-1") || cls.includes("w-[") ? "w-full" : "", cls);
  const hidden = <input type="hidden" name="programId" value={ctx.programId} />;
  const note = msg && <span className="sr-only" role="status">{msg}</span>;

  switch (a.kind) {
    case "remind":
      return <Button type="button" kind={kind} className={base} onClick={onRemind}><Send size={16} /> {a.label}</Button>;
    case "close":
    case "publish":
      return (
        <form action={setProgramStatus} className={cx(cls.includes("flex-1") && "flex-1")}>
          {hidden}
          <input type="hidden" name="to" value={a.kind === "close" ? "closed" : "open"} />
          <Button kind={kind} className={base}>{a.label}</Button>
        </form>
      );
    case "generate":
      return (
        <form action={genAction} className={cx(cls.includes("flex-1") && "flex-1")}>
          {hidden}{note}
          <Button kind={kind} className={base} disabled={generating}><Sparkles size={16} /> {generating ? "만드는 중…" : gen.started ? "만들고 있어요" : a.label}</Button>
        </form>
      );
    case "retry":
      return (
        <form action={retryAction} className={cx(cls.includes("flex-1") && "flex-1")}>
          {hidden}{note}
          <Button kind={kind} className={base} disabled={retrying}><RotateCw size={16} /> {retrying ? "다시 만드는 중…" : retry.started ? "다시 만들고 있어요" : a.label}</Button>
        </form>
      );
    case "review":
      return <Link href={`/teacher/drafts?program=${ctx.programId}`} className={cx("inline-flex items-center justify-center gap-1.5 rounded-control font-medium", kind === "primary" ? "bg-key text-white hover:bg-key-strong" : "border border-hair bg-[#fff]", base)}><FileText size={16} /> {a.label}</Link>;
    default:
      return <Button type="button" kind={kind} className={base} disabled>{a.label}</Button>;
  }
}
