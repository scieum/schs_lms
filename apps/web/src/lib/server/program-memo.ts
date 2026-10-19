import "server-only";
import { programMemoScope } from "@/lib/domain/program";
import { latestMemoByStudent, type RecordMemo } from "@/lib/domain/writing";
import { repo } from "./repo";

// 프로그램 교사 메모 (Figma N41): 프로그램 × 학생 관찰 메모. record_memos 에 scope '프로그램:<id>' 로 추가만 한다.
// 최신 한 건이 지금 메모 — 빈 글을 남기면 메모를 지운 것으로 본다.

/** 학생별 지금 메모 (빈 메모는 뺀다) */
export async function programMemos(programId: string, studentIds: string[]): Promise<Map<string, RecordMemo>> {
  if (!studentIds.length) return new Map();
  const latest = latestMemoByStudent(await repo.listRecordMemos(programMemoScope(programId), studentIds).catch(() => []));
  for (const [id, m] of latest) if (!m.content.trim()) latest.delete(id);
  return latest;
}

export async function programMemo(programId: string, studentId: string): Promise<RecordMemo | null> {
  return (await programMemos(programId, [studentId])).get(studentId) ?? null;
}
