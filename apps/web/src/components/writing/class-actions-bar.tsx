"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Download, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import type { ScopeArg } from "@/app/(app)/teacher/class-actions";
import { useWorkspace } from "./workspace";
import { ExcelExport } from "./excel-export";
import { SheetCopy } from "./sheet-copy";
import { OPEN_EXCEL_EVENT } from "./class-write-panel";

// 동작 줄 (Figma N42 ①②③): 목록 머리 아래 한 줄 — 왼쪽 "물리학 1분반 · 24명" + "확정 2 · 임시 6 · 빈 글 16"
// ↔ 오른쪽 "✦ 반 전체 글 쓰기" · "✓ 반 전체 검사"(N35, 자리만 옮김) · "⤓ 엑셀로 받기" · "⧉ 시트용 복사". 모바일은 옆으로 미는 버튼 줄 + 요약 한 줄.
// 켜진 버튼은 1px #536DFE 테두리. 세특 분반 · 담임 반 창체(자율·진로) · 행발 · 동아리가 같이 쓴다.

export function ClassActionsBar({ title, total, counts }: { title: string; total: number; counts: { confirmed: number; draft: number; empty: number } }) {
  const ws = useWorkspace();
  const w = ws?.write ?? null;
  const [excel, setExcel] = useState(false);
  const [copy, setCopy] = useState(false);
  useEffect(() => {
    const open = () => { setExcel(true); void w?.loadRoster(true); };
    window.addEventListener(OPEN_EXCEL_EVENT, open);
    return () => window.removeEventListener(OPEN_EXCEL_EVENT, open);
  }, [w]);
  if (!ws || !w) return null;
  const scope = ws.scope as ScopeArg;
  const panel = ws.panel;
  const sum = `확정 ${counts.confirmed} · 임시 ${counts.draft} · 빈 글 ${counts.empty}`;

  const btn = (on: boolean, soft = false) => cx(
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border px-3.5 text-[13px] font-bold",
    on ? "border-key bg-[#fff] text-key-strong" : soft ? "border-transparent bg-key-soft text-key-strong hover:bg-[#e3e7ff]" : "border-hair bg-[#fff] text-ink hover:bg-soft",
  );
  const toggleWrite = () => {
    if (panel === "write") { if (w.phase !== "running") ws.setPanel(null); return; }
    ws.setPanel("write");
    void w.loadRoster(true);
  };
  const toggleCheck = () => {
    if (panel === "check") { ws.setPanel(null); return; }
    ws.setPanel("check");
    ws.runCheck();
  };
  const openExcel = () => { setCopy(false); setExcel(true); void w.loadRoster(true); };
  const openCopy = () => { setCopy((c) => !c); if (!copy) void w.loadRoster(true); };
  const banner = w.banner && w.phase === "idle";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <p className="hidden min-w-0 flex-1 items-baseline gap-2 md:flex">
          <span className="truncate text-[15px] font-bold">{title} · {total}명</span>
          <span className="shrink-0 whitespace-nowrap text-[13px] text-mute">{sum}</span>
        </p>
        <div className="relative -mx-4 md:mx-0">
          <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:overflow-visible md:px-0" role="toolbar" aria-label="반 전체 동작">
            <button type="button" onClick={toggleWrite} aria-pressed={panel === "write"} className={btn(panel === "write", true)}><Sparkles size={14} /> 반 전체 글 쓰기</button>
            <button type="button" onClick={toggleCheck} aria-pressed={panel === "check"} className={btn(panel === "check")}><Check size={14} strokeWidth={2.5} /> 반 전체 검사</button>
            <button type="button" onClick={openExcel} aria-haspopup="dialog" className={btn(excel)}><Download size={14} /> 엑셀로 받기</button>
            <span className="relative hidden md:inline-flex">
              <button type="button" onClick={openCopy} aria-expanded={copy} className={btn(copy)}><Copy size={14} /> 시트용 복사</button>
              <SheetCopy scope={scope} roster={w.roster} open={copy} onClose={() => setCopy(false)} lockScroll={false} />
            </span>
            <button type="button" onClick={openCopy} aria-expanded={copy} className={cx(btn(copy), "md:hidden")}><Copy size={14} /> 시트용 복사</button>
          </div>
        </div>
        <p className="truncate text-[12px] text-mute md:hidden">{title} · {total}명 · {sum}</p>
      </div>
      {banner && w.banner && (
        <div className="flex items-center gap-3 rounded-control bg-key-soft px-4 py-2.5" role="status">
          <Sparkles size={14} className="shrink-0 text-key-strong" />
          <span className="min-w-0 flex-1 break-keep text-[13px] font-medium text-key-strong">반 전체 글 쓰기가 멈췄어요 · {w.banner.written} / {w.banner.total}명 썼어요</span>
          <button type="button" onClick={() => { ws.setPanel("write"); void w.loadRoster(true); w.resumeSaved(); }}
            className="h-8 shrink-0 whitespace-nowrap rounded-control bg-key px-3 text-[13px] font-bold text-white hover:bg-key-strong">이어 쓰기</button>
        </div>
      )}
      <span className="md:hidden"><SheetCopy scope={scope} roster={w.roster} open={copy} onClose={() => setCopy(false)} /></span>
      <ExcelExport scope={scope} roster={w.roster} open={excel} onClose={() => setExcel(false)} />
    </div>
  );
}
