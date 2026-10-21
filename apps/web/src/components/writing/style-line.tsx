"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { emptyStyle, hasStyle, STYLE_AREAS, STYLE_LIMITS, type StyleArea, type WritingStyle } from "@/lib/domain/writing-style";
import { getMyStyle, saveMyStyle } from "@/app/(app)/style-actions";

// 내 스타일 (Figma N58): 글 칸 목표 · 오차 아래 줄 [내 스타일 ●] + [고치기 ›] → 창(영역 탭 · 내 프롬프트 · 레퍼런스 생기부 최대 3).
// 켬/끔은 영역마다 이 기기에 기억. 저장한 스타일이 없으면 꺼진 채 "학교 프롬프트로 써요".

const noSub = () => () => {};
const onKey = (a: StyleArea) => `schs-style-${a}`;

/** 내 스타일 상태: 저장된 스타일 · 켬 여부 · 창 열기 */
export function useMyStyle(area: StyleArea) {
  const [style, setStyle] = useState<WritingStyle | null>(null);
  useEffect(() => { let alive = true; getMyStyle(area).then((s) => alive && setStyle(s ?? emptyStyle(area))).catch(() => {}); return () => { alive = false; }; }, [area]);
  const stored = useSyncExternalStore(noSub, () => { try { return localStorage.getItem(onKey(area)); } catch { return null; } }, () => null);
  const [own, setOwn] = useState<boolean | null>(null);
  const saved = hasStyle(style);
  const on = saved && (own ?? stored !== "off");
  const setOn = (v: boolean) => { setOwn(v); try { localStorage.setItem(onKey(area), v ? "on" : "off"); } catch { /* 이번에만 */ } };
  return { style, setStyle, saved, on, setOn };
}

export function StyleLine({ area, s }: { area: StyleArea; s: ReturnType<typeof useMyStyle> }) {
  const [open, setOpen] = useState(false);
  const refs = s.style?.refs.length ?? 0;
  const what = [s.style?.prompt.trim() ? "내 프롬프트" : "", refs ? `레퍼런스 ${refs}개` : ""].filter(Boolean).join(" · ");
  return (
    <div className={cx("flex items-center gap-2 rounded-control px-3 py-1.5", s.on ? "bg-key-soft" : "bg-bg")}>
      <label className={cx("flex items-center gap-2 whitespace-nowrap text-[13px] font-bold", s.on ? "text-key-strong" : "text-sub", s.saved ? "cursor-pointer" : "cursor-not-allowed")}>
        내 스타일
        <input type="checkbox" role="switch" className="peer sr-only" checked={s.on} disabled={!s.saved} onChange={(e) => s.setOn(e.target.checked)} />
        <span aria-hidden className={cx("relative h-5 w-9 rounded-full transition-colors", s.on ? "bg-key" : "bg-faint")}>
          <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", s.on ? "left-[18px]" : "left-0.5")} />
        </span>
      </label>
      <span className={cx("min-w-0 flex-1 truncate text-[12px] font-medium", s.on ? "text-key-strong" : "text-mute")}>
        {s.on ? <><span className="md:hidden">{what}</span><span className="hidden md:inline">{what}로 비슷한 구조로 써요</span></> : "학교 프롬프트로 써요"}
      </span>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 whitespace-nowrap text-[13px] font-bold text-key-strong hover:underline">{s.saved ? "고치기 ›" : "만들기 ›"}</button>
      {open && <StyleDialog first={area} onClose={() => setOpen(false)} onSaved={(st) => { if (st.area === area) { s.setStyle(st); s.setOn(true); } }} />}
    </div>
  );
}

