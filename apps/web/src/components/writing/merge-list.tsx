"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { budgetStatus, FIT_RATIO, IMPORTANCE_LABEL, nextImportance, pickByBudget, type Importance, type MergePiece, type PieceSource } from "@/lib/domain/merge";

// 합치기 조각 목록 (Figma N11 224:2699 · 목표 줄 224:2778): 조각 고르기 + 목표 분량 (NEIS 최대 | 직접)
// N20: 조각마다 중요도(핵심·보통·참고)를 누르고, 고른 양을 목표와 견주고, 중요도 순으로 목표에 맞춰 고른다.

const WEIGHT_CHIP: Record<Importance, string> = {
  3: "bg-key-soft font-bold text-key-strong",
  2: "bg-soft text-sub",
  1: "border border-line bg-[#fff] text-mute",
};
const STATUS_TAG = { 부족: "bg-wait-soft text-[#9A6400]", 맞음: "bg-ok-soft text-ok", 많음: "bg-[#FFF1EA] text-[#FF7A45]" } as const;

const CHIP: Record<PieceSource, string> = {
  누가기록: "bg-key-soft text-key-strong",
  메모: "bg-soft text-sub",
  본문: "bg-line text-ink",
  "특색 활동": "bg-navy-2 text-white",
};
const SHOWN = 6;

const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "지금");

export function MergeList({ pieces, onWeight, selected, setSelected, unit, neisMax, target, setTarget }: {
  pieces: MergePiece[];
  onWeight: (id: string, w: Importance) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  unit: LengthUnit;
  neisMax: number;
  target: number;
  setTarget: (n: number) => void;
}) {
  const [all, setAll] = useState(false);
  const [custom, setCustom] = useState(target !== neisMax);
  const shown = all ? pieces : pieces.slice(0, SHOWN);
  const picked = pieces.filter((p) => selected.has(p.id));
  const total = picked.reduce((n, p) => n + measure(p.text, unit), 0);
  const u = UNIT_LABEL[unit];
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };

  const status = budgetStatus(total, target);
  const pct = target ? Math.min(100, (total / (target * 1.5)) * 100) : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* 고른 양 ↔ 목표 (N20). 막대 끝은 목표의 1.5배, 눈금은 목표 */}
      <div className="flex flex-col gap-2 rounded-inner bg-[#fff] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-sub">
            선택 <b className="text-ink tabular-nums">{total.toLocaleString()}</b> / 목표 {target.toLocaleString()}{u}
          </span>
          <span className={cx("shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-bold", STATUS_TAG[status])}>{status}</span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={cx("h-full rounded-full", status === "부족" ? "bg-wait" : "bg-key")} style={{ width: `${pct}%` }} />
          <span className="absolute top-0 h-full w-0.5 bg-navy" style={{ left: `${100 / 1.5}%` }} />
        </div>
        <button type="button" disabled={!pieces.length} onClick={() => setSelected(pickByBudget(pieces, target, unit))}
          className="self-end whitespace-nowrap rounded-control bg-key-soft px-3 py-1.5 text-[13px] font-medium text-key-strong disabled:opacity-40 max-md:w-full">
          중요도 순으로 맞춰 고르기
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">조각 {pieces.length}개 · 선택 {picked.length}</span>
        <button type="button" disabled={!pieces.length} onClick={() => setSelected(new Set(picked.length === pieces.length ? [] : pieces.map((p) => p.id)))} className="text-[12px] font-medium text-key-strong disabled:text-faint">
          {pieces.length && picked.length === pieces.length ? "모두 해제" : "전체 선택"}
        </button>
      </div>
      <ul className="overflow-hidden rounded-inner bg-[#fff]">
        {shown.map((p) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id} className="border-b border-soft last:border-0">
              <label className="flex cursor-pointer gap-3 px-3 py-3 md:px-3.5">
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(p.id)} />
                <span aria-hidden className={cx("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[4px]", on ? "bg-key text-white" : "border-[1.5px] border-faint bg-[#fff]")}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[12px] font-medium", CHIP[p.source])}>{p.source}</span>
                    <span className="text-[12px] text-mute">{md(p.date)}</span>
                    <button type="button" aria-label={`중요도 ${IMPORTANCE_LABEL[p.weight ?? 2]} (누르면 바뀜)`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWeight(p.id, nextImportance(p.weight ?? 2)); }}
                      className={cx("shrink-0 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px]", WEIGHT_CHIP[p.weight ?? 2])}>
                      {IMPORTANCE_LABEL[p.weight ?? 2]}
                    </button>
                    <span className="ml-auto shrink-0 text-[12px] font-medium tabular-nums text-sub">{measure(p.text, unit).toLocaleString()}{u}</span>
                  </span>
                  <span className={cx("line-clamp-2 text-[13px] leading-5", on ? "text-ink" : "text-mute")}>{p.text}</span>
                </span>
              </label>
            </li>
          );
        })}
        {pieces.length > SHOWN && (
          <li>
            <button type="button" onClick={() => setAll(!all)} className="w-full py-2.5 text-center text-[12px] font-medium text-sub hover:bg-soft">
              {all ? "접기" : `${pieces.length - SHOWN}개 더 보기`}
            </button>
          </li>
        )}
        {pieces.length === 0 && <li className="py-6 text-center text-[13px] text-mute">합칠 조각이 없어요. 누가기록이나 메모를 먼저 남겨 주세요</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-inner bg-[#fff] px-3.5 py-2.5">
        <span className="text-[13px] text-sub">목표</span>
        {custom ? (
          <label className="flex items-center gap-1">
            <input type="number" min={1} max={neisMax} value={target} onChange={(e) => setTarget(Math.min(neisMax, Math.max(1, Number(e.target.value) || 0)))} aria-label="목표 분량"
              className="h-8 w-20 rounded-control bg-soft px-2 text-right text-[15px] font-bold outline-none focus:ring-2 focus:ring-key" />
            <span className="text-[13px] font-bold">{u}</span>
          </label>
        ) : (
          <span className="text-[15px] font-bold">{neisMax.toLocaleString()}{u}</span>
        )}
        <span className="text-[12px] text-mute">{Math.ceil(target * FIT_RATIO).toLocaleString()}~{target.toLocaleString()}</span>
        <span className="ml-auto flex rounded-full bg-soft p-0.5 text-[12px]">
          {([["NEIS 최대", false], ["직접", true]] as const).map(([l, c]) => (
            <button key={l} type="button" aria-pressed={custom === c} onClick={() => { setCustom(c); if (!c) setTarget(neisMax); }}
              className={cx("rounded-full px-3 py-1", custom === c ? "bg-key-soft font-bold text-key-strong" : "text-sub")}>{l}</button>
          ))}
        </span>
      </div>
    </div>
  );
}
