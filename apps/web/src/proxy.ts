import { NextResponse, type NextRequest } from "next/server";

// 빠른 1차 확인만 한다: 세션 쿠키가 없으면 로그인으로.
// 실제 판정(서명 확인·비밀번호 변경 강제·권한)은 서버의 requireViewer/requireCan 이 한다.
const PUBLIC = ["/login"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.has("schs_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/health|favicon.ico|face.png|yeongrang.png|schs-logo.png).*)"],
};