function StyleDialog({ first, onClose, onSaved }: { first: StyleArea; onClose: () => void; onSaved: (s: WritingStyle) => void }) {
  const [area, setArea] = useState<StyleArea>(first);
  const [cache, setCache] = useState<Partial<Record<StyleArea, WritingStyle>>>({});
  const [draft, setDraft] = useState<Partial<Record<StyleArea, { prompt: string; refs: string[] }>>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (cache[area]) return;
    let alive = true;
    getMyStyle(area).then((s) => alive && s && setCache((c) => ({ ...c, [area]: s })));
    return () => { alive = false; };
  }, [area, cache]);
  const cur = draft[area] ?? (cache[area] ? { prompt: cache[area]!.prompt, refs: cache[area]!.refs } : null);
  const edit = (patch: Partial<{ prompt: string; refs: string[] }>) => setDraft((d) => ({ ...d, [area]: { prompt: cur?.prompt ?? "", refs: cur?.refs ?? [], ...patch } }));
  const save = () => cur && start(async () => {
    setError("");
    const r = await saveMyStyle({ area, ...cur });
    if (!r.ok) return setError(r.error);
    setCache((c) => ({ ...c, [area]: r.style }));
    setDraft((d) => ({ ...d, [area]: undefined }));
    onSaved(r.style);
    onClose();
  });
  const refs = cur?.refs ?? [];
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="내 스타일">
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[640px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">내 스타일</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <div className="flex gap-1 rounded-inner bg-soft p-1">
          {STYLE_AREAS.map((a) => (
            <button key={a} type="button" onClick={() => { setError(""); setArea(a); }} aria-pressed={area === a}
              className={cx("h-[34px] flex-1 rounded-control text-[14px]", area === a ? "border border-line bg-[#fff] font-bold" : "font-medium text-mute")}>{a}</button>
          ))}
        </div>
        {!cur ? <p className="py-8 text-center text-[13px] text-mute">불러오는 중이에요</p> : (
          <>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold text-sub">
              <span className="flex">내 프롬프트<span className="ml-auto font-medium text-mute">{cur.prompt.length.toLocaleString("ko-KR")} / {STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자</span></span>
              <textarea value={cur.prompt} onChange={(e) => edit({ prompt: e.target.value })} maxLength={STYLE_LIMITS.prompt} rows={4}
                placeholder="예: 실험 과목은 가설 → 설계 → 오차 분석 순서로. 한 문장은 80자 안으로. '돋보임'은 한 번만."
                className="resize-y rounded-control bg-soft px-3 py-2.5 text-[14px] font-normal leading-6 text-ink outline-none focus:ring-2 focus:ring-key" />
            </label>
            <div className="flex flex-col gap-2">
              <span className="flex text-[13px] font-bold text-sub">레퍼런스 생기부<span className="ml-auto font-medium text-mute">{refs.length} / {STYLE_LIMITS.refs}개</span></span>
              {refs.map((r, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-control border border-line px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-chip bg-key-soft px-1.5 text-[11px] font-bold text-key-strong">예시 {i + 1}</span>
                    <span className="flex-1" />
                    <span className="text-[12px] font-medium tabular-nums text-mute">{neisBytes(r).toLocaleString("ko-KR")}B</span>
                    <button type="button" aria-label={`예시 ${i + 1} 빼기`} onClick={() => edit({ refs: refs.filter((_, k) => k !== i) })} className="text-faint hover:text-bad"><X size={14} /></button>
                  </div>
                  <textarea value={r} onChange={(e) => edit({ refs: refs.map((x, k) => (k === i ? e.target.value : x)) })} maxLength={STYLE_LIMITS.ref} rows={3}
                    placeholder="잘 썼다고 생각하는 생기부를 붙여 넣어요 (학생 이름 · 학번은 빼고)" className="resize-y bg-transparent text-[13px] leading-5 outline-none" />
                </div>
              ))}
              {refs.length < STYLE_LIMITS.refs && (
                <button type="button" onClick={() => edit({ refs: [...refs, ""] })} className="flex h-10 items-center justify-center gap-1 rounded-control border border-dashed border-faint text-[13px] font-bold text-key-strong hover:bg-key-soft">
                  <Plus size={14} /> 레퍼런스 붙여넣기
                </button>
              )}
            </div>
            <p className="rounded-control bg-bg px-3 py-2 text-[12px] leading-5 text-sub">구조 · 문장 길이 · 서술어만 본떠요. 레퍼런스 내용(활동 · 사실)은 가져오지 않아요 · 학생 이름 · 학번은 지우고 넣어요</p>
          </>
        )}
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending || !cur} onClick={save}>{pending ? "저장 중…" : "저장"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
