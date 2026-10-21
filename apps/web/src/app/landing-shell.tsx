import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { COPYRIGHT, MAKERS_LINE } from "@/lib/domain/credits";
import { MobileMenu } from "./landing-sections";

// 상세페이지 껍데기: 위 메뉴(Nav) · 섹션 머리 · CTA + Footer. 상세페이지(/)와 기능 한눈에 보기(/features)가 같이 쓴다.
// 메뉴 링크는 "/#…" 로 두어 /features 에서도 상세페이지 해당 섹션으로 간다(/ 에서는 그 자리 스크롤).
export const NAV: [string, string][] = [["조각", "/#pieces"], ["흐름", "/#flow"], ["핵심 기능", "/#core"], ["기능 한눈에 보기", "/features"], ["역할", "/#roles"], ["안심 설계", "/#safety"], ["FAQ", "/#faq"]];

export const wrap = "mx-auto w-full max-w-[1200px] px-5 md:px-6 xl:px-0";

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="처음으로">
      <Image src="/face.png" alt="" width={32} height={34} priority className="h-7 w-auto md:h-[34px]" />
      <Image src="/schs-logo.png" alt="속초고 쌤기부" width={107} height={30} priority className="h-6 w-auto md:h-[30px]" />
    </Link>
  );
}

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-[#0a0b12]/95 backdrop-blur">
      <div className="relative">
        <div className={`${wrap} flex h-14 items-center gap-8 md:h-[79px]`}>
          <Logo />
          <nav className="ml-auto hidden items-center gap-9 text-[16px] text-[#c4cad1] lg:flex">
            {NAV.map(([l, h]) => (
              <a key={h} href={h} aria-current={h === current ? "page" : undefined}
                className={`whitespace-nowrap hover:text-white ${h === current ? "font-bold text-white" : ""}`}>{l}</a>
            ))}
          </nav>
          <Link href="/login" className="hidden whitespace-nowrap rounded-control bg-key px-[18px] py-2.5 text-[15px] font-bold text-white hover:bg-key-strong lg:block">로그인</Link>
          <MobileMenu links={NAV} />
        </div>
      </div>
    </header>
  );
}

/** 섹션 머리: 모바일은 왼쪽 정렬, PC는 가운데 (Figma Text Block) */
export function Head({ eyebrow, children, light, as: H = "h2" }: { eyebrow: string; children: ReactNode; light?: boolean; as?: "h1" | "h2" }) {
  return (
    <div className="text-left md:text-center">
      <p className={`text-[14px] font-medium md:text-[16px] ${light ? "text-[#9eaaff]" : "text-key"}`}>{eyebrow}</p>
      <H className={`mt-3 text-[28px] font-bold leading-[1.3] md:mt-4 md:text-[40px] ${light ? "text-white" : "text-ink"}`}>{children}</H>
    </div>
  );
}

/** CTA + Footer */
export function SiteFooter() {
  return (
    <>
      <section className="bg-[linear-gradient(180deg,#1c2033_0%,#0a0b12_100%)] text-white">
        <div className={`${wrap} flex flex-col items-center pb-16 pt-14 text-center md:pb-[120px] md:pt-[110px]`}>
          <Image src="/clover.png" alt="" width={187} height={200} className="h-[150px] w-auto md:h-[200px]" />
          <h2 className="mt-5 text-[26px] font-bold leading-[1.3] md:mt-6 md:text-[44px]">오늘 본 한 줄부터,<br />조각으로 남겨 두세요</h2>
          <Link href="/login" className="mt-5 w-full whitespace-nowrap rounded-control bg-key px-[30px] py-3.5 text-[16px] font-bold hover:bg-key-strong md:mt-6 md:w-auto md:py-[17px] md:text-[17px]">속초고 계정으로 시작하기</Link>
        </div>
      </section>
      <footer className="bg-[#0a0b12]">
        <div className={`${wrap} flex flex-col items-center gap-2 pb-12 pt-8 text-center text-[13px] text-[#8b95a1] md:pb-14 md:pt-12`}>
          {/* 노란 배지 로고(투명 배경, 검은 테두리) — 어두운 바탕에서도 노란 바탕·검은 글자라 그대로 읽힌다 */}
          <Link href="/" aria-label="처음으로" className="w-fit">
            <Image src="/schs-long.png" alt="SOKCHO HIGH SCHOOL" width={480} height={68} className="h-7 w-auto md:h-[34px]" />
          </Link>
          <p className="mt-1.5 text-[13px] md:text-[14px]">속초고등학교 교육과정부 · 학생·교직원 전용</p>
          <p>{COPYRIGHT} <span className="whitespace-nowrap">{MAKERS_LINE}</span></p>
        </div>
      </footer>
    </>
  );
}
