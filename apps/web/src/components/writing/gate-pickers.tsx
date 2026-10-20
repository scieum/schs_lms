"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";
import type { LengthUnit } from "@/lib/domain/length";
import { GATE_TOLERANCES, gateBand } from "@/lib/domain/length-gate";
import { bandText, unitMark } from "@/lib/domain/memo-gate";

// 목표 · 오차 고르기 칸 (Figma N49 569:929 · 570:649): 흰 1px · r8 · 높이 36 · 라벨 12 + 값 13 Bold + ⌄. 열리면 연한 인디고.
// 오차 메뉴 = 칸 아래 6에 붙는 팝오버 220 (모바일도 팝오버 — 화면 오른쪽 안에 맞춤).

function PickBox({ label, value, children, align = "left" }: { label: string; value: string; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
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
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className={cx("flex h-9 items-center gap-1.5 whitespace-nowrap rounded-field border px-2.5 text-[13px] font-bold tabular-nums",
          open ? "border-key bg-key-soft text-key-strong" : "border-line bg-[#fff] text-ink")}>
        <span className={cx("text-[12px] font-normal", open ? "text-key-strong" : "text-mute")}>{label}</span> {value}
        <ChevronDown size={14} className={cx(open ? "rotate-180 text-key-strong" : "text-mute")} aria-hidden />
      </button>
      {open && (
        <div className={cx("absolute top-[calc(100%+6px)] z-30 w-[220px] rounded-card border border-line bg-[#fff] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
          align === "right" ? "right-0 md:left-0 md:right-auto" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Item({ on, onClick, main, sub }: { on: boolean; onClick: () => void; main: string; sub?: string }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onClick}
      className={cx("flex h-10 w-full items-center gap-2 rounded-control px-2.5 text-left", on ? "bg-key-soft text-key-strong" : "hover:bg-soft")}>
      <span className="whitespace-nowrap text-[14px] font-bold tabular-nums">{main}</span>
      {sub && <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-mute">{sub}</span>}
      {!sub && <span className="flex-1" />}
      {on && <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden />}
    </button>
  );
}

/** 목표 고르기: 한도부터 몇 단계 + 직접 적기 */
export function TargetPicker({ unit, target, limit, onChange }: { unit: LengthUnit; target: number; limit: number; onChange: (v: number) => void }) {
  const u = unitMark(unit);
  const step = unit === "bytes" ? 100 : 10;
  const options = [...new Set([1, 0.8, 2 / 3, 0.5].map((f) => (f === 1 ? limit : Math.max(step, Math.round((limit * f) / step) * step))))];
  const [own, setOwn] = useState("");
  return (
    <PickBox label="목표" value={`${target.toLocaleString()}${u}`}>
      {(close) => (
        <div role="listbox" aria-label="목표 분량">
          {options.map((v) => <Item key={v} on={v === target} onClick={() => { onChange(v); close(); }} main={`${v.toLocaleString()}${u}`} sub={v === limit ? "나이스 한도" : undefined} />)}
          <form className="mt-1 flex items-center gap-1.5 border-t border-line px-1 pt-1.5"
            onSubmit={(e) => { e.preventDefault(); const v = Math.min(limit, Number(own.replace(/[^\d]/g, "")) || 0); if (v > 0) { onChange(v); setOwn(""); close(); } }}>
            <input inputMode="numeric" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="직접 적기" aria-label="목표 직접 적기"
              className="h-8 min-w-0 flex-1 rounded-field bg-soft px-2 text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-key" />
            <button className="h-8 shrink-0 whitespace-nowrap rounded-control px-2 text-[13px] font-bold text-key-strong hover:bg-key-soft">정하기</button>
          </form>
        </div>
      )}
    </PickBox>
  );
}

/** 오차 고르기: ±30 · ±50 · ±100 (글자는 ±10 · ±20 · ±30) — 항목마다 그 오차의 맞출 범위 */
export function TolPicker({ unit, target, tol, limit, onChange }: { unit: LengthUnit; target: number; tol: number; limit: number; onChange: (v: number) => void }) {
  const u = unitMark(unit);
  return (
    <PickBox label="오차" value={`±${tol}${u}`} align="right">
      {(close) => (
        <div role="listbox" aria-label="오차">
          {GATE_TOLERANCES[unit].map((t) => (
            <Item key={t} on={t === tol} onClick={() => { onChange(t); close(); }} main={`±${t}${u}`} sub={bandText(gateBand({ unit, target, tol: t, limit }), unit)} />
          ))}
        </div>
      )}
    </PickBox>
  );
}
