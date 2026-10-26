"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { cx } from "@/components/ui";
import { dayLabel, pieceKinds, piecesByDay, type CollectStudent, type StudentPiece } from "@/lib/domain/collect";

// 학생별 조각 창 (Figma N77 a PC 가운데 560 2012:21970 · b 모바일 바닥 시트 2012:50339): 조각 모으기 오른쪽 "학생별 조각"에서 이름을 누르면 연다.
// 머리 = 번호 · 이름 · 조각 n · ✕, 종류 칩(전체 · 메모 n …, 모바일은 옆으로 밀기), 날짜별 조각 카드(종류 · 내가 씀 · 지우기 · 글 전체), 바닥 [닫기] [이 학생 글 짓기].

const KIND: Record<string, string> = { "자료 요약": "bg-key-soft text-key-strong", "공통 활동": "bg-new-soft text-[#0A7E98]", "수행평가": "bg-ok-soft text-[#007A47]" };

export function StudentPiecesDialog({ student, composeHref, onClose, onRemove, busy }: {
  student: CollectStudent;
  composeHref: string;
  onClose: () => void;
  onRemove: (p: StudentPiece) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<string | null>(null);
  const pieces = student.pieces ?? [];
  const kinds = pieceKinds(pieces);
  const pick = kind && kinds.some((k) => k.source === kind) ? kind : null;
  const days = piecesByDay(pieces, pick);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const chip = (on: boolean) => cx("h-8 shrink-0 whitespace-nowrap rounded-[16px] px-3 text-[13px]", on ? "bg-key-soft font-bold text-key-strong" : "bg-soft font-medium text-sub");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(25,31,40,0.45)] md:items-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${student.name} 조각`} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[#fff] md:max-h-[80dvh] md:max-w-[560px] md:rounded-[12px]">
        <span className="mt-2.5 h-1 w-10 shrink-0 self-center rounded-[2px] bg-[#D1D6DB] md:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 pb-3 pl-5 pr-4 pt-3 md:pl-6 md:pr-5 md:pt-[22px]">
          <span className="text-[13px] font-medium text-mute md:text-[14px]">{student.no}</span>
          <h2 className="truncate text-[18px] font-bold">{student.name}</h2>
          <span className="shrink-0 rounded-[6px] bg-soft px-1.5 py-0.5 text-[12px] font-bold text-sub">조각 {pieces.length}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-mute hover:text-ink"><X size={20} /></button>
        </div>
        {kinds.length > 1 && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-3 md:flex-wrap md:px-6" role="group" aria-label="종류">
            <button type="button" aria-pressed={!pick} onClick={() => setKind(null)} className={chip(!pick)}>전체 {pieces.length}</button>
            {kinds.map((k) => <button key={k.source} type="button" aria-pressed={pick === k.source} onClick={() => setKind(k.source)} className={chip(pick === k.source)}>{k.source} {k.n}</button>)}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-y border-line px-5 py-3 md:px-6">
          {!pieces.length && <p className="py-10 text-center text-[14px] text-mute">아직 남긴 조각이 없어요</p>}
          {days.map((d) => (
            <section key={d.date ?? "none"} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold text-mute">{dayLabel(d.date)}</h3>
              {d.items.map((p) => (
                <article key={p.id} className="flex flex-col gap-1.5 rounded-[10px] bg-bg px-3.5 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cx("rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold", KIND[p.source] ?? "bg-[#fff] text-sub")}>{p.source}</span>
                    {p.mine && <span className="text-[12px] font-medium text-mute">내가 씀</span>}
                    <span className="flex-1" />
                    {p.mine && (
                      <button type="button" onClick={() => onRemove(p)} disabled={busy} className="-my-1 rounded-control px-1.5 py-1 text-[12px] font-medium text-faint hover:bg-bad-soft hover:text-bad disabled:opacity-40">지우기</button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-keep text-[14px] leading-[22px]">{p.text}</p>
                </article>
              ))}
            </section>
          ))}
        </div>
        <div className="flex shrink-0 gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 md:justify-end md:px-6 md:pb-5 md:pt-3.5">
          <button type="button" onClick={onClose} className="h-[52px] w-24 rounded-control border border-line text-[15px] font-bold text-sub md:h-10 md:w-auto md:px-4 md:text-[14px]">닫기</button>
          <Link href={`${composeHref}&student=${student.id}`}
            className="flex h-[52px] flex-1 items-center justify-center gap-0.5 rounded-control bg-key text-[15px] font-bold text-[#fff] md:h-10 md:flex-none md:px-4 md:text-[14px]">이 학생 글 짓기 <ChevronRight size={16} /></Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
