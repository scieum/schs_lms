"use client";
import { cx } from "@/components/ui";

// N38 본문 보기 세그먼트 (469:21432): [쓰기 | 근거 | 원안 비교]. 흰 바탕 · 1px #E5E8EB 알약 · 안쪽 3,
// 항목 12 Medium #4E5968 · 선택 #EEF0FF/#3D56E0 Bold. 근거 연결이 없으면 [근거], AI 원안이 없으면 [원안 비교]를 숨기고 둘 다 없으면 세그먼트를 숨긴다.

export type BodyView = "write" | "sources" | "compare";
const LABEL: Record<BodyView, string> = { write: "쓰기", sources: "근거", compare: "원안 비교" };

export function BodyViewSwitch({ value, onChange, sources, compare, full = false, className }: {
  value: BodyView;
  onChange: (v: BodyView) => void;
  /** [근거] 보이기 (근거 연결이 하나라도 있을 때) */
  sources: boolean;
  /** [원안 비교] 보이기 (AI 원안이 있을 때) */
  compare: boolean;
  /** 모바일: 머리 줄 아래 꽉 찬 한 줄 */
  full?: boolean;
  className?: string;
}) {
  if (!sources && !compare) return null;
  const items = (["write", "sources", "compare"] as const).filter((k) => k === "write" || (k === "sources" ? sources : compare));
  return (
    <div role="radiogroup" aria-label="본문 보기" className={cx("shrink-0 gap-0.5 rounded-full border border-line bg-[#fff] p-[3px]", full && "w-full",
        // "hidden @lg:inline-flex" 처럼 크기별로 숨길 때는 기본 display 를 빼야 hidden 이 먹는다
        /(^|\s)hidden(\s|$)/.test(className ?? "") ? "" : full ? "flex" : "inline-flex", className)}>
      {items.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cx("h-[26px] whitespace-nowrap rounded-full px-3 text-[12px]", full && "flex-1", value === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
          {LABEL[k]}
        </button>
      ))}
    </div>
  );
}
