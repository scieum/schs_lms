import type { Metadata, Viewport } from "next";
import "./globals.css";

// 카톡 · 슬랙 등 링크 미리보기: 이미지는 같은 폴더 opengraph-image.png (1200×630, Next 가 og:image 로 넣는다).
// 미리보기 주소는 NEXT_PUBLIC_SITE_URL(없으면 Vercel 주소)로 절대 경로가 된다.
const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export const metadata: Metadata = {
  ...(site ? { metadataBase: new URL(site) } : {}),
  title: "속초고 쌤기부",
  description: "속초고등학교 학업·생기부 통합 관리",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "SCHS · 속초고 쌤기부",
    title: "속초고 쌤기부",
    description: "기록은 조각으로 모으고, 생기부는 함께 짓기",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
