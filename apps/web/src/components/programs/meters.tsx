import { cx } from "@/components/ui";

/** 응답률 고리 (T2) */
export function Ring({ pct, size = 76 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e8eb" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#536dfe" strokeWidth={8} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-key text-[17px] font-bold">{pct}%</text>
    </svg>
  );
}

/** 얇은 진행 막대 */
export function Bar({ pct, tone = "key", className }: { pct: number; tone?: "key" | "bad" | "wait"; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-line", className)} aria-hidden>
      <div className={cx("h-full rounded-full", tone === "bad" ? "bg-bad" : tone === "wait" ? "bg-wait" : "bg-key")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
