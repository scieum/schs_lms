"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "@/components/ui";
import { sharedSpans, sourceKey, type SentenceSource, type SourceItem, type SourceRef } from "@/lib/domain/provenance";
import { splitByRanges } from "@/lib/domain/diff";
import { kindLabel, SourcePicker } from "./source-picker";

// 근거 보기 (Figma N38 (a) 470:8713 · 472:14889): 읽기 전용 문장 행 목록 — 고치려면 [쓰기]로.
// 문장마다 오른쪽 근거 칩(넓은 단 190 고정 폭) / 좁은 단은 문장 아래 칩 줄. 가리킨(hover · focus) / 누른 행은 #EEF0FF.
// 넓은 단: 가리킨 행 아래 근거 팝오버(380, 본문 칸 오른쪽 끝) — 팝오버 위에 있으면 유지, Esc로 닫힘.
// 좁은 단(@container < 512): 누르면 근거 바텀시트.

/** N38 근거 칩 (469:21407): 설문 · 조각 · 누가기록 · 파일 = 흰 외곽선, 직접 = 회색, 근거 없음 = 노랑 */
export function ProvChip({ item, own, none }: { item?: SourceItem; own?: boolean; none?: boolean }) {
  const base = "inline-flex h-[22px] max-w-full items-center truncate whitespace-nowrap rounded-chip px-1.5 text-[11px] font-medium";
  if (own) return <span className={cx(base, "bg-soft text-sub")}>직접</span>;
  if (none || !item) return <span className={cx(base, "bg-wait-soft text-[#9A6400]")}>근거 없음</span>;
  return <span className={cx(base, "border border-line bg-[#fff] text-sub")}>{item.chip}</span>;
}

