"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { Icon } from "./icon";
import type { NavGroup, NavItem } from "./nav";

function isActive(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(href + "/") && href.split("/").length > 2);
}

export function SidebarLinks({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-2 pt-5 text-xs font-medium text-mute">{g.label}</div>
          {g.items.map((it) => {
            const on = isActive(path, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-control px-3.5 py-2.5 text-[15px]",
                  on ? "bg-soft font-bold text-ink" : "text-sub hover:bg-soft",
                )}
              >
                <Icon name={it.icon} className={on ? "text-ink" : "text-mute"} />
                <span className="flex-1">{it.label}</span>
                {it.badge ? <span className="min-w-6 rounded-full bg-key px-2 py-0.5 text-center text-[12px] font-bold text-white">{it.badge}</span> : null}
                {!it.ready && <span className="text-[11px] text-faint">준비 중</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function TabBar({ tabs }: { tabs: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white px-1.5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 md:hidden">
      {tabs.map((t) => {
        const on = path === t.href || (t.href.split("/").length > 2 && path.startsWith(t.href + "/"));
        return (
          <Link key={t.href} href={t.href} className="flex flex-1 flex-col items-center gap-0.5 pt-1.5">
            <Icon name={t.icon} size={24} className={on ? "text-key" : "text-faint"} />
            <span className={cx("text-[11px]", on ? "font-bold text-key" : "text-mute")}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
