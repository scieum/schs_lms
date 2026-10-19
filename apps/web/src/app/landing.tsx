import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { HeroVisual } from "./landing-hero";
import { FaqList } from "./landing-sections";
import { Head, SiteFooter, SiteHeader, wrap } from "./landing-shell";
import { CORE, FLOW, MORE, ROLES, SAFETY } from "./landing-data";

// 상세페이지 = Figma 04 상세페이지 N44 (PC 501:660, Mobile 501:1089 · 옛 B안 v2는 99 이전 버전 502:10262). 로그인 전 첫 화면.
// 구성: Nav → Hero → Flow(5단계) → Core 01–06(제품 화면) → More 07–18(+ 기능 전체 보기 → /features) → For everyone → Safety(네이비) → FAQ → CTA → Footer
// 기능 전체 목록은 따로 /features "기능 한눈에 보기" (N44).
// 성적·수능 최저 기능은 잠가 두었으므로(apps/CLAUDE.md) 상세페이지에서도 소개하지 않는다.
/** N30 카드 호버: 화살표(opacity·밀림)와 아래 진행선. 장식이라 읽지 않는다 (globals.css .n30-*) */
function Arrow({ className }: { className: string }) {
  return <span aria-hidden className={`n30-arrow absolute text-[20px] font-bold leading-none ${className}`}>→</span>;
}
const Bar = ({ className = "" }: { className?: string }) => <span aria-hidden className={`n30-bar ${className}`} />;
const idx = (i: number) => ({ "--i": i }) as CSSProperties;

