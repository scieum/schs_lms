"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Star } from "lucide-react";
import { cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { budgetStatus, IMPORTANCE_LABEL, nextImportance, type Importance, type MergePiece } from "@/lib/domain/merge";
import { FEW_COUNT } from "@/lib/domain/praise";
import { PieceChip } from "./piece-chip";

// 메모 모아 쓰기 (Figma N41 492:824): ② AI로 쓰기의 기본 칸 — 늘 펼쳐 둔다.
// 체크(넣을 메모) · 중요도 칩(꼭 넣기/보통/참고, 누르면 바뀜) · 순서(위/아래) · 고른 양 ↔ 목표.
// "어떻게 쓰나요" 세 단계를 칸 안에 한 줄로 보여 준다.

const WEIGHT_CHIP: Record<Importance, string> = {
  3: "bg-key font-bold text-white",
  2: "bg-soft font-bold text-sub",
  1: "border border-line bg-[#fff] font-bold text-mute",
};
const SHOWN = 6;
const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "지금");

export function MemoCollect({ pieces, selected, setSelected, onWeight, onMove, unit, target }: {
  /** 교사가 정한 순서 그대로 */
  pieces: MergePiece[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onWeight: (id: string, w: Importance) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  unit: LengthUnit;
  target: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? pieces : pieces.slice(0, SHOWN);
  const picked = pieces.filter((p) => selected.has(p.id));
  const memos = picked.filter((p) => p.id !== "body").length;
  const total = picked.reduce((n, p) => n + measure(p.text, unit), 0);
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  const status = budgetStatus(total, target);
  const pct = target ? Math.min(100, (total / (target * 1.5)) * 100) : 0;
  const few = memos > 0 && memos <= FEW_COUNT;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[15px] font-bold">메모 모아 쓰기</span>
        <span className="whitespace-nowrap text-[12px] text-mute">{pieces.length}개 중 {picked.length}개 고름</span>
        <button type="button" disabled={!pieces.length} onClick={() => setSelected(new Set(picked.length === pieces.length ? [] : pieces.map((p) => p.id)))}
          className="whitespace-nowrap text-[12px] font-medium text-key-strong disabled:text-faint">
          {pieces.length && picked.length === pieces.length ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-control bg-[#fff] px-3 py-2 text-[12px] font-medium text-sub break-keep" aria-label="어떻게 쓰나요">
        <span className="font-bold text-key-strong">어떻게 쓰나요</span>
        <span>① 넣을 메모 고르기</span><span>② 중요한 건 ‘꼭’</span><span>③ 모아 쓰기</span>
      </p>
      <ul className="flex flex-col overflow-hidden rounded-control bg-[#fff]" aria-label="모을 메모">
        {shown.map((p, i) => {
          const on = selected.has(p.id);
          const w = p.weight ?? 2;
          const at = pieces.indexOf(p);
          return (
            <li key={p.id} className={cx("flex gap-2.5 py-2.5 pl-3 pr-2", i > 0 && "border-t border-soft")}>
              <label className="flex min-w-0 flex-1 cursor-pointer gap-2.5">
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(p.id)} />
                <span aria-hidden className={cx("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[4px]", on ? "bg-key text-white" : "border-[1.5px] border-faint bg-[#fff]")}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <PieceChip source={p.source} />
                    <button type="button" aria-label={`중요도 ${IMPORTANCE_LABEL[w]} (누르면 바뀜)`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWeight(p.id, nextImportance(w)); }}
                      className={cx("inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px]", WEIGHT_CHIP[w])}>
                      {w === 3 && <Star size={10} fill="currentColor" aria-hidden />}{IMPORTANCE_LABEL[w]}
                    </button>
                    <span className="shrink-0 text-[12px] text-mute">{md(p.date)}</span>
                    <span className="ml-auto shrink-0 text-[12px] font-medium tabular-nums text-sub">{measure(p.text, unit).toLocaleString()}{u}</span>
                  </span>
                  <span className={cx("line-clamp-2 text-[13px] leading-5 break-keep", on ? "text-ink" : "text-mute")}>{p.text}</span>
                </span>
              </label>
              <span className="flex shrink-0 flex-col gap-1">
                <button type="button" aria-label="위로" disabled={at <= 0} onClick={() => onMove(p.id, -1)}
                  className="flex size-7 items-center justify-center rounded-control border border-line bg-[#fff] text-sub disabled:opacity-30"><ChevronUp size={14} /></button>
                <button type="button" aria-label="아래로" disabled={at >= pieces.length - 1} onClick={() => onMove(p.id, 1)}
                  className="flex size-7 items-center justify-center rounded-control border border-line bg-[#fff] text-sub disabled:opacity-30"><ChevronDown size={14} /></button>
              </span>
            </li>
          );
        })}
        {pieces.length > SHOWN && (
          <li className="border-t border-soft">
            <button type="button" onClick={() => setAll(!all)} className="w-full py-2.5 text-center text-[12px] font-medium text-sub hover:bg-soft">
              {all ? "접기" : `${pieces.length - SHOWN}개 더 보기`}
            </button>
          </li>
        )}
      </ul>
      {/* 고른 양 ↔ 목표 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-sub">
            고른 메모 <b className="tabular-nums text-ink">{total.toLocaleString()}{u}</b> → 목표 {target.toLocaleString()}{u} 글
          </span>
          <span className={cx("shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-bold",
            status === "부족" ? "bg-wait-soft text-[#9A6400]" : status === "맞음" ? "bg-ok-soft text-ok" : "bg-[#FFF1EA] text-[#FF7A45]")}>
            {status === "부족" ? "메모가 적어요" : status === "맞음" ? "알맞아요" : "많아요 · 줄여 써요"}
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={cx("h-full rounded-full", status === "부족" ? "bg-wait" : "bg-key")} style={{ width: `${pct}%` }} />
        </div>
        {(status === "부족" || few) && (
          <p className="text-[12px] text-mute break-keep">메모가 적으면 글도 짧게 써요 · 메모에 없는 활동과 평가는 만들지 않아요</p>
        )}
      </div>
    </div>
  );
}
