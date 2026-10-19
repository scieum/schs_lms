"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Book, ChevronLeft, ChevronRight, Link2, Search, X } from "lucide-react";
import { cx } from "@/components/ui";
import {
  askOf, GUIDE, GUIDE_FAQ, GUIDE_URL, guideEntry, nearGuide, searchGuide, sectionEntries, sectionOrder, sectionPages,
  type GuideArea, type GuideEntry, type GuideSection, type GuideSentence,
} from "@/lib/domain/guide-bank";
import { askGuideAi } from "@/app/(app)/teacher/guide-actions";
import { GuideAnswerCard } from "./guide-answer-card";
import { findInTarget, guideStore, useGuide, useHasGuideTarget } from "./guide-store";

// 기재요령 찾아보기 패널 (Figma N43 (a)·(b)·(c)): 앱 셸에 하나. 편집기 머리 "기재요령" 버튼 · N34 기재요령 칩이 연다.
// PC 1280 이상은 오른쪽 400 패널이 본문을 밀어낸다(html[data-guide=open] → 셸 오른쪽 여백), 그보다 좁으면 덮는 패널(배경 dim 없음),
// 모바일은 위 48을 남긴 바텀시트. 답은 인용 모음 원문만 — 없으면 지어내지 않는다. AI 정리는 덧붙이는 것(원문 2개 이상일 때만).

const KEY = "schs-guide-q";
const readLast = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const writeLast = (q: string) => { try { if (q) sessionStorage.setItem(KEY, q); else sessionStorage.removeItem(KEY); } catch { /* 저장 못 해도 괜찮다 */ } };
const isMobile = () => typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;

type Ai = { key: string; state: "loading" | "done" | "none"; sentences: GuideSentence[] };

export function GuidePanel() {
  const g = useGuide();
  // 패널이 닫혀 있어도 html 표시는 지운다
  useEffect(() => {
    const el = document.documentElement;
    if (g.open) el.dataset.guide = "open";
    else delete el.dataset.guide;
    return () => { delete el.dataset.guide; };
  }, [g.open]);
  if (!g.open) return null;
  return <PanelBody key={g.seq} focusId={g.focusId} area={g.area} />;
}

