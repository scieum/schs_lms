import { ALL_FEATURES, FEATURE_COUNT } from "../landing-data";
import { AllFeatures, New } from "../landing-sections";
import { Head, SiteFooter, SiteHeader, wrap } from "../landing-shell";

export const metadata = { title: "기능 한눈에 보기 · 속초고등학교 학생관리시스템" };

// 기능 한눈에 보기 (N44): 상세페이지 위 메뉴 "기능 한눈에 보기"와 More 아래 "기능 전체 보기 ›"로 온다.
// 로그인 없이 연다(proxy.ts PUBLIC). 목차처럼 영역 8개 × 이름 · 한 줄 · 누가 · 새로. 성적·수능 최저 기능은 넣지 않는다.
export default function FeaturesPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-ink">
      <SiteHeader current="/features" />
      <main className={`${wrap} pb-[72px] pt-12 md:pb-[120px] md:pt-[88px]`}>
        <Head eyebrow="All features" as="h1">기능 한눈에 보기</Head>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-sub md:mt-6 md:justify-center md:text-[16px]">
          <span className="font-medium">기능 {FEATURE_COUNT}가지 · 영역 {ALL_FEATURES.length}개</span>
          <span className="text-mute">·</span>
          <span className="inline-flex items-center gap-2"><New />이번 달 새로 더한 기능</span>
        </p>
        <AllFeatures />
      </main>
      <SiteFooter />
    </div>
  );
}
