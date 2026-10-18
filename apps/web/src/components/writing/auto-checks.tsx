"use client";
import { useState, type ReactNode } from "react";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";
import type { AutoCheck, CheckRow } from "@/lib/domain/auto-check";
import { UNIT_LABEL, type LengthRange, type LengthUnit } from "@/lib/domain/length";

// 자동 검사 (Figma N23 330:628): 머리(상태 태그 · 값/최대 · 넘은 양) → 목표 범위 막대 → 못 지난 항목 행(최대 4) → 지난 항목 한 줄 → 분량 줄.
// 넓은 단(512 이상)은 분량 줄이 한 줄, 좁은 단(모바일 · 초안 검토 410 단)은 두 줄 + 꽉 찬 버튼.

const STATUS = {
  pass: { text: "통과", tone: "bg-ok-soft text-ok" },
  check: { text: "", tone: "bg-wait-soft text-[#9A6400]" },
  block: { text: "확정 불가", tone: "bg-bad-soft text-bad" },
} as const;
const SHOWN = 4;
const u = (unit: LengthUnit) => (unit === "bytes" ? "B" : UNIT_LABEL[unit]);

export function AutoChecks({ check, range, onFind, length, children }: {
  check: AutoCheck;
  range: LengthRange;
  /** "찾기": 본문에서 그 말을 골라 보여 준다 */
  onFind?: (s: string) => void;
  /** 분량 줄 (LengthRow) */
  length: ReactNode;
  /** 맞춘 글 카드 같은 덧붙임 (분량 줄 위) */
  children?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const { status, rows, passed, value, over } = check;
  const shown = all ? rows : rows.slice(0, SHOWN);
  const scale = range.max * 1.15; // 막대 끝 = 최대 × 1.15
  const pos = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  return (
    <div className="@container flex flex-col gap-3 rounded-inner border border-line bg-[#fff] p-4 @lg:px-5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold">자동 검사</span>
        {status !== "empty" && (
          <span className={cx("whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", STATUS[status].tone)}>
            {status === "check" ? `확인 ${rows.length}` : STATUS[status].text}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-1.5 whitespace-nowrap">
          <b className="text-[16px] tabular-nums">{value.toLocaleString()}</b>
          <span className="text-[13px] text-mute">/ {range.max.toLocaleString()}{u(range.unit)}</span>
          {over > 0 && <span className="self-center rounded-chip bg-bad-soft px-1.5 py-px text-[12px] font-bold text-bad">+{over.toLocaleString()}{u(range.unit)}</span>}
        </span>
      </div>

      <div>
        <div className="relative h-1.5 overflow-hidden rounded-[3px] bg-line" aria-hidden>
          <span className="absolute inset-y-0 bg-[#D9DDE3]" style={{ left: pos(range.min), width: `calc(${pos(range.max)} - ${pos(range.min)})` }} />
          <span className="absolute inset-y-0 left-0 bg-key" style={{ width: pos(Math.min(value, range.max)) }} />
          {over > 0 && <span className="absolute inset-y-0 bg-bad" style={{ left: pos(range.max), width: `calc(${pos(value)} - ${pos(range.max)})` }} />}
        </div>
        <div className="relative mt-1 h-3.5 text-[11px] tabular-nums text-mute" aria-hidden>
          <span className="absolute -translate-x-1/2" style={{ left: pos(range.min) }}>{range.min.toLocaleString()}</span>
          <span className="absolute -translate-x-1/2" style={{ left: pos(range.max) }}>{range.max.toLocaleString()}</span>
        </div>
      </div>

      {status === "empty" && <p className="text-[13px] text-mute">본문을 쓰면 검사해요</p>}

      {rows.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((r) => <Row key={r.key} r={r} onFind={onFind} />)}
          {rows.length > SHOWN && (
            <li className="border-t border-soft py-2.5 pl-[30px]">
              <button type="button" onClick={() => setAll(!all)} className="text-[12px] font-medium text-sub">{all ? "접기" : `${rows.length - SHOWN}개 더 보기`}</button>
            </li>
          )}
        </ul>
      )}

      {passed.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-mute">
          <Check size={14} strokeWidth={3} className="text-ok" />
          <span className="font-medium text-ok">통과</span>
          {passed.map((p) => <span key={p}>· {p}</span>)}
        </p>
      )}

      {children}
      <div className="border-t border-line pt-3">{length}</div>
    </div>
  );
}

