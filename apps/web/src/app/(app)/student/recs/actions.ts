"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isRecKind, matchRecs, REC_KINDS, type RecKind } from "@/lib/domain/counsel";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
import { loadMyRecords } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

/** 카탈로그 항목 관심 담기 / 빼기 */
export async function toggleInterest(itemId: string): Promise<void> {
  const v = await requireCan("student.self");
  const mine = await repo.listRecInterests(v.accountId);
  const had = mine.find((x) => x.itemId === itemId);
  if (had) {
    await repo.removeRecInterest(v.accountId, had.id);
  } else {
    const item = (await repo.listRecItems()).find((x) => x.id === itemId);
    if (!item) return;
    await repo.addRecInterest({ studentId: v.accountId, itemId: item.id, kind: item.kind, title: item.title, meta: item.meta, source: "catalog" });
  }
  revalidatePath("/student/recs");
}

export async function removeInterest(id: string): Promise<void> {
  const v = await requireCan("student.self");
  await repo.removeRecInterest(v.accountId, id);
  revalidatePath("/student/recs");
}

export type AiRec = { kind: RecKind; title: string; meta: string; reason: string };
export type AiRecResult = { ok: true; items: AiRec[]; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

const RecSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(REC_KINDS).describe("도서·대회·활동·진로 중 하나"),
    title: z.string(),
    meta: z.string().describe("짧은 설명 (저자·시기 등). 모르면 빈 문자열"),
    reason: z.string().describe("이 학생에게 추천하는 이유 한 문장. 근거가 된 기록을 짚는다"),
  })).describe("추천 3~5개"),
});

/** AI 추천: 가명ID + 희망 진로 + 확정 기록 키워드(제목) → 추천 목록. 저장하지 않는다 (확인 후 담기) */
export async function aiRecommend(): Promise<AiRecResult> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const goal = v.student.careerGoal;
  if (!goal) return { ok: false, error: "희망 진로를 먼저 정해 주세요" };
  const records = await loadMyRecords(v);
  const catalog = await repo.listRecItems();
  // 키가 없거나 실패하면: 학교 카탈로그에서 진로에 맞는 항목 (규칙)
  const rule = (note?: string): AiRecResult => ({
    ok: true,
    items: matchRecs(catalog, goal).slice(0, 5).map((c) => ({ kind: c.kind, title: c.title, meta: c.meta, reason: `${goal} 진로와 맞는 학교 추천 항목이에요` })),
    label: "자동",
    note,
  });
  if (!aiEnabled()) {
    await repo.audit(v.accountId, "recs.ai", `${v.student.pseudonymId} 자동`);
    return rule();
  }
  const r = await aiJson(RecSchema, {
    model: "fast",
    system: "고등학생에게 희망 진로와 지난 확정 기록을 바탕으로 도서·대회·활동·진로 특강을 추천한다. 실제로 있는지 확실한 것만 추천하고, 학교 카탈로그에 있는 항목을 먼저 고른다. 불확실하면 추천하지 않는다.",
    content: [
      `학생: ${v.student.pseudonymId}`,
      `희망 진로: ${goal}`,
      `확정 기록: ${records.map((x) => `${x.area}·${x.title}`).join(", ") || "없음"}`,
      `학교 카탈로그: ${catalog.map((c) => `[${c.kind}] ${c.title} (${c.meta})`).join("; ")}`,
    ].join("\n"),
  });
  await repo.audit(v.accountId, "recs.ai", v.student.pseudonymId);
  if (!r.ok) return rule("AI가 답하지 않아 학교 추천 목록에서 골랐어요");
  return { ok: true, items: r.data.items.filter((x) => isRecKind(x.kind)).slice(0, 5), label: "AI" };
}

/** 확인한 AI 추천을 담는다 */
export async function addAiInterest(rec: { kind: string; title: string; meta: string }): Promise<{ error?: string }> {
  const v = await requireCan("student.self");
  const title = rec.title.trim().slice(0, 100);
  if (!isRecKind(rec.kind) || !title) return { error: "담을 수 없는 항목이에요" };
  const item = (await repo.listRecItems()).find((x) => x.title === title);
  await repo.addRecInterest({
    studentId: v.accountId, itemId: item?.id ?? null, kind: rec.kind, title, meta: rec.meta.trim().slice(0, 100), source: item ? "catalog" : "ai",
  });
  revalidatePath("/student/recs");
  return {};
}
