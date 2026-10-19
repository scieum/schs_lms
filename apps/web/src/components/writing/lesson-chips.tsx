"use client";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Check, ChevronDown, Layers, List, X } from "lucide-react";
import { cx } from "@/components/ui";
import { byNo, lessonMd, nearToday, type LessonChipItem } from "@/lib/domain/lesson-plan";

// N43 차시 칩 (492:26464): 기본(흰 · 1px 선) · 고름(#EEF0FF + 1.5px 인디고) · 남김(#F5F6F8 · ✓ 초록 · 글 회색 — 그래도 누를 수 있음).
// 메모 칸 차시 메뉴 (N43 (f)): 머리 "차시별 활동" ↔ "여러 학생에게 ›" → 칩 한 줄(오늘에 가까운 차시부터) + "전체 16 ▾".
// 칩 ⋯ (PC 오른쪽 클릭 · 모바일 길게 누르기) = "공통 활동으로 만들기" (N26 연결).

export type ChipState = "base" | "picked" | "done";

export function LessonChip({ item, state, onClick, onMenu, className }: {
  item: LessonChipItem; state: ChipState; onClick?: () => void; onMenu?: (at: { x: number; y: number }) => void; className?: string;
}) {
  const timer = useRef<number | null>(null);
  const long = useRef(false);
  const menu = (e: MouseEvent) => { if (!onMenu) return; e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); };
  const down = (e: PointerEvent) => {
    if (!onMenu || e.pointerType !== "touch") return;
    long.current = false;
    const at = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => { long.current = true; onMenu(at); }, 550);
  };
  const up = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  return (
    <button type="button" aria-pressed={state === "picked"} onClick={() => { if (long.current) { long.current = false; return; } onClick?.(); }}
      onContextMenu={menu} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
      title={item.detail || undefined}
      className={cx("inline-flex h-8 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[13px] [-webkit-touch-callout:none]",
        state === "picked" ? "border-[1.5px] border-key bg-key-soft" : state === "done" ? "border border-line bg-bg" : "border border-line bg-[#fff] hover:bg-bg", className)}>
      {state === "done" && <Check size={12} strokeWidth={3} className="text-ok" aria-label="남김" />}
      <span className={cx("text-[12px] font-bold", state === "done" ? "text-sub" : "text-key-strong")}>{item.no}차시</span>
      <span className={cx("font-medium", state === "done" ? "text-sub" : "text-ink")}>{item.title}</span>
      {item.date && <span className="text-[12px] text-mute">{lessonMd(item.date)}</span>}
    </button>
  );
}

