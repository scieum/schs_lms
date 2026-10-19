// N39 관리자 화면 공용 조각 (Figma 469:560 점검 요약 카드 · 469:585 보존 기간 행 · 바닥 안내). 서버·클라이언트 공용.
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cx } from "@/components/ui";

/** 화면 머리: "관리 > …" + 제목 + 한 줄 설명 + 오른쪽 버튼 (모바일은 짧은 제목, 버튼 숨김) */
export function N39Head({ crumb, title, mobileTitle, line, actions }: { crumb: string; title: string; mobileTitle?: string; line: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-end gap-3 px-4 pb-2 pt-5 md:px-10 md:pt-8">
      <div className="min-w-0 flex-1">
        <div className="mb-1 hidden text-[13px] text-mute md:block">관리 <span className="mx-1">&gt;</span> {crumb}</div>
        <h1 className="text-xl font-bold md:text-[28px]">
          <span className="md:hidden">{mobileTitle ?? title}</span>
          <span className="hidden md:inline">{title}</span>
        </h1>
        <p className="mt-1 text-[13px] text-sub md:text-[14px]">{line}</p>
      </div>
      {actions && <div className="hidden shrink-0 items-center gap-2.5 md:flex">{actions}</div>}
    </header>
  );
}

export type MeterTone = "ok" | "key" | "wait" | "bad" | "mute";
const TONE: Record<MeterTone, string> = { ok: "bg-ok", key: "bg-key", wait: "bg-wait", bad: "bg-bad", mute: "bg-mute" };

/** 진행 막대 (회색 바탕) */
export function Meter({ pct, tone, className }: { pct: number; tone: MeterTone; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-line", className)} aria-hidden>
      <div className={cx("h-full rounded-full", TONE[tone])} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/** N39 점검 요약 카드: 이름 · 큰 숫자 + 작은 단위 · 막대 */
export function SummaryCard({ label, value, unit, pct, tone }: { label: string; value: number; unit: string; pct: number; tone: MeterTone }) {
  return (
    <div className="rounded-[16px] bg-soft p-4 md:px-[22px] md:py-5">
      <div className="text-[13px] text-sub">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[26px] font-bold leading-tight md:text-[28px]">{value.toLocaleString()}</span>
        <span className="text-[12px] text-mute md:text-[13px]">{unit}</span>
      </div>
      <Meter pct={pct} tone={tone} className="mt-3" />
    </div>
  );
}

/** 표 안 숫자: 0 은 연한 회색, 1 이상은 빨강 소프트 알약 */
export function IssuePill({ n }: { n: number }) {
  if (!n) return <span className="text-[13px] text-faint">0</span>;
  return <span className="inline-flex min-w-[22px] justify-center rounded-chip bg-bad-soft px-1.5 py-0.5 text-[12px] font-bold text-bad">{n.toLocaleString()}</span>;
}

/** 바닥 안내 (#F2F4F6 · 자물쇠) */
export function LockNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-card bg-soft px-4 py-3.5 text-[13px] text-sub md:px-5", className)}>
      <Lock size={16} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
