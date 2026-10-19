"use server";
import { revalidatePath } from "next/cache";
import { scaleOf, type ScaleKey } from "@/lib/domain/achievement";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

/** 학교 설정: 성취수준 단계 (Figma N35 ③) — 5단계 A~E(기본) | 3단계 상·중·하 */
export async function setAchievementScale(input: { scale: string }): Promise<{ ok: true; scale: ScaleKey } | { ok: false; error: string }> {
  const v = await requireCan("curriculum.manage");
  const scale = scaleOf(input?.scale);
  try {
    await repo.setAchievementScale(scale);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  await repo.audit(v.accountId, "setting.achievement_scale", scale);
  revalidatePath("/admin");
  revalidatePath("/teacher/setuk");
  return { ok: true, scale };
}
