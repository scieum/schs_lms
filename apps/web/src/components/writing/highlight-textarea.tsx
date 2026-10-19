"use client";
import { useEffect, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

// 본문 밑줄 (Figma N34 ①·③·④): textarea 뒤에 같은 글꼴·여백·줄바꿈 규칙의 거울 div 를 두고, 걸린 자리를 밑줄로 그린다.
// 글자는 거울이 그리고(textarea 글자는 투명, 커서·선택만 보임) — 펼친 행의 걸린 말은 빨간 글자로.
// 밑줄 자리를 누르면(커서가 그 안이면) onPickMark(key) — 검사 행을 연다. 높이는 내용에 맞춰 늘어난다(스크롤 없음).

export type Mark = { start: number; end: number; tone: "block" | "warn" | "similar"; key?: string; strong?: boolean };

const TONE: Record<Mark["tone"], string> = { block: "decoration-bad", warn: "decoration-wait", similar: "decoration-wait" };

/** 겹치지 않게 앞에서부터 고른 조각 */
function pieces(text: string, marks: Mark[]): { text: string; mark?: Mark }[] {
  const out: { text: string; mark?: Mark }[] = [];
  let at = 0;
  for (const m of [...marks].filter((x) => x.end > x.start && x.end <= text.length).sort((a, b) => a.start - b.start || Number(b.strong ?? 0) - Number(a.strong ?? 0))) {
    if (m.start < at) continue;
    if (m.start > at) out.push({ text: text.slice(at, m.start) });
    out.push({ text: text.slice(m.start, m.end), mark: m });
    at = m.end;
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
};

export function HighlightTextarea({ value, onChange, marks, onPickMark, focusKey, boxClassName, textClassName, ref, ...rest }: Props) {
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

  const pick = () => {
    const el = own.current;
    if (!el || !onPickMark || el.selectionStart !== el.selectionEnd) return;
    const at = el.selectionStart;
    const hit = marks.find((m) => m.key && at >= m.start && at <= m.end);
    if (hit?.key) onPickMark(hit.key);
  };

  const shared = cx("whitespace-pre-wrap break-keep [overflow-wrap:break-word]", textClassName);
  return (
    <div className={cx("relative", boxClassName)}>
      <div ref={mirror} aria-hidden className={cx("pointer-events-none absolute inset-0 overflow-hidden text-ink", shared)}>
        {pieces(value, marks).map((p, i) =>
          p.mark ? (
            <span key={i} data-mark={p.mark.key}
              className={cx("underline decoration-2 underline-offset-[3px]", TONE[p.mark.tone], p.mark.strong && "text-bad [-webkit-text-stroke:0.3px_currentColor]")}>{p.text}</span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        {/* 끝 줄바꿈도 높이를 차지하게 */}
        {"​"}
      </div>
      <textarea {...rest} ref={setRef} value={value} onChange={(e) => onChange(e.target.value)} onClick={pick}
        className={cx("relative block w-full resize-none overflow-hidden bg-transparent text-transparent caret-ink outline-none placeholder:text-mute selection:bg-key/25", shared)} />
    </div>
  );
}
