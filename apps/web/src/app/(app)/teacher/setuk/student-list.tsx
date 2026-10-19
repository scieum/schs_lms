"use client";
import { useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Tag, cx } from "@/components/ui";
import { SimilarBadge } from "@/components/writing/similar-sheet";

// 세특 분반 학생 목록 (Figma N34 ④ 417:97042): 거르기 칩 [전체 n | ≋ 비슷한 문장 n] (화면 상태 — URL에 넣지 않는다) · 이름 아래 비슷한 문장 배지

export type ListItem = { id: string; no: string; name: string; status: "확정" | "작성 중" | "미작성"; href: string; similar: number; on: boolean };

export function SetukStudentList({ items }: { items: ListItem[] }) {
  const [only, setOnly] = useState(false);
  const simN = items.filter((x) => x.similar > 0).length;
  const shown = only ? items.filter((x) => x.similar > 0) : items;
  const chip = (on: boolean) => cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[12px]", on ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-sub");
  return (
    <>
      {simN > 0 && (
        <div className="-mt-1 mb-2 flex gap-1.5" role="radiogroup" aria-label="거르기">
          <button type="button" role="radio" aria-checked={!only} onClick={() => setOnly(false)} className={chip(!only)}>전체 {items.length}</button>
          <button type="button" role="radio" aria-checked={only} onClick={() => setOnly(true)} className={chip(only)}><Layers size={12} /> 비슷한 문장 {simN}</button>
        </div>
      )}
      <ul className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">
        {shown.map((s) => (
          <li key={s.id}>
            <Link href={s.href} aria-current={s.on ? "true" : undefined}
              className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", s.on ? "bg-white" : "hover:bg-white/60")}>
              <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{s.no}</span>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className={cx("max-w-full truncate", s.on && "font-bold")}>{s.name}</span>
                <SimilarBadge n={s.similar} />
              </span>
              <Tag tone={s.status === "확정" ? undefined : s.status === "작성 중" ? "bg-wait-soft text-wait" : "bg-white text-mute"}>{s.status}</Tag>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
