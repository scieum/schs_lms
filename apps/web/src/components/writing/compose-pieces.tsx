"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Layers, Plus, Star } from "lucide-react";
import { cx } from "@/components/ui";
import { activityTag, stripActivity } from "@/lib/domain/activity-name";
import { activeQuick, QUICK_LABEL, quickPick } from "@/lib/domain/memo-gate";
import type { Importance, MergePiece } from "@/lib/domain/merge";
import { PERIOD_LABEL, PERIODS, pickedSummary, type Period, type SourceChip, type SourceFilter } from "@/lib/domain/compose";
import { PieceChip } from "./piece-chip";

// 글 짓기 조각 칸 (Figma N52 597:1168 · 조각 행 596:1477): 머리 "조각 · 5개 중 4개 고름" ↔ [전체 해제] → 출처 칩(0은 숨김, 넘치면 옆으로) →
// 빠르게 고르기(N49 모두 · 꼭 넣기만 · 최근 3개) ↔ [기간 전체 ▾] → 조각 행(체크 · 출처 · 날짜 · 활동명 / 글 2줄 · [★ 꼭] · 위/아래) → 바닥 "고른 조각 n개 · n자".
// 체크 · 꼭 · 순서 규칙은 memo-collect(N41 · N49)와 같다(quickPick · 꼭 = 중요도 3). 모바일은 3행 + "조각 n개 더 보기".

const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "지금");
const MOBILE_SHOWN = 3;

export type ComposePiece = MergePiece & { weight: Importance };