function PanelBody({ focusId, area }: { focusId: string | null; area: GuideArea | null }) {
  const focus = focusId ? guideEntry(focusId) ?? null : null;
  const [q, setQ] = useState(() => (focus ? "" : readLast()));
  const [asked, setAsked] = useState<string>(() => (focus ? "" : readLast()));
  const [section, setSection] = useState<GuideSection | null>(null);
  const [ai, setAi] = useState<Ai | null>(null);
  const [toast, setToast] = useState("");
  const [lit, setLit] = useState<string | null>(focus?.id ?? null);
  const hasTarget = useHasGuideTarget();
  const cards = useRef(new Map<string, HTMLElement>());
  const input = useRef<HTMLInputElement>(null);
  const close = () => guideStore.close();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") guideStore.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo(() => (asked ? searchGuide(asked, area) : []), [asked, area]);
  const results: GuideEntry[] = focus && !asked ? [focus] : hits.map((h) => h.entry);
  const near = useMemo(() => (asked && !hits.length ? nearGuide(asked, area) : []), [asked, hits.length, area]);
  const ids = results.map((e) => e.id).join(",");

  // AI 정리: 원문 2개 이상 · 질문으로 찾았을 때만, 결과가 뜬 뒤 따로
  const aiKey = asked && results.length >= 2 ? `${asked}|${ids}` : "";
  useEffect(() => {
    if (!aiKey) return;
    let alive = true;
    const list = ids.split(",");
    Promise.resolve().then(() => { if (alive) setAi({ key: aiKey, state: "loading", sentences: [] }); });
    askGuideAi({ q: asked, ids: list })
      .then((r) => { if (alive) setAi({ key: aiKey, state: r?.sentences.length ? "done" : "none", sentences: r?.sentences ?? [] }); })
      .catch(() => { if (alive) setAi({ key: aiKey, state: "none", sentences: [] }); });
    return () => { alive = false; };
  }, [aiKey, asked, ids]);
  const aiNow = ai && ai.key === aiKey ? ai : null;

  const ask = (text: string) => {
    const t = text.trim();
    setQ(t);
    setAsked(t);
    setSection(null);
    setLit(null);
    writeLast(t);
  };
  const clear = () => { setQ(""); setAsked(""); writeLast(""); input.current?.focus(); };
  const goCard = (id: string) => {
    setLit(id);
    const el = cards.current.get(id);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  const find = (e: GuideEntry) => {
    const n = findInTarget(e.id);
    if (!n) { setToast("이 글에는 없어요"); window.setTimeout(() => setToast(""), 2500); return; }
    if (isMobile()) close();
  };

  const n = (id: string) => (results.length > 1 ? results.findIndex((e) => e.id === id) + 1 : undefined);
  const banned = results.filter((e) => e.verdict === "불가").length;
  const chipCls = (on: boolean) => cx("inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-[13px]",
    on ? "bg-key-soft font-bold text-key-strong" : "bg-soft font-medium text-sub hover:bg-[#E9ECF0]");
  const showing = !!asked || !!focus;

  const faq = (
    <div className={cx("flex gap-2", showing ? "-mx-5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0" : "flex-wrap")}>
      {GUIDE_FAQ.map((f) => (
        <button key={f.q} type="button" aria-pressed={asked === f.q} onClick={() => ask(f.q)} className={chipCls(asked === f.q)}>{f.q}</button>
      ))}
    </div>
  );

  const body = !showing ? (
    section ? (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setSection(null)} className="inline-flex items-center gap-0.5 self-start text-[13px] font-medium text-sub">
          <ChevronLeft size={14} /> 항목별로 보기
        </button>
        <h3 className="text-[15px] font-bold">{sectionOrder(area).find((s) => s.section === section)?.label} <span className="text-[12px] font-normal text-mute">{sectionPages(section)}</span></h3>
        {sectionEntries(section).map((e) => (
          <GuideAnswerCard key={e.id} entry={e} onFind={hasTarget ? () => find(e) : undefined} />
        ))}
      </div>
    ) : (
      <>
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[13px] font-bold text-sub">자주 묻는 질문</h3>
          {faq}
        </div>
        <hr className="border-soft" />
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[13px] font-bold text-sub">항목별로 보기</h3>
          <ul className="overflow-hidden rounded-inner border border-line">
            {sectionOrder(area).map((s) => (
              <li key={s.section} className="border-t border-line first:border-0">
                <button type="button" onClick={() => setSection(s.section)} className="flex w-full items-center gap-2 px-3.5 py-3 text-left hover:bg-bg">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{s.label}</span>
                  {s.section === "작성 시 유의사항" && <span className="shrink-0 text-[12px] text-mute">{sectionPages(s.section)}</span>}
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  ) : (
    <>
      {asked && faq}
      {results.length ? (
        <>
          <p className="text-[13px]">
            <span className="font-bold">원문 {results.length}개</span>
            {banned > 0 && <span className="text-mute"> · 쓸 수 없음 {banned}</span>}
          </p>
          {aiNow && aiNow.state !== "none" && (
            <section className="flex flex-col gap-2 rounded-inner bg-bg px-4 py-3.5" aria-label="AI 정리" aria-busy={aiNow.state === "loading"}>
              <div className="flex items-center gap-1.5">
                <span className="rounded-[4px] bg-new-soft px-1.5 py-px text-[11px] font-bold text-new">AI</span>
                <span className="text-[14px] font-bold">AI 정리</span>
                <span className="ml-auto text-[12px] text-mute md:hidden">원문 {results.length}개만 봄</span>
              </div>
              {aiNow.state === "loading" ? (
                <div className="flex flex-col gap-2 py-1" role="status" aria-label="정리하는 중">
                  <span className="h-3 w-full animate-pulse rounded bg-line" />
                  <span className="h-3 w-3/4 animate-pulse rounded bg-line" />
                </div>
              ) : (
                <p className="break-keep text-[14px] leading-[22px]">
                  {aiNow.sentences.map((s, i) => (
                    <span key={i}>
                      {s.text.replace(/[.。]$/, "")}{" "}
                      {s.cites.map((c) => {
                        const k = n(c);
                        return k ? <button key={c} type="button" onClick={() => goCard(c)} className="text-[12px] font-bold text-key-strong hover:underline">[{k}]</button> : null;
                      })}
                      {". "}
                    </span>
                  ))}
                </p>
              )}
              <p className="hidden text-[12px] text-mute md:block">아래 원문 {results.length}개만 보고 썼어요 · 판단은 원문으로 확인해요</p>
            </section>
          )}
          {results.map((e) => (
            <GuideAnswerCard key={e.id} entry={e} n={n(e.id)} highlight={lit === e.id}
              ref={(el) => { if (el) cards.current.set(e.id, el); else cards.current.delete(e.id); }}
              onFind={hasTarget ? () => find(e) : undefined} />
          ))}
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1 rounded-inner border border-dashed border-hair px-4 py-6 text-center [border-style:dashed]">
            <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-soft text-mute"><Search size={18} /></span>
            <p className="text-[15px] font-bold">기재요령에서 찾지 못했어요</p>
            <p className="text-[13px] text-sub">학교 담당 선생님께 확인해 주세요</p>
            <p className="text-[12px] text-mute">AI도 원문에 없는 규칙은 만들지 않아요</p>
          </div>
          {near.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[13px] font-bold text-sub">비슷한 주제</h3>
              <div className="flex flex-wrap gap-2">
                {near.map((e) => <button key={e.id} type="button" onClick={() => ask(askOf(e))} className={chipCls(false)}>{askOf(e)}</button>)}
              </div>
            </div>
          )}
          <a href={GUIDE_URL} target="_blank" rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-control border border-hair bg-[#fff] text-[14px] font-bold text-ink hover:bg-soft md:h-10 md:text-[13px]">
            <Link2 size={14} aria-hidden /> 원문 PDF에서 직접 찾기
          </a>
        </>
      )}
    </>
  );

  const content = (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Book size={20} className="shrink-0 text-key" aria-hidden />
          <h2 className="min-w-0 flex-1 text-[17px] font-bold">기재요령 찾아보기</h2>
          <button type="button" onClick={close} aria-label="기재요령 닫기" className="flex size-8 items-center justify-center text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <span className="self-start rounded-[6px] bg-soft px-2 py-0.5 text-[12px] font-medium text-sub">{GUIDE.title}</span>
      </div>
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q); }}
        className={cx("relative flex h-12 items-center gap-2 rounded-control px-3 md:h-11", q ? "bg-[#fff] outline outline-2 -outline-offset-2 outline-key" : "bg-soft")}>
        <Search size={18} className={cx("shrink-0", q ? "text-key-strong" : "text-mute")} aria-hidden />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" maxLength={100} aria-label="기재요령에 물어보기"
          style={{ outline: "none" }} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none md:text-[14px]" />
        {!q && (
          <span aria-hidden className="pointer-events-none absolute left-[38px] right-3 truncate text-[15px] text-mute md:text-[14px]">
            궁금한 것을 물어보세요<span className="hidden md:inline"> · 예: 부모 직업</span>
          </span>
        )}
        {q && <button type="button" onClick={clear} aria-label="질문 지우기" className="flex size-7 shrink-0 items-center justify-center text-mute"><X size={16} /></button>}
      </form>
      {body}
      {toast && <p className="rounded-control bg-navy px-3 py-2 text-[13px] font-medium text-white" role="status">{toast}</p>}
      <p className={cx("mt-auto pt-4 text-[12px] text-mute", showing && results.length > 2 && "hidden")}>
        <span className="md:hidden">답은 기재요령 원문 글만 보여줘요</span>
        <span className="hidden md:inline">답은 기재요령 원문 글만 보여줘요 · 원문에 없으면 지어내지 않아요</span>
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:inset-auto md:bottom-0 md:right-0 md:top-0 md:block md:bg-transparent"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside role="dialog" aria-label="기재요령 찾아보기" aria-modal={false}
        className="h-[calc(100dvh-48px)] w-full overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2 md:h-dvh md:w-[400px] md:rounded-none md:border-l md:border-line md:px-6 md:pb-6 md:pt-7 md:shadow-[-8px_0_24px_rgba(28,32,51,0.06)] xl:shadow-none">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-hair md:hidden" />
        {content}
      </aside>
    </div>
  );
}

/** 편집기 머리 "기재요령" 버튼 (N43): 흰 · 1px 선 · 열려 있으면 인디고 */
export function GuideBookButton({ area, className }: { area: GuideArea; className?: string }) {
  const g = useGuide();
  const on = g.open;
  return (
    <button type="button" aria-pressed={on} onClick={() => (on ? guideStore.close() : guideStore.open({ area }))}
      className={cx("inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-2.5 text-[13px] md:h-[30px]",
        on ? "border-key-soft bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub hover:bg-soft", className)}>
      <Book size={14} aria-hidden /> 기재요령
    </button>
  );
}
