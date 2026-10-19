"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

// 본문 밑줄 (Figma N34 ①·③·④): textarea 뒤에 같은 글꼴·여백·줄바꿈 규칙의 거울 div 를 두고, 걸린 자리를 밑줄로 그린다.
// 글자는 거울이 그리고(textarea 글자는 투명, 커서·선택만 보임) — 펼친 행의 걸린 말은 빨간 글자로.
// 밑줄 자리를 누르면(커서가 그 안이면) onPickMark(key) — 검사 행을 연다. 높이는 내용에 맞춰 늘어난다(스크롤 없음).

/** 본문에서 고른 글 (N35 문장 보관하기) */
export type TextSelection = { start: number; end: number; text: string };

/** style (N38): 근거 없음 = dotted(주황 점선), 맞춤법 = wavy(인디고 물결) — 금칙어 막음(빨강 실선) · 확인(주황 실선)과 모양이 다르다 */
export type Mark = { start: number; end: number; tone: "block" | "warn" | "similar" | "spell" | "guide"; key?: string; strong?: boolean; style?: "solid" | "dotted" | "wavy" };

const TONE: Record<Mark["tone"], string> = { block: "decoration-bad", warn: "decoration-wait", similar: "decoration-wait", spell: "decoration-[#7889FF]", guide: "decoration-[#3D56E0] text-[#3D56E0] [-webkit-text-stroke:0.3px_currentColor]" };
const STYLE = { solid: "", dotted: "decoration-dotted", wavy: "decoration-wavy" } as const;

/** 같은 자리에 둘 이상이면 하나만: 기재요령 찾기(N43, 켠 동안) > 금칙어(막음) > 근거 없음 > 그 밖 확인 > 맞춤법 > 비슷한 문장 */
const rank = (m: Mark) => (m.tone === "guide" ? -1 : m.tone === "block" ? 0 : m.style === "dotted" ? 1 : m.tone === "warn" ? 2 : m.tone === "spell" ? 3 : 4);

