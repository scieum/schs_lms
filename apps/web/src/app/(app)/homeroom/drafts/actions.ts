"use server";
import { revalidatePath } from "next/cache";
import { homeroomStudents } from "@/lib/domain/activity";
import { isDraftAccepted, programPieceText, programRecordArea, programScope } from "@/lib/domain/merge";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

/**
 * 받은 초안 확정 (Figma N83 a 2035:23590 · b 2036:35439): 담임이 [확정]을 누르면 그 초안이
 * 담임의 자율·자치 / 진로 조각("특색 활동" 칩)으로 들어간다. 추가만 (C4), 이미 넣은 글은 다시 넣지 않는다.
 * keys: "programId:studentId"
 */
export async function acceptDrafts(keys: string[]): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const v = await requireCan("homeroom.view");
  const mine = homeroomStudents(v, await repo.listStudents());
  const want = new Set(keys);
  const drafts = (await repo.listDraftsForStudents(mine.map((s) => s.id)))
    .filter((d) => want.has(`${d.programId}:${d.studentId}`) && programRecordArea(d.area));
  if (!drafts.length) return { ok: false, error: "확정할 초안이 없어요" };
  const ids = [...new Set(drafts.map((d) => d.studentId))];
  const existing = (await Promise.all((["자율·자치", "진로"] as const).map((a) => repo.listRecordMemos(programScope(a), ids)))).flat();
  const pidOf = new Map(mine.map((s) => [s.id, s.pseudonymId]));
  let added = 0;
  for (const d of drafts) {
    if (isDraftAccepted(d, existing)) continue;
    await repo.addRecordMemo({ scope: programScope(programRecordArea(d.area)!), studentId: d.studentId, authorId: v.accountId, content: programPieceText(d) });
    await repo.audit(v.accountId, "homeroom.draft.accept", `${pidOf.get(d.studentId) ?? ""}:${d.programId}`);
    added++;
  }
  revalidatePath("/homeroom/drafts");
  revalidatePath("/teacher/pieces");
  return { ok: true, added };
}
