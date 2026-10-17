"use client";
import { useRef, useState, useTransition } from "react";
import { Camera, Eye, Lock } from "lucide-react";
import { Avatar, Button, cx } from "@/components/ui";
import { Icon } from "@/components/shell/icon";
import type { IconName } from "@/components/shell/nav";
import { saveAvatar, saveHiddenMenus } from "./actions";

// 내 정보 · 설정 (Figma N14): 프로필 사진 바꾸기(정사각으로 잘라 256px 로 줄여 저장) · 메뉴 보이기(숨긴 메뉴는 사이드바·탭바에서만 빠진다)

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

type Item = { label: string; href: string; icon: IconName; locked: boolean };

export function MenuToggles({ groups, hidden: initial }: { groups: { label: string; items: Item[] }[]; hidden: string[] }) {
  const [hidden, setHidden] = useState(new Set(initial));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const commit = (next: Set<string>) => {
    const prev = hidden;
    setHidden(next);
    setError("");
    start(async () => {
      const r = await saveHiddenMenus([...next]);
      if (!r.ok) { setHidden(prev); setError(r.error); }
    });
  };
  const toggle = (href: string) => { const n = new Set(hidden); if (n.has(href)) n.delete(href); else n.add(href); commit(n); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub">숨긴 메뉴 {hidden.size}</span>
        <span className="flex-1" />
        {hidden.size > 0 && <button type="button" onClick={() => commit(new Set())} disabled={pending} className="text-[13px] font-bold text-key-strong">모두 보이기</button>}
      </div>
      <p className="flex items-center gap-2 rounded-control bg-bg px-3 py-2.5 text-[13px] text-sub"><Eye size={15} className="text-mute" />숨겨도 주소로는 들어갈 수 있어요</p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      {groups.map((g) => {
        const n = g.items.filter((it) => hidden.has(it.href)).length;
        return (
        <section key={g.label}>
          <h3 className="flex pb-1.5 text-[12px] font-bold text-mute"><span className="flex-1">{g.label}</span>{n > 0 && <span>숨김 {n}</span>}</h3>
          <ul className="overflow-hidden rounded-inner border border-line">
            {g.items.map((it) => {
              const on = !hidden.has(it.href);
              return (
                <li key={it.href} className="flex h-11 items-center gap-3 border-t border-soft px-3.5 first:border-0">
                  <Icon name={it.icon} size={18} className={on ? "text-sub" : "text-faint"} />
                  <span className={cx("flex-1 text-[15px] font-medium", !on && "text-mute")}>{it.label}</span>
                  {it.locked ? (
                    <Lock size={15} className="text-faint" aria-label="늘 보여요" />
                  ) : (
                    <button type="button" role="switch" aria-checked={on} aria-label={`${it.label} 보이기`} onClick={() => toggle(it.href)}
                      className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-key" : "bg-faint")}>
                      <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", on ? "left-[18px]" : "left-0.5")} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        );
      })}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