/** N38 근거 카드 (469:21439): 종류 · 어디 ↔ 열기 / 인용(문장과 겹친 말 굵게). "열기"는 같은 자리에서 인용 전체를 펼친다 */
export function SourceCard({ item, sentence }: { item: SourceItem; sentence: string }) {
  const [full, setFull] = useState(false);
  const long = item.text.length > 90;
  return (
    <div className="flex flex-col gap-1 rounded-control bg-bg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <b className="shrink-0 whitespace-nowrap text-[12px] text-key-strong">{kindLabel(item)}</b>
        <span className="min-w-0 flex-1 truncate text-[12px] text-mute">{item.where}</span>
        {long && <button type="button" onClick={() => setFull(!full)} className="shrink-0 text-[12px] font-medium text-sub">{full ? "접기" : "열기"}</button>}
      </div>
      <p className={cx("break-keep text-[13px] leading-5", !full && "line-clamp-3")}>
        “{splitByRanges(item.text, sharedSpans(item.text, sentence)).map((p, i) => (p.on ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}”
      </p>
    </div>
  );
}

type Row = SentenceSource & { text: string; items: SourceItem[] };

export function SentenceSources({ text, list, pool, who, onLink }: {
  text: string;
  /** 지금 글 기준 문장 근거 (alignSentences) */
  list: SentenceSource[];
  pool: Map<string, SourceItem>;
  /** "학생A" — 근거 고르기 목록 머리 */
  who: string;
  /** 근거로 잇기 (교사가 정함) */
  onLink: (sentence: string, refs: SourceRef[]) => void;
}) {
  const rows: Row[] = list.map((s) => ({ ...s, text: text.slice(s.start, s.end), items: s.sources.map((r) => pool.get(sourceKey(r))).filter((x): x is SourceItem => !!x) }));
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 512));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [active, setActive] = useState<number | null>(null);
  const [sheet, setSheet] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const hold = () => { if (timer.current) window.clearTimeout(timer.current); };
  const leave = () => { hold(); timer.current = window.setTimeout(() => setActive(null), 160); };
  useEffect(() => () => hold(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setActive(null); setSheet(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const popId = useId();
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [popTop, setPopTop] = useState(0);
  useLayoutEffect(() => {
    if (active == null || narrow) return;
    const r = rowRefs.current[active];
    if (r) setPopTop(r.offsetTop + r.offsetHeight + 4);
  }, [active, narrow]);

  const withSrc = rows.filter((r) => r.items.length).length;
  const own = rows.filter((r) => r.own).length;
  const none = rows.filter((r) => !r.own && !r.items.length).length;
  const pick = (i: number) => { setActive(null); setSheet(null); setPicking(i); };
  const cur = active != null ? rows[active] : null;
  const sheetRow = sheet != null ? rows[sheet] : null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="relative" onMouseLeave={narrow ? undefined : leave}>
        <ol className="flex flex-col gap-0.5 rounded-inner border border-line bg-[#fff] p-2">
          {rows.map((r, i) => {
            const on = active === i || sheet === i;
            return (
              <li key={`${r.start}-${r.end}`} ref={(el) => { rowRefs.current[i] = el; }}>
                <div
                  tabIndex={0}
                  role={narrow ? "button" : undefined}
                  aria-describedby={!narrow && active === i ? popId : undefined}
                  onMouseEnter={narrow ? undefined : () => { hold(); setActive(i); }}
                  onFocus={narrow ? undefined : () => setActive(i)}
                  onClick={narrow ? () => setSheet(i) : () => setActive(i)}
                  onKeyDown={(e) => { if (narrow && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSheet(i); } }}
                  className={cx("flex cursor-default gap-2.5 rounded-control px-2.5 py-2 outline-none", on ? "bg-key-soft" : "hover:bg-bg", narrow ? "flex-col gap-1.5" : "items-start")}
                >
                  <span className="flex min-w-0 flex-1 gap-2.5">
                    <span className={cx("w-3 shrink-0 pt-px text-[12px] font-medium tabular-nums", on ? "text-key-strong" : "text-mute")}>{i + 1}</span>
                    <span className={cx("min-w-0 flex-1 break-keep text-[14px] leading-[22px]", !r.own && !r.items.length && "underline decoration-wait decoration-dotted decoration-2 underline-offset-[3px]")}>{r.text}</span>
                  </span>
                  <span className={cx("flex flex-wrap gap-1", narrow ? "pl-[22px]" : "w-[190px] shrink-0 justify-end")}>
                    {r.own ? <ProvChip own /> : r.items.length ? r.items.map((it) => <ProvChip key={it.key} item={it} />) : <ProvChip none />}
                  </span>
                </div>
                {picking === i && (
                  <div className="px-1 pb-1 pt-1.5">
                    <SourcePicker sentence={r.text} pool={[...pool.values()]} who={who} onCancel={() => setPicking(null)} onLink={(refs) => { onLink(r.text, refs); setPicking(null); }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!narrow && cur && picking == null && (
          <div id={popId} role="tooltip" onMouseEnter={hold} onMouseLeave={leave}
            style={{ top: popTop }}
            className="absolute right-0 z-20 flex w-[380px] max-w-full flex-col gap-2.5 rounded-card border border-line bg-[#fff] p-3.5 shadow-[0_8px_24px_rgba(28,32,51,0.12)]">
            <SourcesBody row={cur} index={active!} onClose={() => setActive(null)} onPick={() => pick(active!)} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mute">
        <span className="min-w-0 flex-1">문장 {rows.length} · 근거 있음 {withSrc} · 직접 씀 {own} · 근거 없음 {none}</span>
        <span>{narrow ? "문장을 누르면 근거가 보여요" : "문장에 마우스를 올리면 근거가 보여요"}</span>
      </div>
      {narrow && sheetRow && (
        <Sheet onClose={() => setSheet(null)}>
          <SourcesBody row={sheetRow} index={sheet!} sheet onClose={() => setSheet(null)} onPick={() => pick(sheet!)} />
        </Sheet>
      )}
    </div>
  );
}

/** 팝오버 · 시트 공용 내용: "n번 문장의 근거 k" ↔ ✕ → (시트는 문장 블록) → 근거 카드 → 바닥 줄 */
function SourcesBody({ row, index, sheet = false, onClose, onPick }: { row: Row; index: number; sheet?: boolean; onClose: () => void; onPick: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className={cx("min-w-0 flex-1 font-bold", sheet ? "text-[17px]" : "text-[14px]")}>
          {index + 1}번 문장의 근거 {row.own ? "" : <span className="text-key-strong">{row.items.length}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="닫기" className="flex size-7 shrink-0 items-center justify-center text-mute"><X size={sheet ? 20 : 16} /></button>
      </div>
      {sheet && <p className="break-keep rounded-control bg-key-soft px-3 py-2.5 text-[14px] leading-[22px]">{row.text}</p>}
      {row.own ? (
        <p className="text-[13px] text-sub">선생님이 쓴 문장이에요 · 경고하지 않아요</p>
      ) : row.items.length ? (
        <div className="flex flex-col gap-2">{row.items.map((it) => <SourceCard key={it.key} item={it} sentence={row.text} />)}</div>
      ) : (
        <p className="rounded-control bg-wait-soft px-3 py-2.5 text-[13px] text-[#9A6400]">이어진 근거가 없어요 · 학생이 실제로 한 일인지 확인해 주세요</p>
      )}
      {sheet ? (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onPick} className="h-11 flex-1 rounded-control border border-hair bg-[#fff] text-[15px] font-medium">근거 고르기</button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-control bg-key text-[15px] font-bold text-white">확인</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="min-w-0 flex-1 text-mute">{row.own ? "직접 쓴 문장도 근거를 이을 수 있어요" : "AI가 이 문장을 쓸 때 본 자료예요"}</span>
          <button type="button" onClick={onPick} className="shrink-0 font-medium text-key-strong">근거 고르기</button>
        </div>
      )}
    </>
  );
}

/** 모바일 바텀시트: 꽉 찬 폭 · 위 r16 · 손잡이 36×4 · 뒤 네이비 50% 딤 */
export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-navy/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
        {children}
      </div>
    </div>
  );
}
