import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { sessionMaxAge, type SessionClaims } from "@/lib/domain/session-policy";
import { sessionKey } from "./env";

// 세션 쿠키: 서명된 JWT, httpOnly. 안에는 계정 id · 자동 로그인 여부 · 비밀번호 지문만 넣는다 (학번·이름 X).
// 자동 로그인(keep)이면 30일, 아니면 12시간 (lib/domain/session-policy.ts).
export const SESSION_COOKIE = "schs_session";

/** 비밀번호 해시의 지문 — 비밀번호가 바뀌면 달라져 그 전 세션이 끝난다. 서명 키로 HMAC 해서 해시 자체는 드러나지 않는다 */
export const passwordStamp = (passwordHash: string) => createHmac("sha256", sessionKey()).update(passwordHash).digest("base64url").slice(0, 16);

export async function createSession(accountId: string, o: { passwordHash: string; keep?: boolean }) {
  const keep = !!o.keep;
  const maxAge = sessionMaxAge(keep);
  const token = await new SignJWT({ keep, pw: passwordStamp(o.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(sessionKey());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function readSessionClaims(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (!payload.sub) return null;
    return { id: payload.sub, keep: payload.keep === true, pw: typeof payload.pw === "string" ? payload.pw : null };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<string | null> {
  return (await readSessionClaims())?.id ?? null;
}

/** 내 비밀번호를 바꾼 뒤: 새 비밀번호 지문으로 다시 발급 (자동 로그인 여부는 그대로) */
export async function renewSession(accountId: string, passwordHash: string) {
  const c = await readSessionClaims();
  await createSession(accountId, { passwordHash, keep: c?.id === accountId && c.keep });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
