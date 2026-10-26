import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Viewer } from "@/lib/domain/types";
import { can, type Action } from "@/lib/domain/policy";
import { repo } from "./repo";
import { sessionValid } from "@/lib/domain/session-policy";
import { passwordStamp, readSessionClaims } from "./session";
import { scoresEnabled } from "./features";

/** 지금 로그인한 사람. 요청마다 한 번만 읽는다. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await readSessionClaims();
  if (!claims) return null;
  const id = claims.id;
  // DB 왕복을 줄이려고 계정·교사·학생을 한 번에 조회한다 (둘 중 하나만 있다)
  const [account, teacher, student] = await Promise.all([repo.getAccount(id), repo.getTeacher(id), repo.getStudent(id)]);
  if (!account) return null;
  // 비밀번호가 바뀌었거나 관리자가 잠근 계정이면 (자동 로그인이라도) 세션을 받지 않는다
  if (!sessionValid(claims, account, new Date(), passwordStamp)) return null;
  if (account.kind === "student") {
    return student ? { kind: "student", accountId: id, mustChangePassword: account.mustChangePassword, student } : null;
  }
  return teacher ? { kind: "teacher", accountId: id, mustChangePassword: account.mustChangePassword, teacher } : null;
});

/** 로그인 필수 + 비밀번호 변경 강제 (C9) */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/");
  if (v.mustChangePassword) redirect("/change-password");
  return v;
}

/** 권한까지 확인. 없으면 403 화면 */
/** 잠근 기능의 권한 (lib/server/features.ts) */
const SCORE_ACTIONS: Action[] = ["scores.upload", "minimum.view"];
export const lockedAction = (action: Action) => SCORE_ACTIONS.includes(action) && !scoresEnabled();

export async function requireCan(action: Action): Promise<Viewer> {
  if (lockedAction(action)) redirect("/locked");
  const v = await requireViewer();
  if (!can(v, action)) redirect("/forbidden");
  return v;
}
