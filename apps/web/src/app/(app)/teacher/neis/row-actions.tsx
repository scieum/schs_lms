"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileSpreadsheet, MoreHorizontal } from "lucide-react";
import { cx } from "@/components/ui";
import { SheetCopy } from "@/components/writing/sheet-copy";
import { ExcelExport } from "@/components/writing/excel-export";
import type { ScopeArg } from "../class-actions";
import { CopyButton } from "./copy-button";

// 보낼 기록 한 줄의 동작 (Figma N47 행 529:721 · 더보기 메뉴 529:842).
// 주 동작은 복사 하나(나이스 입력 버튼용). 시트용 복사 · 엑셀로 받기 · 파일로 받기는 ⋯ 더보기 안으로.
// PC는 버튼 아래 오른쪽 맞춤 팝오버 264, 모바일은 바텀시트(과목 이름 · 확정 수 머리).

type Props = { href: string; scope: ScopeArg; title: string; sub: string; confirmed: number; total: number };
type Open = "menu" | "sheet" | "excel" | null;

export function RowActions({ href, scope, title, sub, confirmed, total }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const box = useRef<HTMLDivElement>(null);
  const menu = open === "menu";

  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => {
      // PC 팝오버만 바깥 클릭으로 닫는다 (모바일 바텀시트는 덮개가 닫음)
      if (window.matchMedia("(min-width: 768px)").matches && box.current && !box.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", out);
    window.addEventListener("keydown", esc);
    const lock = !window.matchMedia("(min-width: 768px)").matches;
    const prev = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", out);
      window.removeEventListener("keydown", esc);
      if (lock) document.body.style.overflow = prev;
    };
  }, [menu]);

  const items = (mobile: boolean) => {
    const item = cx("flex w-full items-center gap-3 rounded-control px-3 text-left hover:bg-bg disabled:pointer-events-none disabled:opacity-40", mobile ? "min-h-14 py-2" : "py-2");
    const icon = (I: typeof Copy) => <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-key-soft text-key-strong"><I size={16} /></span>;
    const text = (label: string, hint: string) => (
      <span className="flex min-w-0 flex-col">
        <span className={cx("font-bold text-ink", mobile ? "text-[15px]" : "text-[14px]")}>{label}</span>
        <span className="truncate text-[12px] font-medium text-mute">{hint}</span>
      </span>
    );
    return (
      <>
        <button type="button" role="menuitem" className={item} disabled={!total} onClick={() => setOpen("sheet")}>
          {icon(Copy)}{text("시트용 복사", "구글 시트·엑셀 칸에 그대로 붙여요")}
        </button>
        <button type="button" role="menuitem" className={item} disabled={!total} onClick={() => setOpen("excel")}>
          {icon(FileSpreadsheet)}{text("엑셀로 받기", "AI 원안과 최종 글을 나란히 받아요")}
        </button>
        <a role="menuitem" href={confirmed ? href : undefined} download aria-disabled={!confirmed} onClick={() => setOpen(null)}
          className={cx(item, !confirmed && "pointer-events-none opacity-40")}>
          {icon(Download)}{text("파일로 받기", confirmed ? "확정본 파일 · 복사가 안 될 때" : "확정한 학생이 없어요")}
        </a>
      </>
    );
  };

  return (
    <div ref={box} className="relative flex shrink-0 items-center gap-2 max-md:w-full md:w-[160px] md:justify-end">
      <CopyButton href={href} disabled={!confirmed} className="max-md:flex-1" />
      <button type="button" onClick={() => setOpen(menu ? null : "menu")} aria-haspopup="menu" aria-expanded={menu} aria-label={`${title} 더보기 (시트용 복사 · 엑셀로 받기 · 파일로 받기)`}
        className={cx("flex size-11 shrink-0 items-center justify-center rounded-control border md:size-9", menu ? "border-key bg-key-soft text-key-strong" : "border-hair bg-[#fff] text-ink hover:bg-soft")}>
        <MoreHorizontal size={20} />
      </button>

      {menu && (
        <>
          <div role="menu" aria-label={`${title} 더보기`}
            className="absolute right-0 top-full z-50 mt-1.5 hidden w-[264px] flex-col gap-0.5 rounded-card border border-line bg-[#fff] p-1.5 shadow-[0_8px_24px_rgba(28,32,51,0.16)] md:flex">
            {items(false)}
          </div>
          <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:hidden" onClick={() => setOpen(null)}>
            <div role="menu" aria-label={`${title} 더보기`} onClick={(e) => e.stopPropagation()}
              className="flex w-full flex-col gap-1 rounded-t-[16px] bg-[#fff] px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2.5">
              <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
              <div className="px-3 pb-2 pt-2.5">
                <p className="text-[17px] font-bold">{title}</p>
                <p className="text-[13px] font-medium text-mute">{sub} · 확정 {confirmed} / {total}명</p>
              </div>
              {items(true)}
            </div>
          </div>
        </>
      )}

      <SheetCopy scope={scope} open={open === "sheet"} onClose={() => setOpen(null)} />
      <ExcelExport scope={scope} open={open === "excel"} onClose={() => setOpen(null)} defaultWho="confirmed" />
    </div>
  );
}