/** 칩 ⋯ 메뉴 (공통 활동으로 만들기) */
export function ChipMenu({ at, onCommon, onClose }: { at: { x: number; y: number }; onCommon: () => void; onClose: () => void }) {
  useEffect(() => {
    const off = () => onClose();
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => { window.removeEventListener("scroll", off, true); window.removeEventListener("resize", off); };
  }, [onClose]);
  const left = typeof window !== "undefined" ? Math.min(at.x, window.innerWidth - 220) : at.x;
  return (
    <div className="fixed inset-0 z-[95]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div role="menu" className="absolute w-[208px] rounded-inner border border-line bg-[#fff] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]" style={{ left, top: at.y + 6 }}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => { onClose(); onCommon(); }}
          className="flex h-10 w-full items-center gap-2 rounded-control px-2.5 text-left text-[14px] font-medium hover:bg-bg">
          <Layers size={15} className="text-key" aria-hidden /> 공통 활동으로 만들기
        </button>
      </div>
    </div>
  );
}

/** 메모 칸 차시 메뉴 (① 활동 메모 머리 아래 · 메모 추가 칸 위) */
export function LessonChips({ items, done, picked, today, onPick, onBulk, onCommon }: {
  items: LessonChipItem[];
  /** 이 학생에게 메모가 있는 차시 */
  done: ReadonlySet<string>;
  picked: string | null;
  today: string;
  onPick: (item: LessonChipItem | null) => void;
  onBulk?: () => void;
  onCommon?: (item: LessonChipItem) => void;
}) {
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState<{ item: LessonChipItem; at: { x: number; y: number } } | null>(null);
  const near = nearToday(items, today);
  // 고른 차시가 줄 밖에 있으면 맨 앞에
  const row = picked && !near.slice(0, 8).some((i) => i.id === picked) ? [items.find((i) => i.id === picked)!, ...near].filter(Boolean).slice(0, 8) : near.slice(0, 8);
  const state = (i: LessonChipItem): ChipState => (i.id === picked ? "picked" : done.has(i.id) ? "done" : "base");
  const pick = (i: LessonChipItem) => onPick(i.id === picked ? null : i);
  const chip = (i: LessonChipItem) => (
    <LessonChip key={i.id} item={i} state={state(i)} onClick={() => { pick(i); setAll(false); }}
      onMenu={onCommon ? (at) => setMenu({ item: i, at }) : undefined} />
  );

  return (
    <div className="flex flex-col gap-2" aria-label="차시별 활동">
      <div className="flex items-center gap-1.5">
        <List size={14} className="shrink-0 text-sub" aria-hidden />
        <span className="shrink-0 text-[13px] font-bold text-sub">차시별 활동</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-mute max-md:hidden">누르면 활동명 · 날짜가 채워져요</span>
        <span className="flex-1 md:hidden" />
        {onBulk && (
          <button type="button" onClick={onBulk} className="shrink-0 whitespace-nowrap text-[13px] font-medium text-key-strong">
            <span className="max-md:hidden">여러 학생에게 ›</span><span className="md:hidden">여러 학생 ›</span>
          </button>
        )}
      </div>
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        {row.map(chip)}
        <button type="button" aria-expanded={all} onClick={() => setAll(!all)}
          className="inline-flex h-8 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-control bg-soft px-2.5 text-[13px] font-medium text-sub">
          전체 {items.length} <ChevronDown size={14} className={all ? "rotate-180" : ""} />
        </button>
      </div>
      {all && (
        <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:static md:z-auto md:block md:bg-transparent" onClick={() => setAll(false)}>
          <div role="listbox" aria-label="전체 차시" onClick={(e) => e.stopPropagation()}
            className="max-h-[70dvh] w-full overflow-y-auto rounded-t-[16px] bg-[#fff] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 md:max-h-[280px] md:rounded-inner md:border md:border-line md:p-2">
            <div className="mb-1 flex items-center px-1 md:hidden">
              <span className="flex-1 text-[15px] font-bold">전체 차시 {items.length}</span>
              <button type="button" aria-label="닫기" onClick={() => setAll(false)} className="flex size-8 items-center justify-center text-mute"><X size={18} /></button>
            </div>
            <ul className="flex flex-col">
              {byNo(items).map((i) => (
                <li key={i.id}>
                  <button type="button" role="option" aria-selected={i.id === picked} onClick={() => { pick(i); setAll(false); }}
                    onContextMenu={onCommon ? (e) => { e.preventDefault(); setMenu({ item: i, at: { x: e.clientX, y: e.clientY } }); } : undefined}
                    className={cx("flex w-full items-center gap-2 rounded-control px-2.5 py-2.5 text-left text-[14px] md:py-2", i.id === picked ? "bg-key-soft" : "hover:bg-bg")}>
                    <span className="w-11 shrink-0 text-[12px] font-bold text-key-strong">{i.no}차시</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                    {done.has(i.id) && <Check size={13} strokeWidth={3} className="shrink-0 text-ok" aria-label="남김" />}
                    <span className="w-10 shrink-0 text-right text-[12px] text-mute">{lessonMd(i.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {menu && onCommon && <ChipMenu at={menu.at} onClose={() => setMenu(null)} onCommon={() => onCommon(menu.item)} />}
    </div>
  );
}
