"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Layers, RotateCw, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";
import { measure, type LengthUnit } from "@/lib/domain/length";
import type { VariantMode, VariantsActionResult } from "@/lib/domain/variants";

// 다른 버전 (Figma N34 ② 417:95038 · 417:95759): 본문 칸 바로 아래 패널. [뜻 그대로 | 새롭게] · 3개 · 교사가 정한 분량 안.
// 결과는 저장하지 않는다 — "이걸로 바꾸기"를 눌러야 본문이 바뀐다(스낵바 되돌리기).

const MODES: [VariantMode, string][] = [["keep", "뜻 그대로"], ["fresh", "새롭게"]];
const unitMark = (u: LengthUnit) => (u === "bytes" ? "B" : "자");

/** 본문 머리의 글자 버튼 "다른 버전" */
export function VariantsToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 py-[3px] text-[13px] font-medium", on ? "bg-key-soft text-key-strong" : "text-sub hover:bg-soft")}>
      <Layers size={14} /> 다른 버전
    </button>
  );
}

export function VariantsPanel({ run, unit, max, onPick, onClose }: {
  run: (mode: VariantMode) => Promise<VariantsActionResult>;
  unit: LengthUnit;
  max: number;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<VariantMode>("keep");
  const [res, setRes] = useState<Partial<Record<VariantMode, VariantsActionResult>>>({});
  const [busy, start] = useTransition();
  const asked = useRef<Set<VariantMode>>(new Set());
  const make = (m: VariantMode) => start(async () => {
    try { const r = await run(m); setRes((x) => ({ ...x, [m]: r })); } catch { setRes((x) => ({ ...x, [m]: { ok: false, error: "버전을 만들지 못했어요. 다시 만들어 주세요" } })); }
  });
  useEffect(() => {
    if (asked.current.has(mode)) return;
    asked.current.add(mode);
    make(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const cur = busy ? undefined : res[mode];
  const loading = busy || !cur;
  const limit = `${max.toLocaleString()}${unitMark(unit)} 안에서 3개`;
  const segment = (
    <div role="tablist" aria-label="버전 방식" className="flex shrink-0 rounded-full bg-[#fff] p-[3px]">
      {MODES.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} disabled={busy && mode !== k}
          className={cx("h-8 flex-1 whitespace-nowrap rounded-full px-3.5 text-[13px] @lg:h-7 @lg:flex-none", mode === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>{l}</button>
      ))}
    </div>
  );
  const again = (
    <button type="button" onClick={() => make(mode)} disabled={busy} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-sub disabled:opacity-40">
      <RotateCw size={13} /> 다시 만들기
    </button>
  );
  const close = <button type="button" onClick={onClose} aria-label="다른 버전 닫기" className="flex size-6 shrink-0 items-center justify-center text-mute"><X size={16} /></button>;

  return (
    <section className="@container flex flex-col gap-3 rounded-inner bg-bg px-4 py-3.5" aria-label="다른 버전">
      {/* 넓은 단: 한 줄 */}
      <div className="hidden items-center gap-3 @lg:flex">
        <span className="text-[14px] font-bold">다른 버전</span>
        {segment}
        <span className="min-w-0 flex-1 truncate text-[12px] text-mute">{limit}{loading ? "" : " · 지금 본문은 그대로예요"}</span>
        {again}{close}
      </div>
      {/* 좁은 단: 제목 ↔ × / 세그먼트 / 분량 ↔ 다시 만들기 */}
      <div className="flex flex-col gap-2.5 @lg:hidden">
        <div className="flex items-center justify-between"><span className="text-[14px] font-bold">다른 버전</span>{close}</div>
        <div className="[&>div]:w-full">{segment}</div>
        <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-mute">{limit}</span>{again}</div>
      </div>

      {loading || !cur ? (
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-sub" role="status"><Sparkles size={14} className="text-new" /> 버전 3개를 만드는 중이에요</p>
          <div className="grid gap-3 @lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden className="flex flex-col gap-2.5 rounded-inner border border-line bg-[#fff] p-3.5">
                <div className="flex justify-between"><span className="h-3 w-12 rounded-[3px] bg-soft" /><span className="h-3 w-10 rounded-[3px] bg-soft" /></div>
                <span className="h-2.5 rounded-[3px] bg-soft" /><span className="h-2.5 rounded-[3px] bg-soft" /><span className="h-2.5 rounded-[3px] bg-soft" />
                <span className="h-2.5 w-4/5 rounded-[3px] bg-soft" />
                <span className="mt-1 h-[34px] rounded-control bg-soft" />
              </div>
            ))}
          </div>
        </>
      ) : !cur.ok ? (
        <p className="text-[13px] text-bad" role="alert">{cur.error}</p>
      ) : (
        <>
          {(cur.sample || cur.notice) && (
            <p className="flex items-center gap-1.5 text-[12px] text-mute">
              {cur.sample && <span className="rounded-chip bg-[#fff] px-1.5 py-px text-[11px] font-medium text-mute">예시</span>}
              {cur.notice}
            </p>
          )}
          <div className="grid gap-3 @lg:grid-cols-3">
            {cur.versions.map((v, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] p-3.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold">버전 {i + 1}</span>
                  {v.block && <span className="whitespace-nowrap rounded-chip bg-bad-soft px-1.5 py-px text-[11px] font-bold text-bad">확정 불가</span>}
                  <span className="ml-auto text-[12px] tabular-nums text-mute">{measure(v.text, unit).toLocaleString()}{unitMark(unit)}</span>
                </div>
                <p className="flex-1 whitespace-pre-wrap break-keep text-[13px] leading-[21px]">{v.text}</p>
                <button type="button" onClick={() => onPick(v.text)}
                  className="h-10 w-full rounded-control bg-key-soft text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] @lg:h-[34px]">이걸로 바꾸기</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
