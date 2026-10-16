import Link from "next/link";
import { cx } from "@/components/ui";

/** 카드 안 탭 (흰 바탕 + 선택은 인디고). 링크로 바꾼다 */
export function TabLinks({ items, active, tone = "white" }: { items: { key: string; label: string; href: string }[]; active: string; tone?: "white" | "none" }) {
  return (
    <nav className={cx("flex gap-1 overflow-x-auto rounded-control p-1", tone === "white" && "bg-white")}>
      {items.map((it) => (
        <Link key={it.key} href={it.href} scroll={false} aria-current={it.key === active ? "page" : undefined}
          className={cx("min-w-fit flex-1 rounded-chip px-3 py-2.5 text-center text-sm", it.key === active ? "bg-key font-bold text-white" : "text-mute hover:text-sub")}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