export function ComposePieces({ all, visible, selected, setSelected, onWeight, onMove, chips, source, setSource, period, setPeriod, collectHref, loading }: {
  /** 이 학생 조각 전부 (교사가 정한 순서) */
  all: ComposePiece[];
  /** 출처 · 기간으로 거른 것 */
  visible: ComposePiece[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onWeight: (id: string, w: Importance) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  chips: SourceChip[];
  source: SourceFilter;
  setSource: (s: SourceFilter) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  /** 빈 칸 [＋ 조각 모으기로] */
  collectHref: string;
  loading: boolean;
}) {
  const [more, setMore] = useState(false);
  const picked = visible.filter((p) => selected.has(p.id));
  const sum = pickedSummary(picked);
  const quick = activeQuick(visible, selected);
  // 하나라도 고르면 "전체 해제", 아무것도 안 고르면 "전체 선택" (시안 598:15582)
  const anyOn = picked.length > 0;
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };

  if (loading) {
    return (
      <Pane head={<Head title="조각" meta="" />}>
        <p className="py-6 text-center text-[13px] text-mute" role="status">조각을 불러오는 중이에요</p>
      </Pane>
    );
  }
  if (all.length === 0) {
    return (
      <Pane head={<Head title="조각" meta="0개" />}>
        {/* 빈 칸 (N52 g1): 왼쪽 칸만 비고 오른쪽 글 칸은 그대로 */}
        <div className="flex flex-col items-center gap-3 rounded-inner bg-bg px-4 py-10 text-center">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-card bg-key-soft text-key"><Layers size={24} /></span>
          <span className="text-[16px] font-bold">조각이 아직 없어요</span>
          <Link href={collectHref} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-3.5 text-[14px] font-bold text-key-strong hover:bg-[#e3e7ff]">
            <Plus size={15} aria-hidden /> 조각 모으기로
          </Link>
        </div>
      </Pane>
    );
  }

  return (
    <Pane
      head={
        <Head title="조각" meta={`${visible.length}개 중 ${picked.length}개 고름`}
          right={
            <button type="button" disabled={!visible.length} onClick={() => setSelected(new Set(anyOn ? [...selected].filter((id) => !visible.some((p) => p.id === id)) : [...selected, ...visible.map((p) => p.id)]))}
              className="shrink-0 whitespace-nowrap text-[13px] font-medium text-sub hover:text-ink disabled:text-faint">
              {anyOn ? "전체 해제" : "전체 선택"}
            </button>
          } />
      }
      foot={<p className="text-[12px] font-medium tabular-nums text-mute">고른 조각 {sum.count}개 · {sum.chars.toLocaleString()}자</p>}
    >
      {/* 출처 칩: 꺾지 않고 넘치면 옆으로 */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="출처">
        <div className="flex w-max gap-1.5">
          {chips.map((c) => {
            const on = source === c.key;
            return (
              <button key={c.key} type="button" aria-pressed={on} onClick={() => setSource(c.key)}
                className={cx("inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-chip border px-2 text-[12px] tabular-nums",
                  on ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub hover:bg-soft")}>
                {c.key} {c.n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="빠르게 고르기">
          {(["all", "must", "recent"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={quick === k}
              onClick={() => setSelected(new Set([...[...selected].filter((id) => !visible.some((p) => p.id === id)), ...quickPick(visible, k)]))}
              className={cx("inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-chip border px-2 text-[12px]",
                quick === k ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub hover:bg-soft")}>
              {QUICK_LABEL[k]}
            </button>
          ))}
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-inner bg-bg px-4 py-6 text-center text-[13px] text-mute">이 기간 · 출처에는 조각이 없어요</p>
      ) : (
        <ul className="flex flex-col" aria-label="조각">
          {visible.map((p, i) => {
            const on = selected.has(p.id);
            const at = all.indexOf(p);
            const act = activityTag(p.text);
            const body = act ? stripActivity(p.text) : p.text.trim();
            const must = p.weight === 3;
            return (
              <li key={p.id} className={cx("flex gap-2.5 py-3", i > 0 && "border-t border-line", !more && i >= MOBILE_SHOWN && "max-md:hidden")}>
                <label className="flex min-w-0 flex-1 cursor-pointer gap-2.5">
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(p.id)} />
                  <span aria-hidden className={cx("mt-px flex size-5 shrink-0 items-center justify-center rounded-chip peer-focus-visible:ring-2 peer-focus-visible:ring-key",
                    on ? "bg-key text-white" : "border-[1.5px] border-faint bg-[#fff]")}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <PieceChip source={p.source} />
                      <span className="shrink-0 text-[12px] tabular-nums text-mute">{md(p.date)}</span>
                      {act && <span className={cx("min-w-0 truncate text-[13px] font-bold", !on && "text-mute")}>{act}</span>}
                    </span>
                    <span className={cx("line-clamp-2 text-[13px] leading-5 break-keep", on ? "text-sub" : "text-mute")}>{body}</span>
                  </span>
                </label>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <button type="button" aria-pressed={must} aria-label={must ? "꼭 넣기 빼기" : "꼭 넣기"} onClick={() => onWeight(p.id, must ? 2 : 3)}
                    className={cx("inline-flex h-6 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-chip px-1.5 text-[12px] font-bold",
                      must ? "bg-wait-soft text-[#9A6400]" : "border border-line bg-[#fff] font-medium text-mute hover:bg-soft")}>
                    <Star size={11} fill={must ? "currentColor" : "none"} aria-hidden /> 꼭
                  </button>
                  <span className="flex gap-0.5">
                    <button type="button" aria-label="위로" disabled={at <= 0} onClick={() => onMove(p.id, -1)}
                      className="flex size-6 items-center justify-center rounded-chip text-mute hover:bg-soft disabled:opacity-30"><ChevronUp size={15} /></button>
                    <button type="button" aria-label="아래로" disabled={at >= all.length - 1} onClick={() => onMove(p.id, 1)}
                      className="flex size-6 items-center justify-center rounded-chip text-mute hover:bg-soft disabled:opacity-30"><ChevronDown size={15} /></button>
                  </span>
                </span>
              </li>
            );
          })}
          {visible.length > MOBILE_SHOWN && (
            <li className="border-t border-line md:hidden">
              <button type="button" onClick={() => setMore(!more)} className="flex h-11 w-full items-center justify-center gap-1 whitespace-nowrap text-[14px] font-bold text-key-strong">
                {more ? "접기" : `조각 ${visible.length - MOBILE_SHOWN}개 더 보기`} <ChevronDown size={15} className={cx(more && "rotate-180")} aria-hidden />
              </button>
            </li>
          )}
        </ul>
      )}
    </Pane>
  );
}

function Pane({ head, foot, children }: { head: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label="조각" className="surface flex min-w-0 flex-col gap-3 rounded-card px-4 py-4 md:h-full md:px-4 md:py-5">
      {head}
      {children}
      {foot && <div className="mt-auto pt-1">{foot}</div>}
    </section>
  );
}

function Head({ title, meta, right }: { title: string; meta: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="shrink-0 text-[17px] font-bold">{title}</h2>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium tabular-nums text-sub">{meta}</span>
      {right}
    </div>
  );
}

/** [기간 전체 ▾] (#F2F4F6 28): 전체 · 이번 달 · 1학기 · 2학기 */
function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className={cx("inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[12px] font-medium", value === "전체" ? "bg-soft text-sub" : "bg-key-soft font-bold text-key-strong")}>
        {PERIOD_LABEL[value]} <ChevronDown size={13} className={cx(open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="기간" className="absolute right-0 top-[calc(100%+6px)] z-30 w-[140px] rounded-card border border-line bg-[#fff] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
          {PERIODS.map((p) => (
            <button key={p} type="button" role="option" aria-selected={p === value} onClick={() => { onChange(p); setOpen(false); }}
              className={cx("flex h-9 w-full items-center gap-2 rounded-control px-2.5 text-left text-[13px]", p === value ? "bg-key-soft font-bold text-key-strong" : "font-medium hover:bg-soft")}>
              <span className="flex-1 whitespace-nowrap">{p === "전체" ? "전체" : p}</span>
              {p === value && <Check size={14} strokeWidth={2.5} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
