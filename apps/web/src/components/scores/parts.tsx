// 성적·최저·야자 화면 공용 조각 (서버·클라이언트 모두 쓸 수 있는 순수 표시 컴포넌트)
import Link from "next/link";
import { cx } from "@/components/ui";

/** 관리자용 반 고르기. 반이 하나뿐이면 그리지 않는다 */
export function ClassPicker({ classes, current, path }: { classes: string[]; current: string; path: string }) {
  if (classes.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="반 고르기">
      {classes.map((c) => {
        const [g, n] = c.split("-");
        return (
          <Link
            key={c}
            href={`${path}?class=${c}`}
            aria-current={c === current ? "page" : undefined}
            className={cx("rounded-full px-3.5 py-1.5 text-[13px]", c === current ? "bg-key font-bold text-white" : "bg-soft text-sub hover:text-ink")}
          >
            {g}학년 {n}반
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 세로 막대 차트. 차트는 indigo-200 바탕, 강조 막대만 indigo-500 (design-system.md).
 * invert: 값이 작을수록 좋은 것(등급) → 막대를 길게
 */
export function BarChart({
  items,
  highlight,
  invert = false,
  max,
  height = 120,
  format = (n) => String(n),
}: {
  items: { label: string; value: number | null }[];
  highlight?: number;
  invert?: boolean;
  max?: number;
  height?: number;
  format?: (n: number) => string;
}) {
  const vals = items.map((i) => i.value).filter((v): v is number => v !== null);
  const top = max ?? Math.max(1, ...vals);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const hl = highlight ?? items.length - 1;
  return (
    <div className="flex items-end gap-2 md:gap-3" style={{ height: height + 44 }} role="img" aria-label={items.map((i) => `${i.label} ${i.value === null ? "없음" : format(i.value)}`).join(", ")}>
      {items.map((it, i) => {
        const v = it.value;
        // 등급: 숫자가 작을수록(좋을수록) 길게. 보이는 값들 사이에서 55~100%로 늘린다
        const ratio = v === null ? 0 : invert ? (hi === lo ? 0.8 : 0.55 + (0.45 * (hi - v)) / (hi - lo)) : Math.max(0.04, v / top);
        return (
          <div key={`${it.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cx("text-xs", i === hl ? "font-bold text-ink" : "text-mute")}>{v === null ? "–" : format(v)}</span>
            <div
              className={cx("w-full rounded-chip", v === null ? "bg-line" : i === hl ? "bg-key" : "bg-[#C2CAFF]")}
              style={{ height: Math.round((v === null ? 0.04 : ratio) * height) }}
            />
            <span className={cx("truncate text-xs", i === hl ? "font-bold text-ink" : "text-mute")}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 키-값 줄 (열 맞추기·신청 요약) */
export function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <dt className="flex-1 text-mute">{k}</dt>
      <dd className={cx("text-right", strong ? "font-bold" : "font-medium")}>{v}</dd>
    </div>
  );
}
