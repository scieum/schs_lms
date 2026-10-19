import "server-only";
import type { MergePiece } from "@/lib/domain/merge";
import type { RecordMemo } from "@/lib/domain/writing";
import { fileScope, isFileScope, isLibraryScope, libraryScope, pieceScope } from "@/lib/domain/merge";
import { commonScope, isCommonScope } from "@/lib/domain/common-activity";
import { repo } from "./repo";

/** 관찰 메모 + 조각 칸에서 남긴 메모 + 공통 활동 조각 + 자료 요약 조각 (N32) (생기부 조각 · 합치기에서 같이 쓴다) */
export async function listMemosWithPieces(scope: string, studentIds: string[]): Promise<RecordMemo[]> {
  const [memos, pieces, common, files, library] = await Promise.all([
    repo.listRecordMemos(scope, studentIds), repo.listRecordMemos(pieceScope(scope), studentIds), repo.listRecordMemos(commonScope(scope), studentIds), repo.listRecordMemos(fileScope(scope), studentIds),
    repo.listRecordMemos(libraryScope(scope), studentIds),
  ]);
  return [...memos, ...pieces, ...common, ...files, ...library];
}

// 합치기 조각 만들기: 누가기록 · 관찰 메모 · 받은 특색 활동 초안 (같은 글은 한 번만, 새 것부터)

export function logPieces(logs: { id: string; date: string; content: string; commonActivityId?: string | null }[]): MergePiece[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => ({ id: `log-${l.id}`, source: l.commonActivityId ? "공통 활동" : "누가기록", date: l.date, text: l.content }));
}

export function memoPieces(memos: RecordMemo[]): MergePiece[] {
  const seen = new Set<string>();
  return [...memos]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((m) => {
      const k = m.content.trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((m) => ({ id: `memo-${m.id}`, source: isCommonScope(m.scope) ? "공통 활동" : isFileScope(m.scope) ? "자료 요약" : isLibraryScope(m.scope) ? "보관함" : "메모", date: m.createdAt.slice(0, 10), text: m.content }));
}

/** 담임이 받은 특색 활동(프로그램) 초안 → 자율·자치·진로 조각. 앞에 프로그램 이름을 붙인다 */
export function programPieces(drafts: { programId: string; programTitle: string; content: string; finalizedAt: string }[]): MergePiece[] {
  return [...drafts]
    .sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt))
    .map((d) => ({ id: `program-${d.programId}`, source: "특색 활동", date: d.finalizedAt.slice(0, 10), text: `[${d.programTitle}] ${d.content}` }));
}
