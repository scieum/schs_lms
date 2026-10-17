"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";
import { Icon } from "./icon";
import type { NavGroup, NavItem } from "./nav";

function isActive(path: string, href: string) {
  return path === href || (href !== "/" && path.startsWith(href + "/") && href.split("/").length > 2);
}

// 대분류(업무·수업·학생·관리) 접고 펴기: 고른 것은 이 브라우저에 기억한다. 접은 묶음에 지금 화면이 있으면 점으로 알린다.
// 사이드바를 접은(mini) 상태에서는 묶음 머리가 선으로만 보이므로 늘 펼친다.
const FOLD_KEY = "schs-nav-closed";
const FOLD_EVENT = "schs-nav-fold";

// 접힌 묶음 이름들을 localStorage 에서 읽는다. 서버 렌더에서는 null(= 저장 없음)
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(FOLD_EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(FOLD_EVENT, cb); };
}
function snapshot(): string | null {
  try { return localStorage.getItem(FOLD_KEY); } catch { return null; }
}

export function SidebarLinks({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let saved: string[];
  try { saved = raw ? (JSON.parse(raw) as string[]) : groups.filter((g) => g.fold).map((g) => g.label); } catch { saved = []; }
  const toggle = (label: string) => {
    const next = new Set(saved);
    if (next.has(label)) next.delete(label); else next.add(label);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch {}
    window.dispatchEvent(new Event(FOLD_EVENT));
  };
  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((g) => {
        const inside = g.items.some((it) => isActive(path, it.href));
        const links = g.items.map((it) => {
            const on = isActive(path, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                title={it.label}
                className={cx(
                  "relative flex items-center gap-2.5 rounded-control px-3.5 py-2.5 text-[15px] group-data-[mini=true]/side:flex-col group-data-[mini=true]/side:gap-1 group-data-[mini=true]/side:px-1 group-data-[mini=true]/side:py-2 group-data-[mini=true]/side:text-center group-data-[mini=true]/side:text-[11px] group-data-[mini=true]/side:leading-tight",
                  on ? "bg-soft font-bold text-ink" : "text-sub hover:bg-soft",
                )}
              >
                <Icon name={it.icon} className={on ? "text-ink" : "text-mute"} />
                <span className="flex-1 group-data-[mini=true]/side:w-full group-data-[mini=true]/side:flex-none group-data-[mini=true]/side:break-keep">{it.label}</span>
                {it.badge ? <span className="min-w-6 rounded-full bg-key px-2 py-0.5 text-center text-[12px] font-bold text-white group-data-[mini=true]/side:absolute group-data-[mini=true]/side:right-1.5 group-data-[mini=true]/side:top-1 group-data-[mini=true]/side:min-w-4 group-data-[mini=true]/side:px-1 group-data-[mini=true]/side:py-0 group-data-[mini=true]/side:text-[10px]">{it.badge}</span> : null}
                {!it.ready && <span className="text-[11px] text-faint group-data-[mini=true]/side:hidden">준비 중</span>}
              </Link>
            );
          });
        // 접어 둔 묶음에 지금 화면이 있으면 머리에 점을 찍는다
        const open = !saved.includes(g.label);
        return (
          <div key={g.label}>
            <button type="button" onClick={() => toggle(g.label)} aria-expanded={open}
              className="group/fold flex w-full items-center rounded-control px-3 pb-2 pt-5 text-left text-xs font-medium text-mute hover:text-sub group-data-[mini=true]/side:pointer-events-none group-data-[mini=true]/side:mx-2 group-data-[mini=true]/side:mb-2 group-data-[mini=true]/side:h-0 group-data-[mini=true]/side:w-auto group-data-[mini=true]/side:overflow-hidden group-data-[mini=true]/side:border-t group-data-[mini=true]/side:border-line group-data-[mini=true]/side:p-0">
              <span className="flex-1">{g.label}</span>
              {!open && inside && <span className="mr-1.5 size-1.5 rounded-full bg-key" aria-label="지금 화면" />}
              <ChevronDown size={14} className={cx("transition-transform", !open && "-rotate-90")} />
            </button>
            <div className={cx(!open && "hidden group-data-[mini=true]/side:block")}>{links}</div>
          </div>
        );
      })}
    </nav>
  );
}

export function TabBar({ tabs }: { tabs: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white px-1.5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 md:hidden">
      {tabs.map((t) => {
        const on = path === t.href || (t.href.split("/").length > 2 && path.startsWith(t.href + "/")) || !!t.match?.some((m) => path.startsWith(m));
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