function Row({ r, onFind }: { r: CheckRow; onFind?: (s: string) => void }) {
  return (
    <li className="flex items-start gap-2.5 border-t border-soft py-2.5">
      <span className={cx("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-white", r.level === "block" ? "bg-bad" : "bg-wait")} aria-hidden>
        {r.level === "block" ? <X size={12} strokeWidth={3} /> : <b className="text-[13px] leading-none">!</b>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold">{r.label}</span>
        <span className="block text-[12px] text-sub">
          {r.hit && <b className="text-ink">{r.hit}</b>}{r.detail}
        </span>
      </span>
      {r.find && onFind && (
        <button type="button" onClick={() => onFind(r.find!)} className="shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-medium text-key-strong hover:bg-key-soft">찾기</button>
      )}
    </li>
  );
}

/**
 * 분량 줄 (N23): 분량 · 바이트|글자 · 숫자 칸(단위 안쪽) · NEIS 한도(되돌리기) · 버튼들.
 * 폼에는 lengthUnit · lengthMax 로 들어간다 (form 을 주면 그 폼으로).
 */
export function LengthRow({ unit, max, limit, onChange, form, actions }: {
  unit: LengthUnit;
  max: number;
  /** 지금 단위의 NEIS 한도 */
  limit: number;
  onChange: (s: { unit: LengthUnit; max: number }) => void;
  form?: string;
  actions?: ReactNode;
}) {
  // 단위를 바꾸면 같은 분량이 되도록 숫자도 바꾼다 (한글 1글자 = 3바이트)
  const switchUnit = (next: LengthUnit) => {
    if (next === unit) return;
    onChange({ unit: next, max: next === "chars" ? Math.floor(max / 3) : max * 3 });
  };
  const segment = (
    <span className="flex shrink-0 gap-0.5 rounded-full bg-soft p-[3px]" role="tablist" aria-label="분량 단위">
      {(["bytes", "chars"] as const).map((x) => (
        <button key={x} type="button" role="tab" aria-selected={unit === x} onClick={() => switchUnit(x)}
          className={cx("whitespace-nowrap rounded-full px-3 py-[3px] text-[13px]", unit === x ? "bg-key-soft font-bold text-key-strong" : "text-mute")}>
          {UNIT_LABEL[x]}
        </button>
      ))}
    </span>
  );
  const reset = (
    <button type="button" onClick={() => onChange({ unit, max: limit })} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-sub">
      <RotateCcw size={13} /> NEIS 한도
    </button>
  );
  const field = (
    <label className="flex h-8 min-w-0 items-center rounded-field bg-soft px-2.5 focus-within:ring-2 focus-within:ring-key flex-1 @lg:w-24 @lg:flex-none">
      <input form={form} name="lengthMax" inputMode="numeric" value={max ? max.toLocaleString() : ""} aria-label={`최대 분량 (${UNIT_LABEL[unit]})`}
        onChange={(e) => onChange({ unit, max: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
        className="w-full min-w-0 bg-transparent text-[14px] font-medium tabular-nums outline-none" />
      <span className="shrink-0 text-[13px] text-mute">{u(unit)}</span>
    </label>
  );
  return (
    <div className="@container">
      <input form={form} type="hidden" name="lengthUnit" value={unit} />
      {/* 넓은 단: 한 줄 */}
      <div className="hidden items-center gap-2.5 @lg:flex">
        <span className="shrink-0 text-[13px] font-medium text-sub">분량</span>
        {segment}{field}{reset}
        {actions && <span className="ml-auto flex shrink-0 gap-2">{actions}</span>}
      </div>
      {/* 좁은 단: 분량 ↔ NEIS 한도 / 단위 + 숫자 / 꽉 찬 버튼 */}
      <div className="flex flex-col gap-2 @lg:hidden">
        <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-sub">분량</span>{reset}</div>
        <div className="flex items-center gap-2">{segment}{field}</div>
        {actions && <div className="flex flex-col gap-2 [&>*]:h-10 [&>*]:w-full">{actions}</div>}
      </div>
    </div>
  );
}

/** "1,500B로 맞추기" (분량이 못 지났을 때만) */
export function FitButton({ max, unit, busy, onClick }: { max: number; unit: LengthUnit; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">
      <Sparkles size={14} />{busy ? "맞추는 중…" : `${max.toLocaleString()}${u(unit)}로 맞추기`}
    </button>
  );
}
