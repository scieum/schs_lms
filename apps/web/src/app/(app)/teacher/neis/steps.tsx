"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { cx } from "@/components/ui";
import { NEIS_BOOKMARKLET, NEIS_BOOKMARKLET_VERSION } from "@/lib/neis-bookmarklet";

// 나이스 입력 세 단계 (Figma N31 392:420): ① 나이스 입력 버튼 달기(북마클릿) ② 기록 복사 ③ 나이스에서 채우기.
// 크롬 확장은 없앴다 (2026-10-19 "헷갈리니깐 확장프로그램 자체는 아예 없애버리자"). 저장은 선생님이 직접.
function Num({ n, soft }: { n: number; soft?: boolean }) {
  return <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold", soft ? "bg-key-soft text-key-strong" : "bg-key text-white")}>{n}</span>;
}

export function Steps() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  // React 는 javascript: 주소를 막으므로 링크 주소는 그린 뒤에 넣는다
  useEffect(() => { link.current?.setAttribute("href", NEIS_BOOKMARKLET); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(NEIS_BOOKMARKLET); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <section className="surface rounded-card p-4 md:p-5">
      <div className="grid md:grid-cols-3 md:gap-3 max-md:divide-y max-md:divide-line">
        <div className="flex flex-col gap-2.5 py-3 md:rounded-inner md:bg-[#F5F6F8] md:p-4 max-md:pt-0">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <Num n={1} />나이스 입력 버튼 달기
            <span className="ml-auto text-[12px] font-normal text-mute md:ml-0">v{NEIS_BOOKMARKLET_VERSION}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a ref={link} draggable onClick={(e) => e.preventDefault()} title="북마크바로 끌어다 놓기"
              className="inline-flex h-9 shrink-0 cursor-grab items-center gap-1.5 whitespace-nowrap rounded-control bg-key px-3.5 text-[13px] font-bold text-white active:cursor-grabbing">
              <Bookmark size={15} />나이스 입력
            </a>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="whitespace-nowrap text-[13px] font-bold text-key-strong">다는 방법</button>
            <span className="ml-auto text-[12px] text-mute md:hidden">PC 크롬에서 써요</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 py-3 md:flex-col md:items-start md:justify-start md:rounded-inner md:bg-[#F5F6F8] md:p-4">
          <p className="flex items-center gap-2 text-[15px] font-bold"><Num n={2} />기록 복사</p>
          <p className="text-[13px] text-sub">아래 목록 › 복사</p>
        </div>
        <div className="flex flex-col gap-1.5 py-3 md:gap-2.5 md:rounded-inner md:bg-[#F5F6F8] md:p-4 max-md:pb-0">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <Num n={3} />나이스에서 채우기
            <span className="ml-auto whitespace-nowrap rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub md:hidden">저장은 직접</span>
          </p>
          <p className="text-[13px] text-sub max-md:pl-[30px]">나이스 화면에서 버튼 › Ctrl+V › 한 번에 채우기</p>
          <span className="hidden self-start rounded-chip bg-[#fff] px-2 py-0.5 text-[12px] font-bold text-sub md:inline">저장은 직접</span>
        </div>
      </div>
      {open && (
        <ol className="mt-3 flex flex-col gap-2.5 rounded-inner border border-line px-4 py-3 text-[13px] md:flex-row md:flex-wrap md:gap-x-6">
          <li className="flex items-center gap-2"><Num n={1} soft />&apos;나이스 입력&apos; 버튼을 북마크바로 끌어다 놓기</li>
          <li className="flex flex-wrap items-center gap-2">
            <Num n={2} soft /><span className="text-mute">끌어다 놓기가 안 되면</span>
            <button type="button" onClick={copy} className={cx("font-bold", copied === false ? "text-bad" : "text-key-strong")}>
              {copied ? "복사했어요" : copied === false ? "복사하지 못했어요" : "주소 복사"}
            </button>
            → 새 북마크 주소에 붙여넣기
          </li>
          <li className="flex items-center gap-2"><Num n={3} soft />버전이 바뀌면 지우고 다시 달기</li>
        </ol>
      )}
    </section>
  );
}
