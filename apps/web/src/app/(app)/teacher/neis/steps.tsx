"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Copy } from "lucide-react";
import { cx } from "@/components/ui";
import { NEIS_BOOKMARKLET, NEIS_BOOKMARKLET_VERSION } from "@/lib/neis-bookmarklet";

// 나이스 입력 세 단계 (Figma N47 단계 카드 530:733 · 모바일은 N31 392:420 그대로 · N39 대조 안내): ① 나이스 입력 버튼 달기(북마클릿) ② 기록 복사 ③ 나이스에서 채우기 › 대조 · 흔적 지우기.
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

  const howto = (
    <ol className="flex flex-col gap-2.5 rounded-inner border border-line px-4 py-3 text-[13px] md:flex-row md:flex-wrap md:gap-x-6">
      <li className="flex items-center gap-2"><Num n={1} soft />&apos;나이스 입력&apos; 버튼을 북마크바로 끌어다 놓기</li>
      <li className="flex flex-wrap items-center gap-2">
        <Num n={2} soft /><span className="text-mute">끌어다 놓기가 안 되면</span>
        <button type="button" onClick={copy} className={cx("font-bold", copied === false ? "text-bad" : "text-key-strong")}>
          {copied ? "복사했어요" : copied === false ? "복사하지 못했어요" : "주소 복사"}
        </button>
        <span className="max-md:basis-full max-md:pl-[30px]">→ 새 북마크 주소에 붙여넣기</span>
      </li>
      <li className="flex items-center gap-2"><Num n={3} soft />버전이 바뀌면 지우고 다시 달기</li>
    </ol>
  );
  const chip = "whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold text-sub";
  // PC 칸: 같은 높이 132 · 제목 줄 → 설명 한 줄 → 바닥 줄(버튼/칩 가로, 높이 36) (Figma N47 단계 카드 530:733)
  const cell = "flex flex-col gap-1.5 py-3 md:min-h-[132px] md:rounded-inner md:bg-bg md:p-4";
  const foot = "hidden min-h-9 flex-wrap items-center gap-1.5 md:mt-auto md:flex";

  return (
    <section className="surface rounded-card p-4 md:p-5">
      <div className="grid md:grid-cols-3 md:gap-3 max-md:divide-y max-md:divide-line">
        <div className={cx(cell, "gap-2.5 max-md:pt-0 md:gap-1.5")}>
          <p className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold">
            <Num n={1} />나이스 입력 버튼 달기
            <span className="ml-auto text-[12px] font-normal text-mute">v{NEIS_BOOKMARKLET_VERSION}</span>
          </p>
          <p className="hidden text-[13px] text-sub md:block">북마크바에 한 번만 달아 두면 돼요 · PC 크롬</p>
          <div className="flex flex-wrap items-center gap-3 md:mt-auto">
            <a ref={link} draggable onClick={(e) => e.preventDefault()} title="북마크바로 끌어다 놓기"
              className="inline-flex h-9 shrink-0 cursor-grab items-center gap-1.5 whitespace-nowrap rounded-control bg-key px-3.5 text-[13px] font-bold text-white active:cursor-grabbing">
              <Bookmark size={15} />나이스 입력
            </a>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="whitespace-nowrap text-[13px] font-bold text-key-strong">{open ? "다는 방법 닫기" : "다는 방법"}</button>
            <span className="ml-auto text-[12px] text-mute md:hidden">PC 크롬에서 써요</span>
          </div>
          {open && <div className="md:hidden">{howto}</div>}
        </div>
        <div className={cx(cell, "max-md:flex-row max-md:items-center max-md:justify-between")}>
          <p className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold"><Num n={2} />기록 복사</p>
          <p className="text-[13px] text-sub md:hidden">아래 목록 › 복사</p>
          <p className="hidden text-[13px] text-sub md:block">아래 보낼 기록에서 과목마다 복사</p>
          <div className={foot}>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] bg-key px-2 py-1 text-[12px] font-bold text-white"><Copy size={12} />복사</span>
            <span className={cx(chip, "border border-line bg-[#fff]")}>확정한 글만</span>
            <span className={cx(chip, "border border-line bg-[#fff]")}>시트 · 엑셀은 ⋯</span>
          </div>
        </div>
        <div className={cx(cell, "max-md:pb-0")}>
          <p className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold">
            <Num n={3} />나이스에서 채우기
            <span className="ml-auto flex gap-1 md:hidden">
              <span className={cx(chip, "bg-soft")}>저장은 직접</span>
              <span className={cx(chip, "bg-soft")}>흔적 지우기</span>
            </span>
          </p>
          <p className="text-[13px] text-sub max-md:pl-[30px]">나이스 화면에서 버튼 › Ctrl+V › 한 번에 채우기 › 대조</p>
          <div className={foot}>
            <span className={cx(chip, "border border-line bg-[#fff]")}>저장은 직접</span>
            <span className={cx(chip, "border border-line bg-[#fff]")}>다 하면 흔적 지우기</span>
          </div>
        </div>
      </div>
      {open && <div className="mt-3 hidden md:block">{howto}</div>}
    </section>
  );
}
