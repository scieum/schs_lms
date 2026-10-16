"use client";
import { AlertTriangle } from "lucide-react";

// 분량을 넘었을 때: 막지 않고 교사가 확인하면 확정할 수 있게 한다 (2026-10-17 사용자 결정).
// 체크하면 allowOver=on 이 함께 전송되고, 서버는 그때만 분량 초과 확정을 받는다.
export function OverApproval({ value, max, unit, checked, onChange, form }: {
  value: number; max: number; unit: string; checked: boolean; onChange: (v: boolean) => void; form?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-inner bg-wait-soft px-3.5 py-3 text-[13px]">
      <input type="checkbox" name="allowOver" form={form} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-key)]" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-bold text-[#9a6400]"><AlertTriangle size={14} /> 분량 초과 {value.toLocaleString()} / {max.toLocaleString()}{unit} (+{(value - max).toLocaleString()})</span>
        <span className="block text-sub">이대로 확정할게요. 나이스 입력란 한도를 넘으면 나이스에서 잘릴 수 있어요.</span>
      </span>
    </label>
  );
}
