"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";
import { NEWS, hideUntil, newsKey, showNews, turnPage, type NewsSlide } from "@/lib/domain/news";

// 신기능 안내 창 (N75 · N76 a PC 가운데 480 · b 모바일 바닥 시트): 그림 · NEW + 영역 · 제목 두 줄 · 세 단계 · 장 넘기기(점 · PC는 ‹ › · 모바일은 밀기)
// · [버튼] · 일주일 동안 보지 않기 | 닫기. 숨김 기록은 이 브라우저에만 (localStorage = 일주일, sessionStorage = 이번 접속). 저장소가 막혀 있으면 그냥 띄운다.

const BARS = [8, 14, 20, 12, 18, 24, 10, 16, 22, 12, 8, 18, 14, 20, 10, 6, 12, 16, 8, 14];
const NEIS_ROWS = [
  ["학생A", "빗면 실험에서 기울기와 속력의 관계를 측정값으로 설명함"],
  ["학생B", "모둠 토론에서 반론의 근거를 자료로 짚어 냄"],
  ["학생C", "탐구 보고서의 오차 원인을 두 가지로 정리함"],
];

const read = (s: () => Storage, k: string) => { try { return s().getItem(k); } catch { return null; } };
const write = (s: () => Storage, k: string, v: string) => { try { s().setItem(k, v); } catch { /* 저장소가 막힌 브라우저 — 이번만 닫힌다 */ } };

function Art({ kind }: { kind: NewsSlide["art"] }) {
  if (kind === "neis") return (
    <>
      <div className="flex items-center gap-2 rounded-[10px] bg-[#fff] px-3 py-2">
        {["bg-bad/50", "bg-[#FFC342]/50", "bg-ok/50"].map((c) => <span key={c} className={cx("size-2 rounded-full", c)} />)}
        <span className="rounded-[6px] bg-key px-2.5 py-1 text-[12px] font-bold text-[#fff]">★ 나이스 입력</span>
        <span className="text-[12px] font-medium text-mute">북마크바</span>
      </div>
      <div className="flex flex-col rounded-[10px] bg-[#fff] px-3.5 pb-2.5 pt-2">
        <p className="flex gap-2.5 py-1.5 text-[12px] font-bold text-mute"><span className="w-11 shrink-0">이름</span><span className="font-normal">특기사항</span></p>
        {NEIS_ROWS.map(([n, t], i) => (
          <p key={n} className={cx("items-center gap-2.5 border-t border-soft py-1.5 text-[12px]", i === 2 ? "hidden md:flex" : "flex")}>
            <span className="w-11 shrink-0 font-medium">{n}</span><span className="min-w-0 flex-1 truncate text-sub">{t}</span><span className="font-bold text-ok">✓</span>
          </p>
        ))}
        <p className="self-start rounded-[6px] bg-ok-soft px-2.5 py-1.5 text-[12px] font-bold text-[#007A47]">✓ 24명 채움 · 저장은 선생님이 직접</p>
      </div>
    </>
  );
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-[10px] bg-[#fff] px-3.5 py-3">
        <span className="size-2.5 shrink-0 rounded-full bg-bad" />
        <span className="whitespace-nowrap text-[13px] font-bold">녹음 중 00:42</span>
        <span className="flex h-6 min-w-0 flex-1 items-center gap-[3px] overflow-hidden">
          {BARS.map((h, i) => <span key={i} className="w-[3px] shrink-0 rounded-[2px] bg-key/75" style={{ height: h }} />)}
        </span>
        <span className="whitespace-nowrap rounded-[6px] bg-soft px-2.5 py-1 text-[12px] font-bold text-sub">멈추기</span>
      </div>
      <div className="flex flex-col gap-2 rounded-[10px] bg-[#fff] px-3.5 py-3">
        <p className="text-[13px] leading-5 text-sub">빗면의 기울기가 커질수록 수레의 속력이 빨라지는 것을 측정값으로 확인했습니다.</p>
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-mute">
          <span className="rounded-[6px] bg-new-soft px-1.5 py-px text-[11px] font-bold text-new">AI</span> 오타 고치기 · 3곳 고침
        </p>
      </div>
    </>
  );
}

