import "server-only";

// 서버 전용 설정. 키는 절대 NEXT_PUBLIC_ 으로 노출하지 않는다 (C1).
export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  /** 처음 받는 공통 인증코드 (첫 로그인 비밀번호). OI-8에서 정책 확정 예정 */
  initialAuthCode: process.env.INITIAL_AUTH_CODE ?? "schs-2026",
};

/** Supabase 연결 정보가 없으면 데모 모드 (메모리 데이터, 서버를 다시 켜면 초기화) */
export const isDemo = !env.supabaseUrl || !env.supabaseServiceKey;

export function sessionKey(): Uint8Array {
  const secret = env.sessionSecret || (isDemo ? "demo-only-session-secret-change-me-please" : "");
  if (secret.length < 32) throw new Error("SESSION_SECRET 은 32자 이상이어야 해요");
  return new TextEncoder().encode(secret);
}
