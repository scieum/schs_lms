import "server-only";
import type { MergePiece } from "@/lib/domain/merge";
import type { RecordMemo } from "@/lib/domain/writing";
import { fileScope, isFileScope, isLibraryScope, isProgramScope, libraryScope, pieceScope, programScope } from "@/lib/domain/merge";
import { commonScope, isCommonScope } from "@/lib/domain/common-activity";
import { isLessonScope, lessonScope } from "@/lib/domain/lesson-plan";
import { assessScope, isAssessScope } from "@/lib/domain/assessment";
import { repo } from "./repo";

/** 관찰 메모 + 조각 칸에서 남긴 메모 + 공통 활동 조각 + 자료 요약 조각 (N32) + 확정한 받은 초안 (N83) (생기부 조각 · 합치기에서 같이 쓴다) */
export async function listMemosWithPieces(scope: string, studentIds: string[]): Promise<RecordMemo[]> {
  // 세특이면 그 과목 수행평가(N59) 자료 요약도
  const course = /^세특:([^#]+)$/.exec(scope)?.[1];
  const assess = course ? (await repo.listAssessments({ courseId: course }).catch(() => [])).map((a) => assessScope(course, a.id)) : [];
  const [memos, pieces, common, files, library, lessons, programs, ...assessed] = await Promise.all([
    repo.listRecordMemos(scope, studentIds), repo.listRecordMemos(pieceScope(scope), studentIds), repo.listRecordMemos(commonScope(scope), studentIds), repo.listRecordMemos(fileScope(scope), studentIds),
    repo.listRecordMemos(libraryScope(scope), studentIds), repo.listRecordMemos(lessonScope(scope), studentIds),
    // 확정한 받은 초안 (N83): 행발은 누가기록처럼 자율·자치 · 진로 것을 다 본다
    Promise.all((scope === "행발" ? ["자율·자치", "진로"] : [scope]).map((a) => repo.listRecordMemos(programScope(a), studentIds))).then((x) => x.flat()),
    ...assess.map((s) => repo.listRecordMemos(s, studentIds)),
  ]);
  return [...memos, ...pieces, ...common, ...files, ...library, ...lessons, ...programs, ...assessed.flat()];
}

// 합치기 조각 만들기: 누가기록 · 관찰 메모(담임이 확정한 받은 특색 활동 초안 포함) (같은 글은 한 번만, 새 것부터)

export function logPieces(logs: { id: string; date: string; content: string; authorId?: string; commonActivityId?: string | null; lessonItemId?: string | null }[], me?: string): MergePiece[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => ({ id: `log-${l.id}`, source: l.lessonItemId ? "차시" : l.commonActivityId ? "공통 활동" : "누가기록", date: l.date, text: l.content, ...(me && l.authorId === me ? { mine: true } : {}) }));
}

export function memoPieces(memos: RecordMemo[], me?: string): MergePiece[] {
  const seen = new Set<string>();
  return [...memos]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((m) => {
      const k = m.content.trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((m) => ({ id: `memo-${m.id}`, source: isProgramScope(m.scope) ? "특색 활동" : isAssessScope(m.scope) ? "수행평가" : isLessonScope(m.scope) ? "차시" : isCommonScope(m.scope) ? "공통 활동" : isFileScope(m.scope) ? "자료 요약" : isLibraryScope(m.scope) ? "보관함" : "메모", date: m.date ?? m.createdAt.slice(0, 10), text: m.content, ...(me && m.authorId === me ? { mine: true } : {}) }));
}
