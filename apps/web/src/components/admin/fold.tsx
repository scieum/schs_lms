"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// AI 배너 버튼: PC 는 버튼 그대로, 모바일은 화살표 하나(시안) → 누르면 배너 아래에 같은 버튼이 펼쳐진다.
export function FoldButtons({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <>
      <div className="hidden shrink-0 gap-2 md:flex">{children}</div>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? "접기" : "더 보기"} className="-mr-1 shrink-0 rounded-control p-1 text-mute md:hidden">
        {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>
    </>
  );
}

export function FoldRow({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return <div className="flex justify-end gap-2 md:hidden">{children}</div>;
}

/** 링크 하나짜리 배너 버튼: PC 는 버튼, 모바일은 화살표 링크 */
export function FoldLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <span className="hidden shrink-0 md:block">{children}</span>
      <Link href={href} aria-label="열기" className="-mr-1 shrink-0 rounded-control p-1 text-mute md:hidden">
        <ChevronRight size={20} />
      </Link>
    </>
  );
}
