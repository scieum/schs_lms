"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { splitByRanges, type Range } from "@/lib/domain/diff";
import { measure, type LengthUnit } from "@/lib/domain/length";
import { pairsOf, similarPairs } from "@/lib/domain/similar";

// 비슷한 문장 (Figma N34 ④ 417:97042 · 417:97763): 규칙만으로(AI 없음) 다른 학생 기록과 여섯 어절 넘게 겹친 곳.
// 배지(목록) · 알림 줄(③ 본문 아래) · 비교 시트(PC 가운데 모달 880 / 모바일 바텀시트). 학번·이름은 URL에 넣지 않는다 — 시트는 화면 상태로 연다.

export type SimilarPeer = { id: string; name: string; no: string; text: string; href: string };
export type SimilarSelf = { id: string; name: string; no: string; href: string };

/** 목록 배지 "비슷한 문장 n명" (좁은 자리는 "비슷 n명") */
export function SimilarBadge({ n, short = false }: { n: number; short?: boolean }) {
  if (!n) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip bg-wait-soft px-1.5 py-px text-[12px] font-bold text-[#9A6400]">
      <Layers size={12} /> {short ? `비슷 ${n}명` : `비슷한 문장 ${n}명`}
    </span>
  );
}

export type SimilarState = { other: SimilarPeer; mine: Range[]; theirs: Range[]; words: number }[];

/** 지금 본문과 다른 학생 글을 겹쳐 본다 (본문을 고치면 바로 다시 계산) */
export function useSimilar(self: string, text: string, peers: SimilarPeer[], ignore: string[] = []): SimilarState {
  return useMemo(() => {
    if (!peers.length || !text.trim()) return [];
    const byId = new Map(peers.map((p) => [p.id, p]));
    const pairs = similarPairs([{ id: self, text }, ...peers.map((p) => ({ id: p.id, text: p.text }))], { ignore });
    return pairsOf(pairs, self).map((x) => ({ ...x, other: byId.get(x.other)! })).filter((x) => x.other);
  }, [self, text, peers, ignore]);
}

/** ③ 알림 줄: "학생C 기록과 같은 말이 길게 겹쳐요 · 2곳" ↔ 비교하기 */
export function SimilarNotice({ state, onOpen }: { state: SimilarState; onOpen: () => void }) {
  if (!state.length) return null;
  const first = state[0];
  const who = state.length > 1 ? `${first.other.name} 외 ${state.length - 1}명` : first.other.name;
  const n = first.mine.length;
  return (
    <div className="flex items-center gap-2 rounded-control bg-wait-soft px-3 py-[9px]">
      <Layers size={14} className="shrink-0 text-[#9A6400]" />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="hidden md:inline">{who} 기록과 같은 말이 길게 겹쳐요 · {n}곳</span>
        <span className="md:hidden">{who}와 겹친 말 {n}곳</span>
      </span>
      <button type="button" onClick={onOpen} className="shrink-0 whitespace-nowrap text-[13px] font-bold text-key-strong">비교하기</button>
    </div>
  );
}

function Column({ name, no, text, ranges, unit, href, current, onRewrite }: { name: string; no: string; text: string; ranges: Range[]; unit: LengthUnit; href: string; current?: boolean; onRewrite?: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-inner bg-bg p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-[14px] font-bold">{name}</span>
        <span className="text-[12px] tabular-nums text-mute">{no}</span>
        {current && <span className="whitespace-nowrap rounded-chip bg-key-soft px-1.5 py-px text-[11px] font-bold text-key-strong">지금 보는 학생</span>}
        <span className="ml-auto text-[12px] tabular-nums text-mute">{measure(text, unit).toLocaleString()}{unit === "bytes" ? "B" : "자"}</span>
      </div>
      <p className="flex-1 whitespace-pre-wrap break-keep text-[14px] leading-6">
        {splitByRanges(text, ranges).map((p, i) => (p.on
          ? <span key={i} className="font-medium text-[#9A6400] underline decoration-wait decoration-2 underline-offset-[3px]">{p.text}</span>
          : <span key={i}>{p.text}</span>))}
      </p>
      {onRewrite
        ? <button type="button" onClick={onRewrite} className="inline-flex items-center gap-0.5 self-start text-[13px] font-medium text-key-strong">이 학생 다시 쓰기 <ChevronRight size={14} /></button>
        : <Link href={href} className="inline-flex items-center gap-0.5 self-start text-[13px] font-medium text-key-strong">이 학생 다시 쓰기 <ChevronRight size={14} /></Link>}
    </div>
  );
}

/** 비교 시트: PC 가운데 모달 880 · 모바일 바텀시트 */
export function SimilarSheet({ self, text, unit, state, onClose, onRewriteSelf }: {
  self: SimilarSelf; text: string; unit: LengthUnit; state: SimilarState; onClose: () => void; onRewriteSelf: () => void;
}) {
  const [at, setAt] = useState(0);
  const cur = state[Math.min(at, state.length - 1)];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-start md:px-6 md:pt-[120px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="비슷한 문장" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:max-h-[calc(100dvh-160px)] md:w-[880px] md:gap-4 md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-bold md:text-[18px]">비슷한 문장</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{self.name} ↔ {cur.other.name}</span>
          <button type="button" autoFocus onClick={onClose} aria-label="닫기" className="flex size-8 shrink-0 items-center justify-center text-sub"><X size={20} /></button>
        </div>
        {state.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {state.map((s, i) => (
              <button key={s.other.id} type="button" onClick={() => setAt(i)} aria-pressed={i === at}
                className={cx("shrink-0 whitespace-nowrap rounded-chip px-2.5 py-1 text-[12px]", i === at ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-sub")}>{s.other.name}</button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-chip bg-wait-soft px-2 py-0.5 text-[12px] font-bold text-[#9A6400]"><Layers size={12} /> 겹친 말 {cur.mine.length}곳 · {cur.words}어절</span>
          <span className="text-[12px] text-mute">여섯 어절 넘게 똑같이 이어진 곳만 표시해요</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          <Column name={self.name} no={self.no} text={text} ranges={cur.mine} unit={unit} href={self.href} current onRewrite={onRewriteSelf} />
          <Column name={cur.other.name} no={cur.other.no} text={cur.other.text} ranges={cur.theirs} unit={unit} href={cur.other.href} />
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <span className="min-w-0 flex-1 text-[12px] text-mute">둘 중 한 학생을 다시 쓰면 표시가 사라져요</span>
          <Button type="button" kind="outline" onClick={onClose} className="h-11 w-full py-0 md:h-10 md:w-20">닫기</Button>
        </div>
      </div>
    </div>
  );
}
