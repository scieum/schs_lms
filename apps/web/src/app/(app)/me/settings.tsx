"use client";
import { Fragment, useRef, useState, useTransition } from "react";
import { Camera, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Avatar, Button, cx } from "@/components/ui";
import { Icon } from "@/components/shell/icon";
import { layoutOf, rebuild, stepGroup, stepItem, type ArrangeGroup, type MenuLayout } from "@/components/shell/nav";
import { useMenuDrag } from "@/components/shell/menu-arrange";
import { saveAvatar, saveHiddenMenus, saveMenuLayout } from "./actions";

// 내 정보 · 설정 (Figma N14 · N53): 프로필 사진 바꾸기(정사각으로 잘라 256px 로 줄여 저장) · 메뉴 보이기 · 순서(숨긴 메뉴는 사이드바·탭바에서만 빠진다)

const SIZE = 256;

/** 사진 → 가운데 정사각형, 확대 배율만큼 잘라 256px webp data URL */
async function cropToSquare(file: File, zoom: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height) / zoom;
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  const webp = c.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.85);
}

export function ProfilePhoto({ name, role, avatar }: { name: string; role: string; avatar: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("사진 파일만 올릴 수 있어요");
    setError("");
    setFile(f);
    setZoom(1);
    setPreview(await cropToSquare(f, 1));
  }
  async function rezoom(z: number) {
    setZoom(z);
    if (file) setPreview(await cropToSquare(file, z));
  }
  const save = (value: string | null) => start(async () => {
    const r = await saveAvatar(value);
    if (!r.ok) return setError(r.error);
    setFile(null);
    setPreview(null);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => input.current?.click()} className="relative shrink-0" aria-label="사진 바꾸기">
          <Avatar name={name} size={72} src={avatar} />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border border-hair bg-[#fff] text-sub"><Camera size={14} /></span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{name}</div>
          <div className="truncate text-[13px] text-mute">{role}</div>
          <div className="mt-2 flex items-center gap-3">
            <Button type="button" kind="outline" size="sm" onClick={() => input.current?.click()}>사진 바꾸기</Button>
            {avatar && <button type="button" onClick={() => save(null)} disabled={pending} className="text-[13px] text-mute hover:text-ink">사진 지우기</button>}
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="사진 바꾸기">
          <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-t-card bg-[#fff] p-5 md:rounded-card">
            <h2 className="text-[17px] font-bold">사진 바꾸기</h2>
            <div className="mx-auto overflow-hidden rounded-full border border-line" style={{ width: 200, height: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" width={200} height={200} />
            </div>
            <label className="flex items-center gap-3 text-[13px] text-sub">
              확대
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => rezoom(Number(e.target.value))} className="flex-1 accent-[#536DFE]" />
            </label>
            <p className="text-[12px] text-mute">정사각형으로 줄여 저장해요 (256px)</p>
            <div className="flex gap-2">
              <Button type="button" kind="outline" className="flex-1" onClick={() => { setPreview(null); setFile(null); }}>취소</Button>
              <Button type="button" className="flex-1" disabled={pending} onClick={() => save(preview)}>{pending ? "저장 중…" : "저장"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STEP_BTN = "flex size-6 shrink-0 items-center justify-center rounded-chip bg-soft text-mute hover:text-ink disabled:opacity-40";

/** 메뉴 보이기 · 순서 (N14 + N53 b · c): 행 = ⠿ · 아이콘 · 이름 · ↑ ↓ · 보이기 스위치. PC는 끌어 옮기기도 된다 */
export function MenuSettings({ groups: initial, base, hidden: initialHidden }: { groups: ArrangeGroup[]; base: ArrangeGroup[]; hidden: string[] }) {
  const [groups, setGroups] = useState(initial);
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const commitHidden = (next: Set<string>) => {
    const prev = hidden;
    setHidden(next);
    setError("");
    start(async () => {
      const r = await saveHiddenMenus([...next]);
      if (!r.ok) { setHidden(prev); setError(r.error); }
    });
  };
  const toggle = (href: string) => { const n = new Set(hidden); if (n.has(href)) n.delete(href); else n.add(href); commitHidden(n); };
  const commitOrder = (next: ArrangeGroup[], save: MenuLayout | null = layoutOf(next)) => {
    const prev = groups;
    setGroups(next);
    setError("");
    start(async () => {
      const r = await saveMenuLayout(save);
      if (!r.ok) { setGroups(prev); setError(r.error); }
    });
  };
  const step = (fn: (l: MenuLayout) => MenuLayout) => commitOrder(rebuild(groups, fn(layoutOf(groups))));
  const d = useMenuDrag(groups, (next) => commitOrder(next));
  const changed = JSON.stringify(layoutOf(groups)) !== JSON.stringify(layoutOf(base));
  const slot = <li {...d.slot} className="h-11 border-[1.5px] border-dashed border-key bg-key-soft" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub">숨긴 메뉴 {hidden.size}</span>
        <span className="flex-1" />
        {hidden.size > 0 && <button type="button" onClick={() => commitHidden(new Set())} disabled={pending} className="text-[13px] font-bold text-sub">모두 보이기</button>}
        {changed && <button type="button" onClick={() => commitOrder(base, null)} disabled={pending} className="text-[13px] font-bold text-key-strong">처음대로</button>}
      </div>
      <p className="flex items-center gap-2 rounded-control bg-bg px-3 py-2.5 text-[13px] text-sub">
        <GripVertical size={15} className="text-mute" />
        <span className="md:hidden">↑ ↓ 로 묶음 사이도 옮겨요</span>
        <span className="hidden md:inline">끌거나 ↑ ↓ 로 옮겨요 · 묶음 사이도 돼요</span>
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((g, gi) => {
          const n = g.items.filter((it) => hidden.has(it.href)).length;
          const overHere = d.over?.kind === "item" && d.over.label === g.label;
          return (
            <section key={g.label} {...d.group(g.label, gi, g.items.length)} className={cx(d.drag?.kind === "group" && d.drag.label === g.label && "opacity-40", d.over?.kind === "group" && d.over.index === gi && "rounded-inner outline-2 outline-offset-4 outline-key")}>
              <h3 className="flex items-center gap-1.5 pb-1.5 text-[12px] font-bold text-mute">
                <span {...d.head(g.label)} className="hidden cursor-grab md:inline" title="끌어서 묶음 옮기기"><GripVertical size={15} className="text-faint" /></span>
                <span className="flex-1">{g.label}</span>
                {n > 0 && <span>숨김 {n}</span>}
                <button type="button" aria-label={`${g.label} 묶음 위로`} disabled={pending || gi === 0} onClick={() => step((l) => stepGroup(l, g.label, -1))} className={STEP_BTN}><ChevronUp size={14} /></button>
                <button type="button" aria-label={`${g.label} 묶음 아래로`} disabled={pending || gi === groups.length - 1} onClick={() => step((l) => stepGroup(l, g.label, 1))} className={STEP_BTN}><ChevronDown size={14} /></button>
              </h3>
              <ul className="overflow-hidden rounded-inner border border-line">
                {g.items.map((it, i) => {
                  const on = !hidden.has(it.href);
                  const first = gi === 0 && i === 0;
                  const last = gi === groups.length - 1 && i === g.items.length - 1;
                  return (
                    <Fragment key={it.href}>
                      {overHere && d.over?.kind === "item" && d.over.index === i && slot}
                      <li {...d.item(g.label, it.href, i)} className={cx("flex h-11 items-center gap-2 border-t border-soft pl-2.5 pr-3 first:border-0 md:cursor-grab", d.drag?.kind === "item" && d.drag.href === it.href && "opacity-40")}>
                        <GripVertical size={17} className="shrink-0 text-faint" />
                        <Icon name={it.icon} size={18} className={on ? "text-sub" : "text-faint"} />
                        <span className={cx("min-w-0 flex-1 truncate text-[15px] font-medium", !on && "text-mute")}>{it.label}</span>
                        <button type="button" aria-label={`${it.label} 위로`} disabled={pending || first} onClick={() => step((l) => stepItem(l, it.href, -1))} className={STEP_BTN}><ChevronUp size={14} /></button>
                        <button type="button" aria-label={`${it.label} 아래로`} disabled={pending || last} onClick={() => step((l) => stepItem(l, it.href, 1))} className={STEP_BTN}><ChevronDown size={14} /></button>
                        <button type="button" role="switch" aria-checked={on} aria-label={`${it.label} 보이기`} onClick={() => toggle(it.href)}
                          className={cx("relative ml-1 h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-key" : "bg-faint")}>
                          <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", on ? "left-[18px]" : "left-0.5")} />
                        </button>
                      </li>
                    </Fragment>
                  );
                })}
                {overHere && d.over?.kind === "item" && d.over.index === g.items.length && slot}
                {!g.items.length && !overHere && <li className="py-3 text-center text-[12px] text-faint">비었어요</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
