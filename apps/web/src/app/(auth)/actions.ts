"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { afterFailure, afterSuccess, isLocked, minutesLeft } from "@/lib/domain/lockout";
import { checkNewPassword, PASSWORD_MESSAGES } from "@/lib/domain/password";
import { homePath } from "@/lib/domain/policy";
import { env } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";
import { createSession, destroySession, readSession } from "@/lib/server/session";
import { getViewer } from "@/lib/server/viewer";

export type FormState = { error?: string } | undefined;

const LoginSchema = z.object({
  kind: z.enum(["student", "teacher"]),
  loginId: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(100),
});

// 없는 계정·틀린 비밀번호를 구분하지 않는다 (계정 존재 여부를 알려주지 않음)
const WRONG = "학번(이름) 또는 비밀번호가 맞지 않아요";
// 없는 계정일 때도 비슷한 시간이 걸리도록 비교할 가짜 해시
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "학번(이름)과 비밀번호를 입력해 주세요" };
  const { kind, loginId, password } = parsed.data;
  const now = new Date();

  const account = await repo.findAccountByLogin(kind, loginId);
  if (!account) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { error: WRONG };
  }
  if (isLocked(account, now)) {
    return { error: `5번 틀려서 잠겼어요. ${minutesLeft(account, now)}분 뒤에 다시 시도해 주세요` };
  }
  const ok = await bcrypt.compare(password, account.passwordHash);
  if (!ok) {
    const next = afterFailure(account, now);
    await repo.updateAccount(account.id, next);
    if (next.lockedUntil) {
      await repo.audit(account.id, "login.locked", null);
      return { error: "5번 틀려서 10분 동안 잠겼어요" };
    }
    return { error: `${WRONG} (${next.failedCount}/5)` };
  }

  await repo.updateAccount(account.id, afterSuccess());
  await repo.audit(account.id, "login", null);
  await createSession(account.id);
  if (account.mustChangePassword) redirect("/change-password");
  const v = await getViewer();
  redirect(v ? homePath(v) : "/login");
}

export async function logout() {
  const id = await readSession();
  if (id) await repo.audit(id, "logout", null);
  await destroySession();
  redirect("/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const v = await getViewer();
  if (!v) redirect("/login");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = checkNewPassword(next, confirm, env.initialAuthCode);
  if (problem) return { error: PASSWORD_MESSAGES[problem] };

  await repo.updateAccount(v.accountId, { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false });
  await repo.audit(v.accountId, "password.change", null);
  redirect(homePath({ ...v, mustChangePassword: false }));
}
