"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cleanCareerGoal } from "@/lib/domain/counsel";
import { checkNewPassword, PASSWORD_MESSAGES } from "@/lib/domain/password";
import { env } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";
import { requireCan, requireViewer } from "@/lib/server/viewer";

export type MeState = { error?: string; ok?: number };

/** 학생 희망 진로 바꾸기 (추천 기준이 바뀐다) */
export async function updateCareer(prev: MeState, form: FormData): Promise<MeState> {
  const v = await requireCan("student.self");
  const goal = cleanCareerGoal(String(form.get("careerGoal") ?? ""));
  await repo.updateStudentCareerGoal(v.accountId, goal);
  await repo.audit(v.accountId, "career.update", v.kind === "student" ? v.student.pseudonymId : null);
  revalidatePath("/me");
  revalidatePath("/student/recs");
  revalidatePath("/student");
  return { ok: (prev.ok ?? 0) + 1 };
}

/** 스스로 비밀번호 바꾸기: 지금 비밀번호를 한 번 더 확인한다 */
export async function changeMyPassword(prev: MeState, form: FormData): Promise<MeState> {
  const v = await requireViewer();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const account = await repo.getAccount(v.accountId);
  if (!account || !(await bcrypt.compare(current, account.passwordHash))) return { error: "지금 비밀번호가 맞지 않아요" };
  const problem = checkNewPassword(next, confirm, env.initialAuthCode);
  if (problem) return { error: PASSWORD_MESSAGES[problem] };
  if (next === current) return { error: "지금과 다른 비밀번호를 써 주세요" };
  await repo.updateAccount(v.accountId, { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false });
  await repo.audit(v.accountId, "password.change", null);
  return { ok: (prev.ok ?? 0) + 1 };
}