function Tag({ children, tone = "white" }: { children: string; tone?: "white" | "key" }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-chip px-2 py-1 text-[12px] font-medium leading-[1.4] md:text-[13px] ${tone === "key" ? "bg-key-soft text-key-strong" : "bg-white text-sub"}`}>
      {children}
    </span>
  );
}

/** N29 등장 변수: 시작 ms · 떠오르는 거리 px · 길이 ms */
const rise = (at: number, y: number, dur = 500) => ({ "--n29-at": `${at}ms`, "--n29-y": `${y}px`, "--n29-dur": `${dur}ms` }) as CSSProperties;

function Rise({ at, y, dur, children }: { at: number; y: number; dur: number; children: string }) {
  return <span className="n29-in inline-block" style={rise(at, y, dur)}>{children}</span>;
}

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-ink">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0a0b12_0%,#1c2033_100%)] text-white">
        <div className={`${wrap} flex flex-col items-center pt-14 text-center md:pt-[120px]`}>
          {/* N29 첫 화면 모션: 제목 단어 → 부제 → 버튼 → 그림 (globals.css .n29-*, 시간표는 docs/design-system.md) */}
          <h1 className="text-[30px] font-bold leading-[1.3] md:text-[56px]">
            <Rise at={100} y={24} dur={450}>생기부</Rise> <Rise at={180} y={24} dur={450}>초안부터</Rise><br />
            <Rise at={260} y={24} dur={450}>나이스</Rise> <Rise at={340} y={24} dur={450}>입력까지</Rise>
          </h1>
          <p className="n29-in mt-5 text-[17px] leading-[1.35] text-[#b0b8c1] md:mt-7 md:text-[20px]" style={rise(550, 12)}>설문·서류로 AI가 쓰고, <br className="md:hidden" />선생님이 확정해요.</p>
          <div className="mt-5 flex w-full flex-col gap-3 md:mt-7 md:w-auto md:flex-row">
            <Link href="/login" className="n29-in whitespace-nowrap rounded-control bg-key px-[30px] py-3.5 text-[16px] font-bold hover:bg-key-strong md:py-[17px] md:text-[17px]" style={rise(700, 12)}>속초고 계정으로 시작하기</Link>
            <a href="#flow" className="n29-in whitespace-nowrap rounded-control border border-white/20 bg-white/10 px-[30px] py-3.5 text-[16px] font-bold hover:bg-white/15 md:py-[17px] md:text-[17px]" style={rise(760, 12)}>둘러보기</a>
          </div>
          <Link href="/signup" className="n29-in mt-4 text-[13px] text-[#9eaaff] underline-offset-4 hover:underline" style={rise(820, 0, 400)}>처음이신 선생님은 가입하기</Link>

          <HeroVisual />
        </div>
      </section>

      {/* Flow: 다섯 단계 */}
      <section id="flow" className="scroll-mt-16 bg-white">
        <div className={`${wrap} py-[72px] md:py-[120px]`}>
          <Head eyebrow="Flow">초안에서 나이스까지<br />다섯 단계</Head>
          {/* N30: 카드 위 연결선(md 이상, li 의 가상 요소·점이라 폭을 밀지 않는다)이 올린 단계까지 차오른다 */}
          <ol className="mx-auto mt-9 grid w-full max-w-[1200px] gap-2.5 md:mt-16 md:grid-cols-5 md:gap-5">
            {FLOW.map((s, i) => (
              <li key={s.title} className="n30-flow relative" style={idx(i)}>
                <span aria-hidden className="n30-dot" />
                <div className="n30-flow-card relative flex h-full items-center gap-3.5 overflow-hidden rounded-card bg-bg px-[18px] py-[18px] md:flex-col md:items-start md:gap-3 md:px-6 md:py-7">
                  <span className="n30-num flex size-7 shrink-0 items-center justify-center rounded-full bg-key text-[14px] font-bold text-white md:size-8 md:text-[15px]">{i + 1}</span>
                  <div className="min-w-0 flex-1 md:flex-none">
                    <div className="n30-t text-[17px] font-bold leading-[1.35] md:text-[20px]">{s.title}</div>
                    <div className="mt-0.5 text-[14px] text-sub md:mt-3 md:text-[15px]">{s.line}</div>
                  </div>
                  <Tag tone="key">{s.who}</Tag>
                  <Arrow className="right-6 top-[34px] hidden md:block" />
                  <Bar />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Core 01–06: 제품 화면 */}
      <section id="core" className="scroll-mt-16 bg-[#f8f9fb]">
        <div className={`${wrap} py-[72px] md:py-[140px]`}>
          <Head eyebrow="Core features">손이 가장 많이 가던 일부터<br />순서대로</Head>
          <div className="mt-14 flex flex-col gap-14 md:mt-24 md:gap-24">
            {CORE.map((c, i) => (
              <div key={c.no} className="n30-core grid items-center gap-5 md:grid-cols-[minmax(0,536fr)_minmax(0,600fr)] md:gap-16 md:[&:nth-child(even)]:grid-cols-[minmax(0,600fr)_minmax(0,536fr)]">
                <div className={i % 2 ? "md:order-2" : ""}>
                  <p className="flex items-center gap-2 text-[14px] font-bold text-key md:text-[15px]">
                    <span className="relative flex gap-2.5"><span>{c.no}</span><span>{c.label}</span><span aria-hidden className="n30-uline" /></span>
                    <span aria-hidden className="n30-arrow">→</span>
                  </p>
                  <h3 className="mt-2.5 whitespace-pre-line text-[26px] font-bold leading-[1.3] md:mt-3.5 md:text-[34px]">{c.title}</h3>
                  <p className="mt-2.5 whitespace-pre-line text-[16px] leading-[1.4] text-sub md:mt-3.5 md:text-[18px]">
                    <span className="md:hidden">{c.m ?? c.desc}</span><span className="hidden md:inline">{c.desc}</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-5 md:gap-2">
                    {c.chips.map((t, k) => (
                      <Tag key={t}>{k === c.chips.length - 1 && c.lastChipM ? c.lastChipM : t}</Tag>
                    ))}
                  </div>
                </div>
                <div className={`n30-shot ${i % 2 ? "md:order-1" : ""}`}>
                  <Image src={`/landing/core-0${i + 1}-m.png`} alt={`${c.label} 화면`} width={372} height={380} sizes="(max-width: 767px) 100vw, 372px" className="h-auto w-full md:hidden" />
                  <Image src={`/landing/core-0${i + 1}.png`} alt={`${c.label} 화면`} width={600} height={400} sizes="(min-width: 1240px) 600px, 50vw" className="hidden h-auto w-full md:block" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* More 07–18 */}
      <section id="more" className="scroll-mt-16 bg-white">
        <div className={`${wrap} py-[72px] md:py-[120px]`}>
          <Head eyebrow="More features">그 밖의 일도<br />한 곳에서</Head>
          <ul className="mt-9 grid gap-2 sm:grid-cols-2 md:mt-16 md:gap-5 lg:grid-cols-4">
            {MORE.map(([no, title, line, who]) => (
              <li key={no} className="n30-more relative flex items-center gap-3 overflow-hidden rounded-card bg-bg px-[15px] py-[15px] md:flex-col md:items-stretch md:gap-2.5 md:p-[23px]">
                <div className="contents md:flex md:items-center md:justify-between">
                  <span className="w-[17px] shrink-0 text-[14px] font-bold text-key md:w-auto md:text-[15px]">{no}</span>
                  <span className="n30-tag order-last md:order-none"><Tag>{who}</Tag></span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="n30-t text-[16px] font-bold leading-[1.4] md:text-[20px] md:leading-[1.35]">{title}</div>
                  <div className="mt-0.5 text-[13px] text-sub md:mt-2.5 md:pr-7 md:text-[15px]">{line}</div>
                </div>
                <Arrow className="bottom-[23px] right-[23px] hidden md:block" />
                <Bar className="hidden md:block" />
              </li>
            ))}
          </ul>
          <Link href="/features" className="mt-8 block w-fit text-[15px] font-bold text-key-strong hover:underline md:mx-auto md:mt-12 md:text-[16px]">기능 전체 보기 ›</Link>
        </div>
      </section>

      {/* For everyone */}
      <section id="roles" className="scroll-mt-16 bg-[#f8f9fb]">
        <div className={`${wrap} py-[72px] md:py-[120px]`}>
          <Head eyebrow="For everyone">역할마다<br />필요한 화면만</Head>
          <div className="mt-9 grid grid-cols-2 gap-3 md:mt-16 md:gap-5 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.role} className="n30-role relative overflow-hidden rounded-card bg-white p-[17px] md:p-[27px]">
                <div className="n30-t text-[18px] font-bold leading-[1.35] md:text-[22px]">{r.role}</div>
                <Arrow className="right-[17px] top-[19px] md:right-[27px] md:top-[32px]" />
                <ul className="mt-3 flex flex-col gap-3 text-[14px] text-sub md:mt-4 md:gap-4 md:text-[16px]">
                  {r.items.map((it, k) => (
                    <li key={it} className="n30-item flex items-center gap-2 md:gap-2.5" style={idx(k)}><span className="size-[5px] shrink-0 rounded-full bg-key md:size-1.5" />{it}</li>
                  ))}
                </ul>
                <Bar />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety (네이비) */}
      <section id="safety" className="scroll-mt-16 bg-navy">
        <div className={`${wrap} py-[72px] md:py-[120px]`}>
          <Head eyebrow="Safety" light>AI가 쓰고,<br />확정은 선생님이</Head>
          <ul className="mt-9 grid gap-2.5 md:mt-16 md:grid-cols-3 md:gap-5">
            {SAFETY.map(([t, l]) => (
              <li key={t} className="rounded-card bg-navy-2 px-[18px] py-[18px] md:px-6 md:py-7">
                <div className="text-[17px] font-bold leading-[1.35] text-white md:text-[18px]">{t}</div>
                <div className="mt-1 text-[14px] text-[#c2caff] md:mt-2.5">{l}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-20 text-center md:px-6 md:py-[140px] xl:px-0">
          <p className="text-[14px] font-medium text-key md:text-[16px]">FAQ</p>
          <h2 className="mt-3 text-[28px] font-bold leading-[1.3] md:text-[40px]">자주 묻는 질문</h2>
          <FaqList />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
