import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Viewer } from "@/lib/domain/types";
import { can, type Action } from "@/lib/domain/policy";
import { repo } from "./repo";
import { readSession } from "./session";

/** 지금 로그인한 사람. 요청마다 한 번만 읽는다. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const id = await readSession();
  if (!id) return null;
  const account = await repo.getAccount(id);
  if (!account) return null;
  if (account.kind === "student") {
    const student = await repo.getStudent(id);
    return student ? { kind: "student", accountId: id, mustChangePassword: account.mustChangePassword, student } : null;
  }
  const teacher = await repo.getTeacher(id);
  return teacher ? { kind: "teacher", accountId: id, mustChangePassword: account.mustChangePassword, teacher } : null;
});

/** 로그인 필수 + 비밀번호 변경 강제 (C9) */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.mustChangePassword) redirect("/change-password");
  return v;
}

/** 권한까지 확인. 없으면 403 화면 */
export async function requireCan(action: Action): Promise<Viewer> {
  const v = await requireViewer();
  if (!can(v, action)) redirect("/forbidden");
  return v;
}
