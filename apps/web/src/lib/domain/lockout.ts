// 로그인 잠금 (PRD F1): 5회 실패하면 10분 잠금.

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 10;

export interface LockState {
  failedCount: number;
  lockedUntil: string | null;
}

export function isLocked(s: LockState, now: Date): boolean {
  return !!s.lockedUntil && new Date(s.lockedUntil).getTime() > now.getTime();
}

export function minutesLeft(s: LockState, now: Date): number {
  if (!s.lockedUntil) return 0;
  return Math.max(1, Math.ceil((new Date(s.lockedUntil).getTime() - now.getTime()) / 60000));
}

/** 비밀번호가 틀렸을 때 다음 상태 */
export function afterFailure(s: LockState, now: Date): LockState {
  // 잠금이 풀린 뒤 첫 실패는 1회부터 다시 센다
  const base = s.lockedUntil && !isLocked(s, now) ? 0 : s.failedCount;
  const count = base + 1;
  if (count >= MAX_FAILS) {
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() };
  }
  return { failedCount: count, lockedUntil: null };
}

export function afterSuccess(): LockState {
  return { failedCount: 0, lockedUntil: null };
}
