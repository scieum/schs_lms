import { NextResponse, type NextRequest } from "next/server";

// 빠른 1차 확인만 한다: 세션 쿠키가 없으면 무조건 첫 화면(상세페이지)으로.
// 실제 판정(서명 확인·비밀번호 변경 강제·권한)은 서버의 requireViewer/requireCan 이 한다.
const PUBLIC = ["/login", "/signup", "/features", "/manual"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // "/" 는 상세페이지 (로그인한 사람은 페이지에서 자기 홈으로 보낸다)
  if (pathname === "/" || PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.has("schs_session")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/health|api/cron/|favicon.ico|.*\\.png$).*)"],
};
