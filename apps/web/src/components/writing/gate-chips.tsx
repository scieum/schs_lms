"use client";
import { useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, RotateCw } from "lucide-react";
import { cx } from "@/components/ui";
import { measure, type LengthUnit } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { bandText, unitMark, type GateRow as Row } from "@/lib/domain/memo-gate";
import { PieceChip } from "./piece-chip";

// ③ 게이트 줄 (Figma N49 570:931): 글 제목 바로 아래 · 글 칸 위. 분량 칩(통과 초록 · 짧음/길어요 주황 · 나이스 한도 넘침 빨강) + 메모 반영 칩 ↔ 범위 / [↻ 다시 맞추기].
// 메모 반영이 빠지면 칩을 눌러 빠진 메모를 펼치고 [↻ 넣어서 다시 맞추기]. 손으로 고치면 분량만 바로 다시 재고 메모 반영은 숨긴다(gateRow).

const TONE: Record<Row["tone"], string> = {
  pass: "bg-ok-soft text-[#00A05D]",
  short: "bg-due-soft text-[#E8622C]",
  long: "bg-due-soft text-[#E8622C]",
  over: "bg-bad-soft text-bad",
};
const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "지금");
const CHIP = "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[12px] font-bold";

/** 분량 칩 하나 (수정 결과 머리에서도 같은 색) */
export function GateChip({ row, prefix = "" }: { row: Pick<Row, "tone" | "label">; prefix?: string }) {
  return (
    <span className={cx(CHIP, TONE[row.tone])}>
      {row.tone === "pass" ? <Check size={12} strokeWidth={3} aria-hidden /> : <AlertCircle size={12} strokeWidth={2.5} aria-hidden />}
      {row.tone === "pass" ? prefix : ""}{row.label}
    </span>
  );
}

export function GateChips({ row, unit, missing, onRefit, refitting = false, onAddMissing, adding = false, onMoreMemos, error }: {
  row: Row;
  unit: LengthUnit;
  /** 빠진 메모 (고른 메모 중 글에 기댄 문장이 없는 것) */
  missing: MergePiece[];
  /** [↻ 다시 맞추기] — 범위 밖일 때만 */
  onRefit?: () => void;
  refitting?: boolean;
  /** [↻ 넣어서 다시 맞추기] */
  onAddMissing?: () => void;
  adding?: boolean;
  /** 짧음 아래 "① 메모 더 남기기" */
  onMoreMemos?: () => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const m = row.memos;
  const gap = m ? m.picked - m.covered : 0;
  const busy = refitting || adding;
  const u = unitMark(unit);
  const fail = row.tone !== "pass";

  return (
    <div className="mb-2.5 flex flex-col gap-2" aria-label="분량 게이트">
      {row.append && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cx(CHIP, "bg-key-soft text-key-strong")}>더한 글 {row.append.added.toLocaleString()}{unit === "bytes" ? "B" : "자"}</span>
          <span className="text-[12px] text-mute">지금 글 {row.append.kept.toLocaleString()}{unit === "bytes" ? "B" : "자"}는 그대로예요</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <GateChip row={row} prefix="분량 " />
        {m && m.picked > 0 && (gap > 0 ? (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
            className={cx(CHIP, "border border-wait bg-wait-soft text-[#9A6400]")}>
            메모 반영 {m.covered}/{m.picked} {open ? <ChevronUp size={12} strokeWidth={2.5} aria-hidden /> : <ChevronDown size={12} strokeWidth={2.5} aria-hidden />}
          </button>
        ) : (
          <span className={cx(CHIP, "bg-soft text-sub")}><Check size={12} strokeWidth={3} aria-hidden />메모 반영 {m.covered}/{m.picked}</span>
        ))}
        {fail && onRefit ? (
          <button type="button" onClick={onRefit} disabled={busy}
            className="ml-auto inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-2.5 text-[12px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:opacity-50">
            <RotateCw size={12} strokeWidth={2.5} className={cx(refitting && "animate-spin")} aria-hidden /> {refitting ? "맞추는 중…" : "다시 맞추기"}
          </button>
        ) : (
          <span className="whitespace-nowrap text-[12px] font-medium tabular-nums text-mute max-md:basis-full md:ml-auto">범위 {bandText(row, unit)}</span>
        )}
      </div>
      {row.tone === "short" && (
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-sub break-keep">
          <span>없는 내용은 채우지 않아요</span>
          {onMoreMemos && <button type="button" onClick={onMoreMemos} className="whitespace-nowrap font-bold text-key-strong">① 메모 더 남기기</button>}
        </p>
      )}
      {open && gap > 0 && (
        <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] px-3.5 py-3">
          <span className="text-[13px] font-bold">빠진 메모 {gap}개</span>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              {missing.map((p) => (
                <li key={p.id} className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <PieceChip source={p.source} />
                    <span className="text-[12px] tabular-nums text-mute">{md(p.date)} · {measure(p.text, unit).toLocaleString()}{u}</span>
                  </span>
                  <span className="text-[13px] leading-5 break-keep">{p.text}</span>
                </li>
              ))}
              {missing.length === 0 && <li className="text-[13px] text-mute">메모 목록이 바뀌어 다시 불러와야 해요</li>}
            </ul>
            {onAddMissing && (
              <button type="button" onClick={onAddMissing} disabled={busy}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:opacity-50 md:h-8 md:self-center">
                <RotateCw size={13} strokeWidth={2.5} className={cx(adding && "animate-spin")} aria-hidden /> {adding ? "넣는 중…" : "넣어서 다시 맞추기"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-[12px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
