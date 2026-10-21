"use client";
import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, GripVertical, Lock } from "lucide-react";
import { cx } from "@/components/ui";
import { saveMenuLayout } from "@/app/(app)/me/actions";
import { Icon } from "./icon";
import { activeHref, layoutOf, withHidden, type ArrangeGroup, type NavGroup, type NavItem } from "./nav";
import { useMenuDrag } from "./menu-arrange";

// 대분류(업무·세특·동아리·특색활동·담임·관리) 접고 펴기: 고른 것은 이 브라우저에 기억한다. 접은 묶음에 지금 화면이 있으면 점으로 알린다.
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

/** 순서 바꾸기에 쓰는 것: 숨긴 메뉴까지 든 지금 순서 · 처음 순서 · 숨긴 메뉴 (교사만) */
export type SidebarArrange = { all: ArrangeGroup[]; base: ArrangeGroup[]; hidden: string[] };

export function SidebarLinks({ groups, arrange }: { groups: NavGroup[]; arrange?: SidebarArrange }) {
  const path = usePathname();
  const search = useSearchParams();
  const [editing, setEditing] = useState(false);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let saved: string[];
  try { saved = raw ? (JSON.parse(raw) as string[]) : groups.filter((g) => g.fold).map((g) => g.label); } catch { saved = []; }
  const toggle = (label: string) => {
    const next = new Set(saved);
    if (next.has(label)) next.delete(label); else next.add(label);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch {}
    window.dispatchEvent(new Event(FOLD_EVENT));
  };
  if (editing && arrange) return <SidebarArranger arrange={arrange} home={groups.find((g) => !g.label)?.items ?? []} onClose={() => setEditing(false)} />;
  const active = activeHref(path, search, groups.flatMap((g) => g.items.map((it) => it.href)));
  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((g) => {
        const inside = g.items.some((it) => it.href === active);
        const links = g.items.map((it) => {
            const on = it.href === active;
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
        // 머리 없는 묶음(홈)은 링크만
        if (!g.label) return <div key="top" className="pt-2">{links}</div>;
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
      {arrange && (
        <button type="button" onClick={() => setEditing(true)}
          className="mt-2 flex items-center gap-2 rounded-control px-3 py-2 text-left text-[13px] font-medium text-mute hover:bg-soft hover:text-sub group-data-[mini=true]/side:hidden">
          <GripVertical size={16} /> 메뉴 순서 바꾸기
        </button>
      )}
    </nav>
  );
}

/** 사이드바 순서 바꾸기 모드 (N53 a): ⠿ 를 끌어 묶음 안 · 묶음 사이로, 묶음 머리를 끌어 묶음 순서. [완료]에 저장 */
function SidebarArranger({ arrange, home, onClose }: { arrange: SidebarArrange; home: NavItem[]; onClose: () => void }) {
  const hide = (gs: ArrangeGroup[]) => gs.map((g) => ({ ...g, items: g.items.filter((it) => !arrange.hidden.includes(it.href)) }));
  const [groups, setGroups] = useState(() => hide(arrange.all));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const d = useMenuDrag(groups, setGroups);
  const save = () => start(async () => {
    const r = await saveMenuLayout(withHidden(layoutOf(groups), arrange.all, arrange.hidden));
    if (!r.ok) return setError(r.error);
    onClose();
  });
  const slot = <div {...d.slot} className="my-0.5 h-10 rounded-control border-[1.5px] border-dashed border-key bg-key-soft" />;
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <div className="mb-2 flex items-center gap-2 rounded-inner bg-key-soft py-2 pl-3 pr-2">
        <span className="flex-1 text-[14px] font-bold text-key-strong">메뉴 순서</span>
        <button type="button" onClick={() => setGroups(hide(arrange.base))} disabled={pending} className="text-[13px] font-medium text-sub hover:text-ink">처음대로</button>
        <button type="button" onClick={save} disabled={pending} className="rounded-chip bg-key px-3 py-1 text-[13px] font-bold text-white">{pending ? "저장 중…" : "완료"}</button>
      </div>
      {error && <p className="px-1 pb-1 text-[12px] text-bad" role="alert">{error}</p>}
      {home.map((it) => (
        <div key={it.href} className="flex items-center gap-2.5 px-3 py-2.5 text-[15px] text-mute">
          <Icon name={it.icon} className="text-faint" /><span className="flex-1">{it.label}</span><Lock size={15} className="text-faint" aria-label="고정" />
        </div>
      ))}
      {groups.map((g, gi) => (
        <div key={g.label} {...d.group(g.label, gi, g.items.length)} className={cx(d.drag?.kind === "group" && d.drag.label === g.label && "opacity-40")}>
          {d.over?.kind === "group" && d.over.index === gi && <div className="my-1 h-0.5 rounded-full bg-key" />}
          <div {...d.head(g.label)} className="flex cursor-grab items-center gap-1.5 px-1 pb-1.5 pt-4 text-xs font-bold text-mute active:cursor-grabbing" title="끌어서 묶음 옮기기">
            <GripVertical size={15} className="text-faint" />
            <span className="flex-1">{g.label}</span>
            <span className="pr-2 font-medium text-faint">{g.items.length}</span>
          </div>
          {g.items.map((it, i) => (
            <div key={it.href}>
              {d.over?.kind === "item" && d.over.label === g.label && d.over.index === i && slot}
              <div {...d.item(g.label, it.href, i)}
                className={cx("flex cursor-grab items-center gap-2.5 rounded-control py-2.5 pl-3 pr-2 text-[15px] text-sub hover:bg-soft active:cursor-grabbing", d.drag?.kind === "item" && d.drag.href === it.href && "opacity-40")}>
                <Icon name={it.icon} className="text-mute" />
                <span className="flex-1">{it.label}</span>
                <GripVertical size={18} className="text-faint" />
              </div>
            </div>
          ))}
          {d.over?.kind === "item" && d.over.label === g.label && d.over.index === g.items.length && slot}
          {!g.items.length && !(d.over?.kind === "item" && d.over.label === g.label) && <div className="mx-1 rounded-control border border-dashed border-line py-2 text-center text-[12px] text-faint">비었어요</div>}
          {d.over?.kind === "group" && d.over.index === gi + 1 && gi === groups.length - 1 && <div className="my-1 h-0.5 rounded-full bg-key" />}
        </div>
      ))}
    </div>
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