/** 겹치지 않게 고른 조각: 앞선 순위가 자리를 먼저 차지하고, 뒤 순위는 남은 자리만 */
function pieces(text: string, marks: Mark[]): { text: string; mark?: Mark }[] {
  const taken: { start: number; end: number; mark: Mark }[] = [];
  const sorted = [...marks].filter((x) => x.end > x.start && x.end <= text.length).sort((a, b) => rank(a) - rank(b) || Number(b.strong ?? 0) - Number(a.strong ?? 0) || a.start - b.start);
  for (const m of sorted) {
    let segs = [{ start: m.start, end: m.end }];
    for (const t of taken) {
      segs = segs.flatMap((s) => (t.end <= s.start || t.start >= s.end ? [s] : [
        ...(t.start > s.start ? [{ start: s.start, end: t.start }] : []),
        ...(t.end < s.end ? [{ start: t.end, end: s.end }] : []),
      ]));
    }
    for (const s of segs) if (s.end > s.start) taken.push({ ...s, mark: m });
  }
  taken.sort((a, b) => a.start - b.start);
  const out: { text: string; mark?: Mark }[] = [];
  let at = 0;
  for (const t of taken) {
    if (t.start > at) out.push({ text: text.slice(at, t.start) });
    out.push({ text: text.slice(t.start, t.end), mark: t.mark });
    at = t.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className"> & {
  value: string;
  onChange: (v: string) => void;
  marks: Mark[];
  onPickMark?: (key: string) => void;
  /** 이 key 의 밑줄로 스크롤 (행을 펼칠 때) */
  focusKey?: string | null;
  /** 바깥 상자 (배경·모서리) */
  boxClassName?: string;
  /** 글자·여백 (거울과 textarea 가 같이 쓴다) */
  textClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
  /** 고른 글이 바뀔 때 (2자 미만이면 null) */
  onSelectionChange?: (sel: TextSelection | null) => void;
  /** 고른 곳 위에 띄우는 도구 (N35 선택 도구 · 보관함에 넣기 팝오버). top = 고른 첫 줄 위, bottom = 고른 끝 줄 아래 (상자 기준 px) */
  selectionTool?: (sel: TextSelection, at: { top: number; bottom: number; left: number }) => ReactNode;
};

export function HighlightTextarea({ value, onChange, marks, onPickMark, focusKey, boxClassName, textClassName, ref, onSelectionChange, selectionTool, ...rest }: Props) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    own.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
  };

  // 내용에 맞춰 높이를 늘린다 (스크롤이 생기면 거울과 줄이 어긋나므로)
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const el = own.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    mirror.current?.querySelector(`[data-mark="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusKey]);

  // 고른 글 (N35): textarea select 이벤트 + 거울과 같은 글꼴의 재는 div 로 자리 계산
  const [sel, setSel] = useState<{ v: string; s: TextSelection; at: { top: number; bottom: number; left: number } } | null>(null);
  const measure = useRef<HTMLDivElement>(null);
  const offsetOf = (idx: number) => {
    const m = measure.current;
    if (!m) return { top: 0, left: 0, h: 0 };
    m.textContent = value.slice(0, idx);
    const mark = document.createElement("span");
    mark.textContent = "​";
    m.appendChild(mark);
    const r = { top: mark.offsetTop, left: mark.offsetLeft, h: mark.offsetHeight };
    m.textContent = "";
    return r;
  };
  const readSel = () => {
    const el = own.current;
    if (!el) return;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const text = value.slice(a, b);
    if (b - a < 2 || !text.trim()) {
      if (sel) setSel(null);
      onSelectionChange?.(null);
      return;
    }
    const s0 = { start: a, end: b, text };
    if (sel && sel.v === value && sel.s.start === a && sel.s.end === b) return;
    const p = offsetOf(a);
    const q = offsetOf(b);
    const next = { v: value, s: s0, at: { top: p.top, bottom: q.top + q.h, left: p.left } };
    setSel(next);
    onSelectionChange?.(s0);
  };
  // 글이 바뀌면 고른 것은 풀린다
  const cur = sel && sel.v === value ? sel : null;

  const box = useRef<HTMLDivElement>(null);
  const pick = () => {
    if (selectionTool || onSelectionChange) readSel();
    const el = own.current;
    if (!el || !onPickMark || el.selectionStart !== el.selectionEnd) return;
    const at = el.selectionStart;
    const hit = marks.find((m) => m.key && at >= m.start && at <= m.end);
    if (hit?.key) onPickMark(hit.key);
  };

  const shared = cx("whitespace-pre-wrap break-keep [overflow-wrap:break-word]", textClassName);
  return (
    <div ref={box} className={cx("relative", boxClassName)}>
      <div ref={mirror} aria-hidden className={cx("pointer-events-none absolute inset-0 overflow-hidden text-ink", shared)}>
        {pieces(value, marks).map((p, i) =>
          p.mark ? (
            <span key={i} data-mark={p.mark.key}
              className={cx("underline decoration-2 underline-offset-[3px]", TONE[p.mark.tone], STYLE[p.mark.style ?? "solid"], p.mark.strong && p.mark.tone !== "guide" && "text-bad [-webkit-text-stroke:0.3px_currentColor]", p.mark.strong && p.mark.tone === "guide" && "bg-key-soft")}>{p.text}</span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        {/* 끝 줄바꿈도 높이를 차지하게 */}
        {"​"}
      </div>
      {selectionTool && <div ref={measure} aria-hidden className={cx("pointer-events-none invisible absolute inset-x-0 top-0", shared)} />}
      <textarea {...rest} ref={setRef} value={value} onChange={(e) => onChange(e.target.value)} onClick={pick}
        onSelect={selectionTool || onSelectionChange ? readSel : undefined}
        onKeyUp={selectionTool || onSelectionChange ? readSel : undefined}
        onBlur={selectionTool ? (e) => { if (!box.current?.contains(e.relatedTarget as Node | null)) setSel(null); } : undefined}
        className={cx("relative block w-full resize-none overflow-hidden bg-transparent text-transparent caret-ink outline-none placeholder:text-mute selection:bg-key/25", shared)} />
      {selectionTool && cur && selectionTool(cur.s, cur.at)}
    </div>
  );
}
