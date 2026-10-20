"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { homeroomStudents } from "@/lib/domain/activity";
import { BEHAVIOR_MEMO_MAX, cleanPicks, DEFAULT_MENU, mergeMenu, type KeywordMenu } from "@/lib/domain/behavior-keywords";
import { schoolYear } from "@/lib/domain/curriculum";
import { fitRange } from "@/lib/domain/merge";
import { resolveRecordLength, type AiDraftResult } from "@/lib/domain/writing";
import { behaviorDraft } from "@/lib/server/ai/merge-record";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { evidenceLogs } from "@/app/(app)/teacher/write/data";
import { pieceKey, piecesPool, saveOriginal } from "@/lib/server/provenance";
import { logPieces } from "@/lib/server/merge-pieces";
import { sourceKey } from "@/lib/domain/provenance";

// 행발 키워드 메뉴판 (Figma N35 ④): 메뉴판은 교사 본인 것만, 고른 키워드·메모는 담임 반 학생만.
// AI에는 가명ID와 이름·학번을 지운 메모·누가기록만 간다. 결과는 돌려주기만 — 교사가 본문에 넣고 저장·확정한다.

/** 담임 반 학생인지 서버에서 다시 확인 */
async function myStudent(studentId: string) {
  const v = await requireCan("record.write");
  const s = homeroomStudents(v, await repo.listStudents()).find((x) => x.id === studentId);
  return s ? { v, student: s } : null;
}

/** 메뉴판 저장 (순서 · 숨김 · 내 키워드). 기본 키워드는 지우지 않는다 — mergeMenu 로 다시 맞춘다 */
export async function saveKeywordMenu(input: { menu: KeywordMenu }): Promise<{ ok: true; menu: KeywordMenu } | { ok: false; error: string }> {
  const v = await requireCan("record.write");
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 고칠 수 있어요" };
  const menu = mergeMenu(DEFAULT_MENU, input?.menu);
  if (menu.groups.reduce((n, g) => n + g.items.length, 0) > 200) return { ok: false, error: "키워드가 너무 많아요" };
  try {
    await repo.saveKeywordMenu(v.accountId, menu);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  const custom = menu.groups.reduce((n, g) => n + g.items.filter((i) => i.custom).length, 0);
  const hidden = menu.groups.reduce((n, g) => n + g.items.filter((i) => i.hidden).length, 0);
  await repo.audit(v.accountId, "behavior.menu", `내 키워드 ${custom} · 숨김 ${hidden}`);
  revalidatePath("/homeroom/behavior");
  return { ok: true, menu };
}

const PickSchema = z.object({
  studentId: z.string().min(1),
  keywords: z.array(z.string()).max(40),
  memo: z.string().max(BEHAVIOR_MEMO_MAX, `메모는 ${BEHAVIOR_MEMO_MAX}자까지예요`),
  useLogs: z.boolean(),
});

/** 학생별 고른 키워드 · 에피소드 메모 · 누가기록 같이 쓰기 (라벨 그대로 저장) */
export async function saveBehaviorPicks(input: z.input<typeof PickSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = PickSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const t = await myStudent(p.data.studentId);
  if (!t) return { ok: false, error: "우리 반 학생만 쓸 수 있어요" };
  try {
    await repo.saveBehaviorPick({ studentId: t.student.id, year: schoolYear(), keywords: cleanPicks(p.data.keywords), memo: p.data.memo.trim(), useLogs: p.data.useLogs }, t.v.accountId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  return { ok: true };
}

const DraftSchema = PickSchema.extend({ unit: z.enum(["bytes", "chars"]), max: z.number().int().min(1) });

/** "✦ 초안 만들기": 고른 키워드 + 에피소드 메모 + (켜면) 행발 누가기록 → 행발 초안 (Sonnet) */
export async function draftBehavior(input: z.input<typeof DraftSchema>): Promise<AiDraftResult> {
  const p = DraftSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const t = await myStudent(p.data.studentId);
  if (!t) return { ok: false, error: "우리 반 학생만 쓸 수 있어요" };
  const keywords = cleanPicks(p.data.keywords);
  const memo = p.data.memo.trim();
  try {
    await repo.saveBehaviorPick({ studentId: t.student.id, year: schoolYear(), keywords, memo, useLogs: p.data.useLogs }, t.v.accountId);
  } catch { /* 저장이 안 돼도(0020 전) 초안은 만든다 */ }
  const raw = p.data.useLogs ? await evidenceLogs("행발", [t.student.id]) : [];
  const logs = raw.map((l) => ({ date: l.date, content: l.content, key: pieceKey({ id: `log-${l.id}`, source: l.commonActivityId ? "공통 활동" : "누가기록" }) }));
  const range = fitRange(resolveRecordLength("행발", { unit: p.data.unit, max: p.data.max }));
  const memoKey = sourceKey({ type: "piece", ref: "pick" });
  const r = await behaviorDraft({ student: t.student, keywords, memo, logs, range, memoKey });
  await repo.audit(t.v.accountId, "record.ai_behavior", `행발 ${t.student.pseudonymId} 키워드 ${keywords.length}`);
  if (!r.text) return { ok: false, error: r.notice ?? "초안을 만들지 못했어요. 메모를 더 적어 주세요" };
  // AI 원안 (N38): 근거 = 에피소드 메모 + 행발 누가기록
  const pool = [...(memo ? [{ type: "piece" as const, ref: "pick", key: memoKey, kind: "조각", where: "에피소드 메모", chip: "조각 · 에피소드 메모", text: memo }] : []), ...piecesPool(logPieces(raw))];
  const o = await saveOriginal({ kind: "behavior_keyword", studentId: t.student.id, scope: "행발", text: r.text, aiSentences: r.sentences, pool, model: r.sample ? "sample" : "write" });
  return { ok: true, text: r.text, sample: r.sample, notice: r.notice, gate: r.gate, ...(o ?? {}) };
}
