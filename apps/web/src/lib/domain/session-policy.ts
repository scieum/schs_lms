// 로그인 유지 (2026-10-26 "로그인 기능 중 자동 로그인 기능도 추가해줘"): [자동 로그인]을 켜면 30일, 끄면 지금처럼 12시간.
// 세션에는 비밀번호 지문(pw)을 같이 넣어, 비밀번호가 바뀌면(스스로 변경 · 관리자 초기화) 그 전 세션은 모두 끝난다.
// 관리자가 계정을 잠그면 자동 로그인도 끝난다. 지문이 없는 예전 세션은 12시간이 지나면 저절로 끝나므로 그대로 둔다.

import { isAdminLock, type LockState } from "./lockout";

export const SESSION_HOURS = 12;
export const KEEP_DAYS = 30;

/** 쿠키 · 토큰 유효 시간(초) */
export const sessionMaxAge = (keep: boolean) => (keep ? KEEP_DAYS * 24 * 3600 : SESSION_HOURS * 3600);

export type SessionClaims = { id: string; keep: boolean; pw: string | null };

/** 이 세션을 아직 받아 줄지: 비밀번호 지문이 지금 비밀번호와 같고, 관리자 잠금이 아니어야 한다 */
export function sessionValid(claims: Pick<SessionClaims, "pw">, account: LockState & { passwordHash: string }, now: Date, stamp: (hash: string) => string): boolean {
  if (isAdminLock(account, now)) return false;
  return claims.pw == null || claims.pw === stamp(account.passwordHash);
}
