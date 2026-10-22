"use server";
import { revalidatePath } from "next/cache";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 조각 지우기 (2026-10-22): 내가 쓴 조각(세특 조각 메모 · 동아리 · 담임 누가기록)만 숨긴다 — deleted_at(0034), 기록은 남는다.
// 남이 쓴 조각 id 가 섞여 와도 repo 가 author_id 로 걸러 건드리지 않는다.
export async function deleteMyPieces(input: { memoIds?: string[]; logIds?: string[] }): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const v = await requireViewer();
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 지울 수 있어요" };
  const memoIds = [...new Set((input.memoIds ?? []).map(String))].slice(0, 200);
  const logIds = [...new Set((input.logIds ?? []).map(String))].slice(0, 200);
  if (!memoIds.length && !logIds.length) return { ok: false, error: "지울 조각을 골라 주세요" };
  try {
    const n = (memoIds.length ? await repo.hideRecordMemos(memoIds, v.accountId) : 0) + (logIds.length ? await repo.hideActivityLogs(logIds, v.accountId) : 0);
    if (!n) return { ok: false, error: "내가 쓴 조각만 지울 수 있어요" };
    await repo.audit(v.accountId, "piece.delete", `${n}개`);
    for (const p of ["/teacher/setuk/collect", "/teacher/setuk/compose", "/teacher/club/collect", "/teacher/club/compose", "/homeroom/logs", "/homeroom/compose", "/teacher/texts"]) revalidatePath(p);
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "지우지 못했어요" };
  }
}