export function NewsPopup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(false);
  const [page, setPage] = useState(0);
  const touch = useRef<number | null>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  const news = NEWS;
  const count = news?.slides.length ?? 0;

  useEffect(() => {
    if (!news) return;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const until = read(() => localStorage, newsKey(news.id));
    if (read(() => sessionStorage, newsKey(news.id))) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 그린 뒤에만 읽을 수 있다
    if (showNews(news, today, until == null ? null : Number(until), Date.now())) setOpen(true);
  }, [news]);

  useEffect(() => { if (open) cta.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") setPage((p) => turnPage(p, -1, count));
      else if (e.key === "ArrowRight") setPage((p) => turnPage(p, 1, count));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (!open || !news) return null;
  const slide = news.slides[page];

  function close(forWeek = week) {
    if (!news) return;
    write(() => sessionStorage, newsKey(news.id), "1");
    if (forWeek) write(() => localStorage, newsKey(news.id), String(hideUntil(Date.now())));
    setOpen(false);
  }
  const go = (by: number) => setPage((p) => turnPage(p, by, count));
  const arrow = "hidden size-8 items-center justify-center rounded-control bg-soft text-sub disabled:text-faint md:flex";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(25,31,40,0.45)] md:items-center md:p-6" onClick={() => close()}>
      <div role="dialog" aria-modal="true" aria-roledescription="안내 넘기기" aria-label={`새 기능 · ${slide.title.join(" ")}`} onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const x = touch.current; touch.current = null; if (x == null) return; const dx = e.changedTouches[0].clientX - x; if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1); }}
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-[16px] bg-[#fff] md:max-w-[480px] md:rounded-[12px]">
        <div className="flex flex-col gap-2.5 bg-key-soft px-5 pb-5 pt-3 md:px-7 md:pb-6 md:pt-7" aria-hidden>
          <span className="mb-2 h-1 w-10 self-center rounded-[2px] bg-[#C9CEF7] md:hidden" />
          <Art kind={slide.art} />
        </div>

        <div className="flex flex-col gap-2.5 px-5 pt-[22px] md:px-7 md:pt-6" aria-live="polite">
          <p className="flex items-center gap-1.5">
            <span className="rounded-[6px] bg-new-soft px-[7px] py-0.5 text-[11px] font-bold text-new">NEW</span>
            <span className="text-[13px] font-bold text-key-strong">{slide.area}</span>
          </p>
          <h2 className="text-[22px] font-bold leading-[1.4] md:text-[24px]">{slide.title[0]}<br />{slide.title[1]}</h2>
          <ol className="flex flex-wrap items-center gap-1.5 pt-1.5">
            {slide.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[12px] text-mute" aria-hidden>→</span>}
                <span className="whitespace-nowrap rounded-[6px] bg-soft px-2 py-1 text-[12px] font-medium text-sub"><b className="text-key-strong">{i + 1}</b> {s}</span>
              </li>
            ))}
          </ol>
          {slide.mobileNote && <p className="text-[12px] font-medium text-mute md:hidden">{slide.mobileNote}</p>}
        </div>

        {count > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4 md:pt-5">
            <button type="button" onClick={() => go(-1)} disabled={page === 0} aria-label="이전 안내" className={arrow}><ChevronLeft size={16} /></button>
            {news.slides.map((s, i) => (
              <button key={s.area} type="button" onClick={() => setPage(i)} aria-label={`${i + 1}번째 안내 · ${s.area}`} aria-current={i === page}
                className="flex h-6 items-center px-0.5">
                <span className={cx("h-1.5 rounded-[3px]", i === page ? "w-[18px] bg-key" : "w-1.5 bg-[#D1D6DB]")} />
              </button>
            ))}
            <button type="button" onClick={() => go(1)} disabled={page === count - 1} aria-label="다음 안내" className={arrow}><ChevronRight size={16} /></button>
          </div>
        )}

        <div className="px-5 pt-3.5 md:px-7 md:pt-4">
          <a ref={cta} href={slide.cta.href} onClick={(e) => { e.preventDefault(); close(true); router.push(slide.cta.href); }}
            className="flex h-[52px] items-center justify-center rounded-control bg-key text-[16px] font-bold text-[#fff] md:h-12 md:text-[15px]">{slide.cta.label}</a>
        </div>

        <div className="flex items-center justify-between px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-1.5 md:px-7 md:pb-[18px]">
          <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-mute">
            <input type="checkbox" checked={week} onChange={(e) => setWeek(e.target.checked)} className="size-4 accent-[#536DFE]" />
            일주일 동안 보지 않기
          </label>
          <button type="button" onClick={() => close()} className="min-h-11 px-1 text-[13px] font-bold text-sub">닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
