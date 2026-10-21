"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/domain/policy";
import { canEditTip, checkTip, type TipCategory } from "@/lib/domain/tips";
import { identityProblem } from "@/lib/server/identity-check";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 생기부 팁 올리기 · 고치기 · 지우기 (Figma N57). 교사 누구나 올리고, 고치기 · 지우기는 올린 교사 본인 · 관리자.
// 학생 이름 · 학번이 들어간 글은 막는다 (팁 게시판은 학교 선생님 모두가 본다).

export type TipResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveTip(input: { id?: string; category: string; title: string; body: string; source?: string }): Promise<TipResult> {
  const v = await requireCan("record.write");
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 올릴 수 있어요" };
  const data = { category: String(input.category) as TipCategory, title: String(input.title ?? "").trim(), body: String(input.body ?? "").trim(), source: String(input.source ?? "").trim() || null };
  const bad = checkTip(data) ?? (await identityProblem(`${data.title}\n${data.body}\n${data.source ?? ""}`));
  if (bad) return { ok: false, error: bad };
  try {
    if (input.id) {
      const tip = (await repo.listTips()).find((t) => t.id === input.id);
      if (!tip || !canEditTip(tip, { id: v.accountId, admin: isAdmin(v) })) return { ok: false, error: "올린 선생님만 고칠 수 있어요" };
      await repo.updateTip(tip.id, data);
      await repo.audit(v.accountId, "tip.update", tip.id);
      revalidatePath("/teacher/tips");
      return { ok: true, id: tip.id };
    }
    const tip = await repo.createTip({ id: v.accountId, name: `${v.teacher.name} 선생님` }, data);
    await repo.audit(v.accountId, "tip.create", tip.id);
    revalidatePath("/teacher/tips");
    return { ok: true, id: tip.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

export async function deleteTipAction(id: string): Promise<TipResult> {
  const v = await requireCan("record.write");
  const tip = (await repo.listTips()).find((t) => t.id === String(id));
  if (!tip || !canEditTip(tip, { id: v.accountId, admin: isAdmin(v) })) return { ok: false, error: "올린 선생님만 지울 수 있어요" };
  try {
    await repo.deleteTip(tip.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "지우지 못했어요" };
  }
  await repo.audit(v.accountId, "tip.delete", tip.id);
  revalidatePath("/teacher/tips");
  return { ok: true, id: tip.id };
}
