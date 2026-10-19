"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { findInText, guideEntry, type FoundRange, type GuideArea } from "@/lib/domain/guide-bank";
import type { Mark } from "./highlight-textarea";

// 기재요령 찾아보기 (Figma N43 ①) 화면 상태: 패널 열림 · 펼칠 원문 id · 이 글에서 찾기(찾은 원문 · 지금 몇 번째).
// 패널(앱 셸에 하나)과 편집기 머리 버튼 · 편집기 본문(밑줄 · 찾은 곳 줄)이 이 상태를 같이 본다.

type State = {
  open: boolean;
  /** N34 칩으로 열면 그 원문 카드를 맨 위에 펼친다 */
  focusId: string | null;
  /** 연 곳의 편집기 영역 (항목 순서 · 검색 가산) */
  area: GuideArea | null;
  /** 이 글에서 찾기: 원문 id + 지금 고른 자리 */
  found: { entryId: string; index: number } | null;
  /** 같은 id 를 다시 열어도 펼치게 */
  seq: number;
};

let state: State = { open: false, focusId: null, area: null, found: null, seq: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };
const SERVER: State = state;

export const guideStore = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  open: (opts: { focusId?: string | null; area?: GuideArea | null } = {}) =>
    set({ open: true, focusId: opts.focusId ?? null, area: opts.area ?? target?.area ?? state.area, seq: state.seq + 1 }),
  close: () => set({ open: false, focusId: null }),
  toggle: (area?: GuideArea | null) => (state.open ? guideStore.close() : guideStore.open({ area })),
  setFound: (f: State["found"]) => set({ found: f }),
};

export function useGuide(): State {
  return useSyncExternalStore(guideStore.subscribe, guideStore.get, () => SERVER);
}

// ---------- 이 글에서 찾기 대상 (지금 편집기 글) ----------

type Target = { text: () => string; area: GuideArea; focus?: () => void };
let target: Target | null = null;
const latest = new WeakMap<Target, string>();
const targetListeners = new Set<() => void>();

export const guideTarget = {
  get: () => target,
  subscribe: (l: () => void) => { targetListeners.add(l); return () => { targetListeners.delete(l); }; },
};

/** 편집기가 "이 글"을 알린다 (마지막에 그린 편집기가 대상). 떠나면 찾은 표시도 지운다 */
export function useGuideTarget(text: string, area: GuideArea, focus?: () => void) {
  useEffect(() => {
    const me: Target = { text: () => latest.get(me) ?? "", area, focus };
    latest.set(me, text);
    target = me;
    targetListeners.forEach((l) => l());
    return () => {
      if (target === me) { target = null; targetListeners.forEach((l) => l()); }
      latest.delete(me);
      guideStore.setFound(null);
    };
    // text 는 아래 효과가 따로 갱신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);
  useEffect(() => { if (target) latest.set(target, text); }, [text]);
}

export function useHasGuideTarget(): boolean {
  return useSyncExternalStore(guideTarget.subscribe, () => !!target, () => false);
}

/** 패널의 "이 글에서 찾기": 찾은 곳 수 (0이면 표시하지 않음) */
export function findInTarget(entryId: string): number {
  const e = guideEntry(entryId);
  if (!e || !target) return 0;
  const n = findInText(e, target.text()).length;
  guideStore.setFound(n ? { entryId, index: 0 } : null);
  if (n) target.focus?.();
  return n;
}

/** 편집기 본문: 찾은 자리 밑줄(#3D56E0) + 찾은 곳 줄 (③ 머리 아래) */
export function useGuideMarks(text: string): { marks: Mark[]; ranges: FoundRange[]; line: React.ReactNode; focusKey: string | null } {
  const g = useGuide();
  const entry = g.found ? guideEntry(g.found.entryId) : undefined;
  const ranges = useMemo(() => (entry ? findInText(entry, text) : []), [entry, text]);
  const index = g.found ? Math.min(g.found.index, Math.max(0, ranges.length - 1)) : 0;
  const marks = useMemo<Mark[]>(() => ranges.map((r, i) => ({ start: r.start, end: r.end, tone: "guide", key: i === index ? `guide-now-${index}` : `guide-${i}`, strong: i === index })), [ranges, index]);
  const line = g.found && entry ? (
    <FoundLine words={ranges.map((r) => r.word)} index={index}
      onStep={(d) => guideStore.setFound({ entryId: entry.id, index: (index + d + ranges.length) % Math.max(1, ranges.length) })}
      onClose={() => guideStore.setFound(null)} />
  ) : null;
  return { marks, ranges, line, focusKey: g.found && ranges.length ? `guide-now-${index}` : null };
}

/** 찾은 곳 줄 (N43 (b)): "이 글에서 2곳 찾았어요 · ‘○○’ ‘○○’" ↔ ‹ 1/2 › · × */
function FoundLine({ words, index, onStep, onClose }: { words: string[]; index: number; onStep: (d: number) => void; onClose: () => void }) {
  const n = words.length;
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-control bg-key-soft px-3 py-2 text-key-strong" role="status">
      <Search size={14} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {n ? <>이 글에서 {n}곳 찾았어요<span className="max-md:hidden"> · {[...new Set(words)].slice(0, 3).map((w) => `‘${w}’`).join(" ")}</span></> : "고친 글에는 더 없어요"}
      </span>
      {n > 1 && (
        <span className="flex shrink-0 items-center text-[12px] font-bold tabular-nums">
          <button type="button" aria-label="앞 자리" onClick={() => onStep(-1)} className="flex size-6 items-center justify-center"><ChevronLeft size={14} /></button>
          {index + 1}/{n}
          <button type="button" aria-label="다음 자리" onClick={() => onStep(1)} className="flex size-6 items-center justify-center"><ChevronRight size={14} /></button>
        </span>
      )}
      <button type="button" aria-label="찾은 표시 지우기" onClick={onClose} className="flex size-6 shrink-0 items-center justify-center"><X size={14} /></button>
    </div>
  );
}
