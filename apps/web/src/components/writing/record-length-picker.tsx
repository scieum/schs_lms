"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { recordMax, resolveRecordLength, type RecordArea } from "@/lib/domain/writing";

// 분량 고르기 (length-picker.tsx 와 같은 모양) — 창체·행발용. 영역마다 NEIS 한도가 달라(행발 900B) 따로 둔다.
// 폼에는 lengthUnit, lengthMax 로 들어간다. 서버는 resolveRecordLength 로 다시 검사한다.
export function RecordLengthPicker({
  area,
  defaultUnit = "bytes",
  defaultMax,
  onChange,
}: {
  area: RecordArea;
  defaultUnit?: LengthUnit;
  defaultMax?: number;
  onChange?: (s: { unit: LengthUnit; max: number }) => void;
}) {
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit);
  const [max, setMax] = useState(String(defaultMax ?? recordMax(area, defaultUnit)));
  const range = resolveRecordLength(area, { unit, max: Number(max) || undefined });

  function switchUnit(next: LengthUnit) {
    if (next === unit) return;
    const n = Number(max) || 0;
    const m = next === "chars" ? Math.floor(n / 3) : n * 3;
    setMax(String(m));
    setUnit(next);
    onChange?.({ unit: next, max: m });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-soft p-1" role="tablist" aria-label="분량 단위">
          {(["bytes", "chars"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={unit === u}
              onClick={() => switchUnit(u)}
              className={cx("rounded-full px-3.5 py-1.5 text-[13px]", unit === u ? "bg-key font-bold text-white" : "text-mute")}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </div>
        <label className="flex min-w-28 flex-1 items-center gap-1 rounded-field bg-soft px-3 py-2 focus-within:ring-2 focus-within:ring-key">
          <input
            name="lengthMax"
            inputMode="numeric"
            value={max}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, "");
              setMax(raw);
              onChange?.({ unit, max: Number(raw) || 0 });
            }}
            aria-label={`최대 분량 (${UNIT_LABEL[unit]})`}
            className="w-full bg-transparent text-sm outline-none"
          />
          <span className="shrink-0 text-[13px] text-mute">{UNIT_LABEL[unit]}</span>
        </label>
        <span className="rounded-chip bg-key-soft px-2.5 py-1 text-xs font-bold text-key">NEIS 한도 {recordMax(area, unit).toLocaleString()}</span>
      </div>
      <input type="hidden" name="lengthUnit" value={unit} />
      {range.capped && (
        <p className="text-[13px] text-due" role="status">
          NEIS 한도를 넘어서 {range.max.toLocaleString()}{UNIT_LABEL[unit]}로 맞춰요
        </p>
      )}
    </div>
  );
}
