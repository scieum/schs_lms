"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { NEWS, hideUntil, newsKey, showNews } from "@/lib/domain/news";

// 신기능 안내 창 (N75 a PC 가운데 480 · b 모바일 바닥 시트): 그림(녹음 줄 + 받아쓴 글) · NEW · 제목 두 줄 · 세 단계 · [써 보기] · 일주일 동안 보지 않기 | 닫기.
// 숨김 기록은 이 브라우저에만 (localStorage = 일주일, sessionStorage = 이번 접속). 저장소가 막혀 있으면 그냥 띄운다.

const BARS = [8, 14, 20, 12, 18, 24, 10, 16, 22, 12, 8, 18, 14, 20, 10, 6, 12, 16, 8, 14];

const read = (s: () => Storage, k: string) => { try { return s().getItem(k); } catch { return null; } };
const write = (s: () => Storage, k: string, v: string) => { try { s().setItem(k, v); } catch { /* 저장소가 막힌 브라우저 — 이번만 닫힌다 */ } };

export function NewsPopup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(false);
  const cta = useRef<HTMLAnchorElement>(null);
  const news = NEWS;

  useEffect(() => {
    if (!news) return;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const until = read(() => localStorage, newsKey(news.id));
    const now = Date.now();
    if (read(() => sessionStorage, newsKey(news.id))) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 그린 뒤에만 읽을 수 있다
    if (showNews(news, today, until == null ? null : Number(until), now)) setOpen(true);
  }, [news]);

  useEffect(() => {
    if (!open) return;
    cta.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  if (!open || !news) return null;

  function close(forWeek = week) {
    if (!news) return;
    write(() => sessionStorage, newsKey(news.id), "1");
    if (forWeek) write(() => localStorage, newsKey(news.id), String(hideUntil(Date.now())));
    setOpen(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(25,31,40,0.45)] md:items-center md:p-6" onClick={() => close()}>
      <div role="dialog" aria-modal="true" aria-label={`새 기능 · ${news.title.join(" ")}`} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-[16px] bg-[#fff] md:max-w-[480px] md:rounded-[12px]">
        <div className="flex flex-col gap-2.5 bg-key-soft px-5 pb-5 pt-3 md:px-7 md:pb-6 md:pt-7" aria-hidden>
          <span className="mb-2 h-1 w-10 self-center rounded-[2px] bg-[#C9CEF7] md:hidden" />
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
        </div>

        <div className="flex flex-col gap-2.5 px-5 pt-[22px] md:px-7 md:pt-6">
          <p className="flex items-center gap-1.5">
            <span className="rounded-[6px] bg-new-soft px-[7px] py-0.5 text-[11px] font-bold text-new">NEW</span>
            <span className="text-[13px] font-bold text-key-strong">{news.area}</span>
          </p>
          <h2 className="text-[22px] font-bold leading-[1.4] md:text-[24px]">{news.title[0]}<br />{news.title[1]}</h2>
          <ol className="flex flex-wrap items-center gap-1.5 pt-1.5">
            {news.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[12px] text-mute" aria-hidden>→</span>}
                <span className="whitespace-nowrap rounded-[6px] bg-soft px-2 py-1 text-[12px] font-medium text-sub"><b className="text-key-strong">{i + 1}</b> {s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 pt-5 md:px-7">
          <a ref={cta} href={news.cta.href} onClick={(e) => { e.preventDefault(); close(true); router.push(news.cta.href); }}
            className="flex h-[52px] items-center justify-center rounded-control bg-key text-[16px] font-bold text-[#fff] md:h-12 md:text-[15px]">{news.cta.label}</a>
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
