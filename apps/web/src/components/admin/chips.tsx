import Link from "next/link";
import { Search } from "lucide-react";
import { cx } from "@/components/ui";

// Figma A2·A5 필터: 작은 알약 버튼 (선택 = 인디고 채움) + 오른쪽 검색칸
export function LinkChips({ items, active }: { items: { label: string; href: string }[]; active: number }) {
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {items.map((it, i) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={i === active ? "page" : undefined}
          className={cx(
            "shrink-0 rounded-control px-3.5 py-2 text-[13px]",
            i === active ? "bg-key font-bold text-white" : "text-sub hover:bg-soft",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** GET 검색칸. hidden 으로 다른 필터 값을 같이 보낸다 */
export function SearchBox({ action, placeholder, value, keep }: { action: string; placeholder: string; value?: string; keep?: Record<string, string> }) {
  return (
    <form action={action} className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 md:max-w-[280px]" role="search">
      {Object.entries(keep ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Search size={16} className="shrink-0 text-mute" aria-hidden />
      <input
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={40}
        className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
    </form>
  );
}
