"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { cx } from "@/components/ui";
import { NEIS_BOOKMARKLET, NEIS_BOOKMARKLET_VERSION } from "@/lib/neis-bookmarklet";

/**
 * 확장 없이 쓰기 (Figma N21): "나이스 입력" 북마클릿. 북마크바로 끌어다 두고, 나이스 입력 화면에서 누르면
 * 붙여넣기 창이 떠서 확장과 같은 방식으로 채운다. 저장은 교사가 직접.
 * React 는 javascript: 주소를 막으므로 링크 주소는 그린 뒤에 넣는다.
 */
export function BookmarkletCard() {
  const link = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => { link.current?.setAttribute("href", NEIS_BOOKMARKLET); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(NEIS_BOOKMARKLET); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <section className="surface flex flex-col gap-3 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[15px] font-bold">설치 없이 쓰기 <span className="text-[12px] font-normal text-mute">북마클릿 v{NEIS_BOOKMARKLET_VERSION}</span></p>
        <a ref={link} draggable onClick={(e) => e.preventDefault()} title="북마크바로 끌어다 놓기"
          className="inline-flex h-9 shrink-0 cursor-grab items-center gap-1.5 whitespace-nowrap rounded-control bg-key px-3.5 text-[13px] font-bold text-white active:cursor-grabbing">
          <Bookmark size={15} />나이스 입력
        </a>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="whitespace-nowrap text-[13px] font-bold text-key-strong">쓰는 방법</button>
      </div>
      {open && (
        <ol className="flex flex-col gap-2 rounded-inner border border-line px-4 py-3 text-[13px] md:flex-row md:flex-wrap md:gap-x-6">
          {["'나이스 입력' 버튼을 북마크바로 끌어다 놓기", "아래 목록 › 복사", "나이스 입력 화면에서 북마크 누르기 › Ctrl+V", "채운 칸 확인 후 나이스 저장은 직접"].map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-key-soft text-[12px] font-bold text-key-strong">{i + 1}</span>{t}
            </li>
          ))}
          <li className="flex items-center gap-2 text-mute">
            끌어다 놓기가 안 되면
            <button type="button" onClick={copy} className={cx("font-bold", copied === false ? "text-bad" : "text-key-strong")}>
              {copied ? "복사했어요 · 새 북마크 주소에 붙여넣기" : copied === false ? "복사하지 못했어요" : "주소 복사"}
            </button>
          </li>
        </ol>
      )}
    </section>
  );
}
