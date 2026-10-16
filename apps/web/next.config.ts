import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인한 사람마다 달라서 미리 만들 화면이 거의 없다 → 일반 동적 렌더링
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "bcryptjs"],
  // 계획서·제출 서류·합본 PDF·성적표 사진을 서버 액션으로 올린다 (기본 1MB → 25MB)
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
