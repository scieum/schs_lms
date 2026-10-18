"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Combine, Layers } from "lucide-react";
import { cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { orderPieces, type PieceSource } from "@/lib/domain/merge";
import type { AreaBox } from "@/lib/server/pieces-board";
import { RecordCompetency } from "@/components/writing/record-competency";

// 영역 카드 (Figma N13 261:3155…): 제목·조각 수 + 분량(조각 · 본문/한도) 막대 + 합치기 / 조각 줄은 날짜 순, 본문 줄은 맨 아래

const CHIP: Record<PieceSource, string> = {
  누가기록: "bg-key-soft text-key-strong",
  메모: "bg-soft text-sub",
  본문: "bg-line text-ink",
  "특색 활동": "bg-navy-2 text-white",
};
const STATUS = { 확정: "bg-ok-soft text-ok", "작성 중": "bg-wait-soft text-[#9A6400]", 미작성: "bg-soft text-mute" } as const;
const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "");
const SHOWN = 3;

/**
 * 조각이 없을 때 갈 곳 (Figma N22): 세특은 세특 편집 화면의 조각 칸, 행발은 행발 화면, 창체는 그 영역의 누가기록 탭.
 * (예전에는 모두 누가기록으로 가서 세특에서 누르면 동아리 탭이 열렸다)
 */
function emptyLink(box: AreaBox): { href: string; label: string } {
  const edit = box.editHref.replace(/&panel=merge/, "");
  if (box.filter === "세특") return { href: edit, label: "세특에서 조각 만들기 ›" };
  if (box.filter === "행발") return { href: edit, label: "행발에서 조각 남기기 ›" };
  const club = box.editHref.match(/[?&]club=([^&]+)/)?.[1];
  return { href: `/teacher/logs?area=${encodeURIComponent(box.filter)}${club ? `&club=${club}` : ""}`, label: "누가기록 쓰기 ›" };
}

export function AreaBoxCard({ box, studentId }: { box: AreaBox & { piecesBytes: number; bodyBytes: number }; studentId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const pct = Math.min(100, Math.round((box.bodyBytes / box.maxBytes) * 100));
  const over = box.bodyBytes > box.maxBytes;
  const empty = !box.pieces.length && !box.body.content;
  const rows = [
    ...orderPieces(box.pieces).map((p) => ({ ...p, status: null as null | keyof typeof STATUS })),
    ...(box.body.content || box.pieces.length ? [{ id: "body", source: "본문" as const, date: null, text: box.body.content, status: box.body.status }] : []),
  ];
  const visible = all ? rows : rows.slice(0, SHOWN + 1);

  return (
    <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:px-6 md:py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold">{box.title} <span className="text-[13px] font-normal text-mute">{box.pieces.length}</span></h3>
          <p className="text-[12px] text-mute">{box.sub}</p>
        </div>
        <div className="flex w-full flex-col gap-1.5 md:w-[200px]">
          <span className="text-[12px] text-sub">
            조각 {box.piecesBytes.toLocaleString()}B · 본문 <b className={cx(over ? "text-bad" : "text-ink")}>{box.bodyBytes.toLocaleString()}</b>/{box.maxBytes.toLocaleString()}B
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className={cx("h-full rounded-full", over ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Link href={box.editHref} aria-disabled={empty}
          className={cx("hidden h-9 items-center gap-1.5 rounded-control bg-key-soft px-3.5 text-[13px] font-bold text-key-strong hover:bg-key-soft/70 md:inline-flex", empty && "pointer-events-none opacity-40")}>
          <Combine size={16} /> 합치기
        </Link>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-1.5 rounded-inner bg-bg py-7 text-center">
          <Layers size={24} className="text-faint" />
          <p className="text-[14px] text-sub">아직 조각이 없어요</p>
          <Link href={emptyLink(box).href} className="text-[13px] font-bold text-key-strong">{emptyLink(box).label}</Link>
        </div>
      ) : (
        // 역량 보기 (Figma N18): 조각과 본문을 한 글로 이어 3대 역량으로 나눈다
        <RecordCompetency studentId={studentId} text={rows.map((r) => r.text.trim()).filter(Boolean).join(" ")} title="조각 전체">
        <ul className="overflow-hidden rounded-inner border border-line">
          {visible.map((p) => {
            const on = open === p.id;
            return (
              <li key={p.id} className="border-t border-soft first:border-0">
                <button type="button" onClick={() => setOpen(on ? null : p.id)} aria-expanded={on}
                  className={cx("flex w-full flex-col gap-1.5 px-3.5 py-3 text-left", on ? "bg-bg" : "hover:bg-bg/60")}>
                  <span className="flex items-center gap-2">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[12px] font-medium", CHIP[p.source])}>{p.source}</span>
                    {p.status && <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[12px] font-bold", STATUS[p.status])}>{p.status}</span>}
                    <span className="text-[12px] text-mute">{md(p.date)}</span>
                    <span className="ml-auto shrink-0 text-[12px] tabular-nums text-sub">{neisBytes(p.text).toLocaleString()}B</span>
                    <ChevronDown size={16} className={cx("shrink-0 text-faint transition-transform", on && "rotate-180")} />
                  </span>
                  <span className={cx("text-[13px] leading-5", !on && "line-clamp-2", !p.text && "text-mute")}>{p.text || "아직 본문이 없어요"}</span>
                </button>
              </li>
            );
          })}
          {rows.length > SHOWN + 1 && (
            <li className="border-t border-soft">
              <button type="button" onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-1 py-2.5 text-[12px] font-medium text-sub hover:bg-bg">
                {all ? "접기" : `${rows.length - SHOWN - 1}개 더 보기`}<ChevronRight size={12} className={cx(all ? "-rotate-90" : "rotate-90")} />
              </button>
            </li>
          )}
        </ul>
        </RecordCompetency>
      )}

      <Link href={box.editHref} aria-disabled={empty}
        className={cx("flex h-11 items-center justify-center gap-1.5 rounded-control border border-hair bg-[#fff] text-[14px] font-bold md:hidden", empty && "pointer-events-none opacity-40")}>
        <Combine size={16} className="text-key-strong" /> 합치기
      </Link>
    </section>
  );
}
