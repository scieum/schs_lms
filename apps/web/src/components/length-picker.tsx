"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { neisMax, resolveLength, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";

// 초안 분량 고르기 (Figma T3 "초안 분량", T4 "분량 바꾸기"): 단위 전환 + 최대 분량 + NEIS 한도 표시.
// 폼에는 <name>Unit, <name>Max 로 들어간다. 서버는 resolveLength 로 다시 검사한다.
export function LengthPicker({
  category,
  name = "length",
  defaultUnit = "bytes",
  defaultMax,
}: {
  category: DraftCategory;
  name?: string;
  defaultUnit?: LengthUnit;
  defaultMax?: number;
}) {
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit);
  const [max, setMax] = useState(String(defaultMax ?? neisMax(category, defaultUnit)));
  const limit = neisMax(category, unit);
  const range = resolveLength(category, { unit, max: Number(max.replace(/,/g, "")) || undefined });

  // 단위를 바꾸면 같은 분량이 되도록 숫자도 바꾼다 (한글 1글자 = 3바이트)
  function switchUnit(next: LengthUnit) {
    if (next === unit) return;
    const n = Number(max.replace(/,/g, "")) || 0;
    setMax(String(next === "chars" ? Math.floor(n / 3) : n * 3));
    setUnit(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-sub">초안 분량</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-control bg-soft p-1" role="tablist" aria-label="분량 단위">
          {(["bytes", "chars"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={unit === u}
              onClick={() => switchUnit(u)}
              className={cx("rounded-chip px-4 py-2 text-sm", unit === u ? "bg-key font-bold text-white" : "text-mute")}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </div>
        <label className="flex min-w-32 flex-1 items-center gap-1 rounded-field bg-soft px-4 py-2.5 focus-within:ring-2 focus-within:ring-key">
          <input
            name={`${name}Max`}
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ""))}
            aria-label={`최대 분량 (${UNIT_LABEL[unit]})`}
            className="w-full bg-transparent text-[15px] outline-none"
          />
          <span className="text-sm text-mute">{UNIT_LABEL[unit]}</span>
        </label>
        <span className="rounded-chip bg-key-soft px-2.5 py-1 text-xs font-bold text-key">
          NEIS 한도 {limit.toLocaleString()}
        </span>
      </div>
      <input type="hidden" name={`${name}Unit`} value={unit} />
      {range.capped && (
        <p className="text-[13px] text-due" role="status">
          NEIS 한도를 넘어서 {range.max.toLocaleString()}{UNIT_LABEL[unit]}로 맞춰요
        </p>
      )}
    </div>
  );
}
