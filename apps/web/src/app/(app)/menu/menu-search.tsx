"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { Icon } from "@/components/shell/icon";
import { MENU_KEYWORDS, type IconName } from "@/components/shell/nav";
import { cx } from "@/components/ui";

type Item = { label: string; href: string; icon: IconName };
type Group = { label: string; items: Item[] };

// 메뉴 찾기 + 묶음별 2열 목록 (Figma N15 275:3762 · 검색 275:4123): 찾으면 묶음을 숨기고 결과만 한 줄씩

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<b className="font-bold text-key-strong">{q}</b>{text.slice(i + q.length)}</>;
}

function IconBox({ name }: { name: IconName }) {
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-soft text-sub"><Icon name={name} size={18} /></span>;
}

export function MenuSearch({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState("");
  const term = q.trim();
  // 이름이 맞는 메뉴 먼저, 그다음 찾는 말이 맞는 메뉴
  const results = term
    ? groups.flatMap((g) => g.items.map((it) => {
        const kw = (MENU_KEYWORDS[it.href] ?? []).find((k) => k.includes(term));
        const rank = it.label.includes(term) ? 0 : kw ? 1 : 2;
        return { ...it, group: g.label, kw, rank };
      })).filter((r) => r.rank < 2).sort((a, b) => a.rank - b.rank)
    : [];

  return (
    <>
      <label className={cx("flex h-12 items-center gap-2.5 rounded-control bg-[#fff] px-4", term ? "ring-2 ring-key" : "")}>
        <Search size={20} className="shrink-0 text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="메뉴 찾기" aria-label="메뉴 찾기"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-mute" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="지우기" className="flex size-5 items-center justify-center rounded-full bg-faint text-white"><X size={12} strokeWidth={3} /></button>
        )}
      </label>

      {term ? (
        <>
          <p className="text-[13px] font-bold">검색 결과 <span className="text-key-strong">{results.length}</span></p>
          <ul className="surface overflow-hidden rounded-card px-4">
            {results.map((r) => (
              <li key={r.href} className="border-t border-soft first:border-0">
                <Link href={r.href} className="flex items-center gap-2.5 py-3">
                  <IconBox name={r.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium"><Highlight text={r.label} q={term} /></span>
                    <span className="block truncate text-[12px] text-mute">{r.group}{r.kw && r.rank === 1 ? ` · ${r.kw}` : ""}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
            {results.length === 0 && <li className="py-6 text-center text-[14px] text-mute">찾는 메뉴가 없어요</li>}
          </ul>
        </>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="surface rounded-card px-4 pb-2 pt-3.5">
            <h2 className="pb-1 text-[12px] font-bold text-mute">{g.label}</h2>
            <ul className="grid grid-cols-2 gap-x-2">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="flex h-12 items-center gap-2.5 rounded-control hover:bg-soft/60">
                    <IconBox name={it.icon} />
                    <span className="min-w-0 truncate text-[15px] font-medium">{it.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
