import { describe, expect, it } from "vitest";
import { KEEP_DAYS, sessionMaxAge, sessionValid } from "./session-policy";

const stamp = (h: string) => `s:${h}`;
const now = new Date("2026-10-26T09:00:00+09:00");
const account = { passwordHash: "h1", failedCount: 0, lockedUntil: null };

describe("자동 로그인 (세션 유지)", () => {
  it("켜면 30일, 끄면 12시간", () => {
    expect(sessionMaxAge(true)).toBe(KEEP_DAYS * 86400);
    expect(sessionMaxAge(false)).toBe(12 * 3600);
  });
  it("비밀번호가 그대로면 유지, 바뀌면 끝", () => {
    expect(sessionValid({ pw: "s:h1" }, account, now, stamp)).toBe(true);
    expect(sessionValid({ pw: "s:h1" }, { ...account, passwordHash: "h2" }, now, stamp)).toBe(false);
  });
  it("관리자가 잠그면 끝 (5번 틀려 10분 잠금은 그대로 둔다)", () => {
    const adminLock = { ...account, lockedUntil: new Date(now.getTime() + 365 * 86400000).toISOString() };
    const tenMin = { ...account, lockedUntil: new Date(now.getTime() + 10 * 60000).toISOString() };
    expect(sessionValid({ pw: "s:h1" }, adminLock, now, stamp)).toBe(false);
    expect(sessionValid({ pw: "s:h1" }, tenMin, now, stamp)).toBe(true);
  });
  it("지문이 없는 예전 세션은 받아 준다", () => {
    expect(sessionValid({ pw: null }, { ...account, passwordHash: "h2" }, now, stamp)).toBe(true);
  });
});
