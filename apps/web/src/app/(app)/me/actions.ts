"use server";
import { withoutLocked } from "@/lib/server/features";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cleanCareerGoal } from "@/lib/domain/counsel";
import { checkNewPassword, PASSWORD_MESSAGES } from "@/lib/domain/password";
import { maskIdentity } from "@/lib/domain/program";
import { careerKeywords } from "@/lib/server/ai/student-ai";
import { env } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";
import { renewSession } from "@/lib/server/session";
import { requireCan, requireViewer } from "@/lib/server/viewer";
import { cleanLayout, isLockedMenu, navFor, type MenuLayout } from "@/components/shell/nav";

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
  const hash = await bcrypt.hash(next, 10);
  await repo.updateAccount(v.accountId, { passwordHash: hash, mustChangePassword: false });
  await repo.audit(v.accountId, "password.change", null);
  // 다른 기기의 세션은 끝나고 이 기기만 새 비밀번호로 이어진다
  await renewSession(v.accountId, hash);
  return { ok: (prev.ok ?? 0) + 1 };
}

export type CareerKeywords = { ok: true; fields: { field: string; keywords: string[] }[]; goal: string | null; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

/** 진로 키워드 정리: 자유 문장 → 진로 분야·키워드 제안. 이름·학번은 가려서 보내고, 저장하지 않는다 (확인 후 진로 칸에 넣기) */
export async function careerKeywordsAction(text: string): Promise<CareerKeywords> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const raw = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (raw.length < 2) return { ok: false, error: "하고 싶은 일을 한 문장으로 써 주세요" };
  const masked = maskIdentity(raw, [{ name: v.student.name, studentNo: v.student.studentNo }]);
  const r = await careerKeywords(masked);
  await repo.audit(v.accountId, "career.ai.keywords", `${v.student.pseudonymId} ${r.label}`);
  if (!r.fields.length && !r.goal) return { ok: false, error: "맞는 분야를 찾지 못했어요. 조금 더 구체적으로 써 볼까요?" };
  return { ok: true, fields: r.fields, goal: r.goal, label: r.label, note: r.error ? "AI가 답하지 않아 규칙으로 정리했어요" : undefined };
}

// ---------- 설정 (Figma N14 · N53): 프로필 사진 · 메뉴 보이기 · 메뉴 순서 ----------

export type PrefsResult = { ok: true } | { ok: false; error: string };

/** 프로필 사진: 브라우저가 256px 정사각으로 줄인 data URL. null 이면 지운다 */
export async function saveAvatar(avatar: string | null): Promise<PrefsResult> {
  const v = await requireViewer();
  if (avatar !== null && (!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 300_000)) {
    return { ok: false, error: "사진을 읽지 못했어요. 다른 사진으로 해 주세요" };
  }
  try {
    await repo.setAvatar(v.accountId, avatar);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 숨긴 메뉴: 내 사이드바에 있는 메뉴만, 홈·내 정보는 뺀다 */
export async function saveHiddenMenus(hrefs: string[]): Promise<PrefsResult> {
  const v = await requireViewer();
  const allowed = new Set(withoutLocked(navFor(v)).flatMap((g) => g.items).filter((it) => !isLockedMenu(it)).map((it) => it.href));
  const clean = [...new Set(hrefs)].filter((h) => allowed.has(h)).slice(0, 100);
  try {
    await repo.setHiddenMenus(v.accountId, clean);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 메뉴 순서 (N53): 내 사이드바에 있는 묶음 · 메뉴만 남긴다. null 이거나 처음 순서와 같으면 지운다(처음대로) */
export async function saveMenuLayout(layout: MenuLayout | null): Promise<PrefsResult> {
  const v = await requireViewer();
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 메뉴 순서를 바꿀 수 있어요" };
  try {
    await repo.setMenuLayout(v.accountId, cleanLayout(layout, withoutLocked(navFor(v))));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
