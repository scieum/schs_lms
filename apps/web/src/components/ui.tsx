// 공통 UI. 규칙: 카드 r12 · 블록 r10 · 버튼·입력 r8 · 태그 r6, 그림자 없음, 글은 짧게.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnKind = "primary" | "outline" | "soft" | "ghost";
const BTN: Record<BtnKind, string> = {
  primary: "bg-key text-white hover:bg-key-strong disabled:bg-faint",
  outline: "bg-[#fff] text-ink border border-hair hover:bg-soft",
  soft: "bg-key-soft text-key-strong hover:bg-[#e3e7ff]",
  ghost: "text-sub hover:bg-soft",
};

export function Button({
  kind = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<"button"> & { kind?: BtnKind; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        // "hidden md:inline-flex" 처럼 화면 크기별로 숨길 때는 기본 inline-flex 를 빼야 hidden 이 먹는다
        /(^|\s)hidden(\s|$)/.test(className ?? "") ? "" : "inline-flex",
        "items-center justify-center gap-1.5 rounded-control font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-[15px]",
        BTN[kind],
        className,
      )}
    />
  );
}

export function ButtonLink({
  kind = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<typeof Link> & { kind?: BtnKind; size?: "sm" | "md" }) {
  return (
    <Link
      {...p}
      className={cx(
        // "hidden md:inline-flex" 처럼 화면 크기별로 숨길 때는 기본 inline-flex 를 빼야 hidden 이 먹는다
        /(^|\s)hidden(\s|$)/.test(className ?? "") ? "" : "inline-flex",
        "items-center justify-center gap-1.5 rounded-control font-medium transition-colors",
        size === "sm" ? "px-3.5 py-2 text-[13px]" : "px-5 py-3 text-[15px]",
        BTN[kind],
        className,
      )}
    />
  );
}

/** 상태 태그: 글자 뜻에 맞는 색을 자동으로 고른다 (초록 완료 · 주황 마감 · 노랑 대기 · 빨강 실패 · 청록 새 소식) */
const TONES: [RegExp, string][] = [
  [/실패|오류|잠김|누락|초과/, "bg-bad-soft text-bad"],
  [/^D-|마감/, "bg-due-soft text-due"],
  [/중복|확인 필요|대기|생성 중|근접/, "bg-wait-soft text-wait"],
  [/완료|통과|정상|활성|확정|새로 추가/, "bg-ok-soft text-ok"],
  [/새로|AI|NEW/, "bg-new-soft text-new"],
];
export function Tag({ children, tone }: { children: string; tone?: string }) {
  const t = tone ?? TONES.find(([re]) => re.test(children))?.[1] ?? "bg-soft text-sub";
  return <span className={cx("inline-flex shrink-0 items-center rounded-chip px-2.5 py-1 text-xs font-medium", t)}>{children}</span>;
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("surface rounded-card p-5 md:p-6", className)}>
      {title && (
        // 좁은 화면에서 제목 옆 버튼이 넘치면 다음 줄로 내린다 (카드가 화면 밖으로 밀리지 않게)
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[17px] font-bold md:text-lg">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** D2 벤토: 숫자 타일 */
export function StatTiles({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
      {items.map(([k, v]) => (
        <div key={k} className="surface rounded-card p-4 md:px-[22px] md:py-5">
          <div className="text-[13px] text-mute">{k}</div>
          <div className="mt-1.5 text-[22px] font-bold md:text-[28px]">{v}</div>
        </div>
      ))}
    </div>
  );
}

/** AI 한 줄 배너. 실제 AI가 아닌 규칙 기반 도움은 label="자동" 으로 표시한다 */
/** 숫자 타일 (행동이 있는 것): 이름표 → 큰 숫자+단위 → 한 줄 → (막대) → 맨 아래 버튼. 한 줄에 놓인 타일은 모두 이것으로 써서 높이·위치를 맞춘다 */
export function MetricTile({ label, value, unit, line, meter, action }: { label: string; value: string; unit?: string; line?: ReactNode; meter?: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface flex min-h-[172px] flex-col rounded-card p-4 md:px-[22px] md:py-5">
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-1 text-[24px] font-bold leading-tight md:text-[28px]">{value}{unit && <span className="ml-0.5 text-[15px] font-medium text-sub">{unit}</span>}</div>
      <div className="mt-1 min-h-[19px] truncate text-[13px] text-sub">{line}</div>
      {meter && <div className="mt-2">{meter}</div>}
      {action && <div className="mt-auto pt-3">{action}</div>}
    </div>
  );
}

export function AiBanner({ title, line, action, label = "AI" }: { title: string; line: string; action?: ReactNode; label?: "AI" | "자동" }) {
  return (
    <div className="surface flex items-center gap-3 rounded-card px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
      <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">{title}</div>
        <div className="truncate text-[13px] text-sub">{line}</div>
      </div>
      {action}
    </div>
  );
}

export function Row({ lead, title, meta, right, last }: { lead?: ReactNode; title: string; meta?: string; right?: ReactNode; last?: boolean }) {
  return (
    <div className={cx("flex items-center gap-3 py-3", !last && "border-b border-line")}>
      {lead}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {meta && <div className="truncate text-[13px] text-mute">{meta}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Avatar({ name, size = 40, src }: { name: string; size?: number; src?: string | null }) {
  // 프로필 사진 (내 정보 · 설정에서 올린 256px 정사각 이미지)
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white font-bold text-sub" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export function Field({ label, error, className, ...p }: ComponentProps<"input"> & { label?: string; error?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      {label && <span className="text-[13px] font-medium text-sub">{label}</span>}
      <input
        {...p}
        className={cx(
          "rounded-field bg-white px-4 py-3 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-key",
          error && "ring-2 ring-bad",
        )}
      />
      {error && <span className="text-[13px] text-bad">{error}</span>}
    </label>
  );
}

// 켜고 끄는 전환(세그먼트·토글)만 완전히 둥글게 (2026-10-16 "on/off는 더 둥글게"). 나머지는 낮은 모서리 유지.
export function Segmented({ items, active }: { items: { label: string; href: string }[]; active: number }) {
  return (
    <nav className="flex gap-1 rounded-full border border-hair bg-white p-1">
      {items.map((it, i) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={i === active ? "page" : undefined}
          className={cx(
            "flex-1 rounded-full px-3 py-2.5 text-center text-sm",
            i === active ? "bg-key font-bold text-white" : "text-sub hover:bg-soft hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** 폼 안의 전환 버튼 (학년·성별·단위 등). name 을 주면 hidden input 으로 값이 같이 전송된다 */
export function Toggle({
  name,
  value,
  onChange,
  options,
  tone = "white",
  size = "md",
}: {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  options: [value: string, label: string][];
  tone?: "white" | "soft";
  size?: "sm" | "md";
}) {
  return (
    <div className={cx("flex gap-1 rounded-full p-1", tone === "white" ? "bg-white" : "bg-soft")} role="radiogroup">
      {name && <input type="hidden" name={name} value={value} />}
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx(
            "flex-1 rounded-full",
            size === "sm" ? "px-3.5 py-1.5 text-[13px]" : "py-2.5 text-sm",
            value === v ? "bg-key font-bold text-white" : "text-mute hover:text-sub",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Steps({ items, active }: { items: string[]; active: number }) {
  return (
    <ol className="flex items-center gap-2">
      {items.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cx("flex size-7 items-center justify-center rounded-full text-[13px] font-bold", i <= active ? "bg-key text-white" : "bg-soft text-mute")}>
            {i < active ? "✓" : i + 1}
          </span>
          <span className={cx("text-sm", i === active ? "font-bold" : "hidden text-mute md:inline")}>{s}</span>
          {i < items.length - 1 && <span className={cx("h-0.5 w-4 md:w-8", i < active ? "bg-key" : "bg-line")} />}
        </li>
      ))}
    </ol>
  );
}

export { cx };
