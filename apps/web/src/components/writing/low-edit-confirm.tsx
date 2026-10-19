"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

// 적게 고친 채 확정 (Figma N38 (d) 471:23704 · 473:23263): PC 가운데 모달 460 / 모바일 바텀시트. 뒤 네이비 50% 딤.
// 까닭(한 줄, 60자)을 적어야 "그래도 확정". 기본 초점·주 버튼은 "더 고치기"(안전한 선택), Esc = 더 고치기.
// 까닭은 이 기록에만 남고 감사 기록에는 비율 숫자만 (서버가 다시 계산한다).

export const LOW_EDIT_REASON_MAX = 60;

export function LowEditConfirm({ ratio, min, nosource, onConfirm, onMore }: {
  ratio: number;
  min: number;
  /** 근거 없는 문장 수 (0이면 줄을 숨긴다) */
  nosource: number;
  onConfirm: (reason: string) => void;
  /** 더 고치기: 닫고 본문으로 초점 */
  onMore: () => void;
}) {
  const [reason, setReason] = useState("");
  const more = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    more.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onMore(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onMore]);
  const ok = !!reason.trim();
  const confirmBtn = (
    <button type="button" disabled={!ok} onClick={() => onConfirm(reason.trim())}
      className={cx("h-12 w-full whitespace-nowrap rounded-control border border-hair bg-[#fff] text-[15px] font-medium text-ink md:h-10 md:flex-1 md:text-[14px]", !ok && "cursor-not-allowed text-ink/40")}>
      그래도 확정
    </button>
  );
  const moreBtn = (
    <button ref={more} type="button" onClick={onMore}
      className="h-12 w-full whitespace-nowrap rounded-control bg-key text-[15px] font-bold text-white hover:bg-key-strong md:h-10 md:flex-1 md:text-[14px]">
      더 고치기
    </button>
  );
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-navy/50 md:items-center md:px-6" onClick={onMore}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="low-edit-title" aria-describedby="low-edit-desc" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:w-[460px] md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-wait-soft text-[18px] font-bold text-wait">!</span>
        <div className="flex flex-col gap-1.5">
          <h2 id="low-edit-title" className="text-[17px] font-bold md:text-[18px]">AI 문장을 거의 그대로 확정하려고 해요</h2>
          <p id="low-edit-desc" className="break-keep text-[14px] leading-[22px] text-sub">관찰한 내용으로 고쳐 주세요. 생기부는 선생님이 직접 보고 확인한 사실을 적는 기록이에요.</p>
        </div>
        <dl className="flex flex-col gap-2.5 rounded-inner bg-bg px-3.5 py-3 text-[13px]">
          <div className="flex items-center gap-2">
            <dt className="min-w-0 flex-1 text-sub">AI 원안에서 고친 비율</dt>
            <dd className="flex items-baseline gap-1.5"><b className="text-[14px] tabular-nums text-[#9A6400]">{ratio}%</b><span className="text-[12px] text-mute">기준 {min}%</span></dd>
          </div>
          {nosource > 0 && (
            <div className="flex items-center gap-2">
              <dt className="min-w-0 flex-1 text-sub">근거 없는 문장</dt>
              <dd><b className="text-[14px] tabular-nums text-[#9A6400]">{nosource}문장</b></dd>
            </div>
          )}
        </dl>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">그래도 확정하는 까닭 (한 줄)</span>
          <span className="flex h-11 items-center gap-2 rounded-field border border-hair bg-[#fff] px-3 focus-within:ring-2 focus-within:ring-key">
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, LOW_EDIT_REASON_MAX))} maxLength={LOW_EDIT_REASON_MAX}
              placeholder="예: 수업 중 직접 보고 확인한 내용과 같아요" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (ok) onConfirm(reason.trim()); } }} />
            <span className="shrink-0 text-[12px] tabular-nums text-mute">{reason.length}/{LOW_EDIT_REASON_MAX}</span>
          </span>
        </label>
        {/* PC: [그래도 확정] [더 고치기] / 모바일: 더 고치기 위 · 그래도 확정 아래 */}
        <div className="flex flex-col-reverse gap-2 md:flex-row">{confirmBtn}{moreBtn}</div>
        <p className="break-keep text-[12px] leading-[18px] text-mute">까닭을 적어야 ‘그래도 확정’을 누를 수 있어요 · 까닭은 이 기록에만, 감사 기록에는 비율 숫자만 남아요</p>
      </div>
    </div>
  );
}
