"use client";
import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { HERO_CARDS } from "./landing-data";

// 상세페이지 히어로 그림 (N29 첫 화면 모션, Figma 371:2 · 스펙 373:2 · docs/design-system.md).
// 움직임은 전부 globals.css 의 .n29-* (CSS 애니메이션, opacity·transform만). 여기 JS는 두 가지뿐:
//  ① 카드 숫자 세기(requestAnimationFrame) ② 히어로가 화면 밖이거나 탭이 숨으면 반복 멈춤(data-paused).
// 동작 줄이기면 CSS가 애니메이션을 아예 걸지 않고, 숫자는 서버가 그린 최종값 그대로.

/** 흐름 선 (Hero Visual 좌표). PC 1000×440: 설문 → 영랑이 뒤 → 초안, 초안 → 나이스. 모바일 350×300: 설문 → 영랑이 뒤 → 초안 */
const PC_PATHS = ["M250 130 C380 130 420 230 500 230 C580 230 620 100 700 100", "M872 100 C950 100 950 300 852 300"];
const M_PATH = "M62 98 C62 170 150 233 257 233";
/** 정류장 점 [x, y, 나타나는 ms] — 선이 닿을 때 */
const PC_STOPS: [number, number, number][] = [[250, 130, 1000], [700, 100, 1560], [872, 100, 1560], [852, 300, 1800]];
const M_STOPS: [number, number, number][] = [[62, 98, 1000], [257, 233, 1800]];
/** 빛 점이 각 카드에 닿는 때 (반복 한 바퀴 3000ms 안, ms). PC 초안 = 첫 선 끝(길이 비율 0.66 → in-out 이징 ≈ 880ms) */
const FLASH_AT: Record<string, number> = { survey: 0, draft: 880, "draft-m": 1600, neis: 1600 };

const COUNT_MS = 900;
// out 이징 cubic-bezier(0.22, 1, 0.36, 1) — x에서 y를 이분법으로 구한다
const bez = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
function easeOut(x: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (bez(0.22, 0.36, m) < x) lo = m; else hi = m; }
  return bez(1, 1, (lo + hi) / 2);
}

const ms = (n: number) => `${n}ms`;

export function HeroVisual() {
  const root = useRef<HTMLDivElement>(null);

  // ① 숫자 세기: 카드 등장 애니메이션의 currentTime 을 따라간다 (하이드레이션이 늦어도 화면과 맞음)
  useEffect(() => {
    const el = root.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nums = [...el.querySelectorAll<HTMLElement>("[data-count]")];
    const items = nums.map((num) => {
      const card = num.closest<HTMLElement>("[data-card]")!;
      const anim = card.getAnimations().find((a) => (a as CSSAnimation).animationName === "n29-card");
      return { num, final: Number(num.dataset.count), at: Number(card.dataset.at), anim };
    });
    let raf = 0;
    const tick = () => {
      let running = false;
      for (const it of items) {
        const t = it.anim?.currentTime;
        const p = typeof t === "number" ? Math.min(1, Math.max(0, (t - it.at) / COUNT_MS)) : 1;
        if (p < 1) running = true;
        const v = String(Math.round(it.final * easeOut(p)));
        if (it.num.textContent !== v) it.num.textContent = v;
      }
      if (running) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  // ② 반복 멈춤: 화면 밖 또는 탭 숨김
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let visible = true;
    const sync = () => { el.dataset.paused = String(!visible || document.hidden); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);

  return (
    <div ref={root} data-paused="false" className="n29 relative mt-2 h-[300px] w-full max-w-[350px] md:mt-3 md:h-[440px] md:max-w-[1000px]">
      {/* 은은한 인디고 빛 번짐 (디자인 시스템이 허용한 유일한 예외) */}
      <div className="n29-glow absolute left-1/2 top-[84px] size-[360px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(83,109,254,0.55)_0%,rgba(83,109,254,0)_70%)] md:top-[60px] md:size-[560px]" aria-hidden />

      {/* 흐름 선 + 정류장 점 (영랑이 아래 층, 카드가 위에서 덮는다) */}
      <svg className="pointer-events-none absolute left-0 top-0 hidden md:block" width="1000" height="440" viewBox="0 0 1000 440" fill="none" aria-hidden>
        {PC_PATHS.map((d, i) => (
          <path key={d} d={d} pathLength={1} className="n29-line" style={{ "--n29-at": ms(i ? 1560 : 1000), "--n29-dur": ms(i ? 240 : 560) } as CSSProperties} />
        ))}
      </svg>
      <svg className="pointer-events-none absolute left-0 top-0 md:hidden" width="260" height="300" viewBox="0 0 260 300" fill="none" aria-hidden>
        <path d={M_PATH} pathLength={1} className="n29-line" style={{ "--n29-at": ms(1000), "--n29-dur": ms(800) } as CSSProperties} />
      </svg>
      {PC_STOPS.map(([x, y, at]) => <Stop key={`p${x}`} x={x} y={y} at={at} className="hidden md:block" />)}
      {M_STOPS.map(([x, y, at]) => <Stop key={`m${x}`} x={x} y={y} at={at} className="md:hidden" />)}

      {/* 빛 점: 3초마다 흐름 선을 따라 1.6초 */}
      <span className="n29-dot hidden md:block" style={{ offsetPath: `path("${PC_PATHS.join(" ")}")` }} aria-hidden><span /></span>
      <span className="n29-dot md:hidden" style={{ offsetPath: `path("${M_PATH}")` }} aria-hidden><span /></span>

      <div className="n29-mascot absolute bottom-0 left-1/2 -translate-x-1/2">
        <Image src="/clover.png" alt="네잎클로버를 든 영랑이" width={365} height={390} priority className="n29-bob h-[250px] w-auto max-w-none md:h-[390px]" />
      </div>

      {HERO_CARDS.map((c) => (
        <div
          key={c.key}
          data-card
          data-at={c.at}
          className={`n29-card absolute whitespace-nowrap rounded-inner border border-white/20 bg-white/10 px-3.5 py-2.5 text-left backdrop-blur-sm md:px-5 md:py-4 ${c.pos}`}
          style={{ "--n29-at": ms(c.at), "--n29-flash": ms(2500 + FLASH_AT[c.key]) } as CSSProperties}
        >
          <span className="n29-flash pointer-events-none absolute -inset-px rounded-inner border border-white/40" aria-hidden />
          <div className="text-[12px] font-bold text-white md:text-[15px]">{c.title}</div>
          <div className="mt-0.5 text-[11px] font-medium text-[#b0b8c1] md:mt-1 md:text-[13px]">
            {c.pre}
            <span data-count={c.n} className="inline-block text-right tabular-nums" style={{ minWidth: `${String(c.n).length}ch` }}>{c.n}</span>
            {c.post}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stop({ x, y, at, className }: { x: number; y: number; at: number; className: string }) {
  return <span className={`n29-stop ${className}`} style={{ left: x - 4, top: y - 4, "--n29-at": ms(at) } as CSSProperties} aria-hidden />;
}
