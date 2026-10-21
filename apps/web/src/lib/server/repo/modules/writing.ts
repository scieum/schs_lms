import "server-only";
import type { RecordArea, RecordDraft, RecordMemo } from "@/lib/domain/writing";
import { isDemo } from "../../env";
import { check, db, isUuid, selectIn } from "../supabase";
import { insertWithProv, provFrom, type ProvRow } from "./provenance";

// 교사 AI 기록 쓰기(세특·누가기록 특기사항·행발).
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.
// 초안·메모는 추가만 한다 (C4). 마지막 버전이 지금 값이다.

export type NewRecordDraft = Omit<RecordDraft, "id" | "createdAt">;
export type NewRecordMemo = Omit<RecordMemo, "id" | "createdAt">;

export interface WritingRepo {
  /** 영역·학년도·학생으로 초안 버전 전체 (오래된 것부터) */
  listRecordDrafts(filter: { area: RecordArea; year: number; studentIds: string[] }): Promise<RecordDraft[]>;
  addRecordDraft(r: NewRecordDraft): Promise<RecordDraft>;
  /** scope = "행발" | "자율·자치" | "동아리" | "진로" | "세특:<과목ID>" */
  listRecordMemos(scope: string, studentIds: string[]): Promise<RecordMemo[]>;
  addRecordMemo(r: NewRecordMemo): Promise<RecordMemo>;
}

// ---------- 데모 ----------

interface WritingStore {
  drafts: RecordDraft[];
  memos: RecordMemo[];
}
const g = globalThis as unknown as { __schswriting?: WritingStore };

/** 공유용 깨끗한 데모 (2026-10-22): 메모 · 초안 없이 시작 */
function seed(): WritingStore {
  return { drafts: [], memos: [] };
}

function ws(): WritingStore {
  if (!g.__schswriting) g.__schswriting = seed();
  return g.__schswriting;
}

// 데모에서는 처음 불러올 때 예시 누가기록이 공용 저장소에 들어가도록 (누가기록 화면에서도 보이게)
if (isDemo) ws();

const byTime = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);

export const demoWriting: WritingRepo = {
  async listRecordDrafts({ area, year, studentIds }) {
    const set = new Set(studentIds);
    return ws().drafts.filter((r) => r.area === area && r.year === year && set.has(r.studentId)).sort(byTime);
  },
  async addRecordDraft(r) {
    const row: RecordDraft = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ws().drafts.push(row);
    return row;
  },
  async listRecordMemos(scope, studentIds) {
    const set = new Set(studentIds);
    return ws().memos.filter((m) => m.scope === scope && set.has(m.studentId)).sort(byTime);
  },
  async addRecordMemo(r) {
    const row: RecordMemo = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ws().memos.push(row);
    return row;
  },
};

// ---------- Supabase ----------

type DraftRow = {
  id: string; area: RecordArea; student_id: string; author_id: string; year: number; semester: 1 | 2 | null;
  content: string; unit: RecordDraft["unit"]; max_len: number; status: RecordDraft["status"]; created_at: string;
} & ProvRow;
type MemoRow = { id: string; scope: string; student_id: string; author_id: string; content: string; created_at: string; lesson_item_id?: string | null; date?: string | null };

const toDraft = (r: DraftRow): RecordDraft => ({
  id: r.id, area: r.area, studentId: r.student_id, authorId: r.author_id, year: r.year, semester: r.semester,
  content: r.content, unit: r.unit, max: r.max_len, status: r.status, createdAt: r.created_at, ...provFrom(r),
});
const toMemo = (r: MemoRow): RecordMemo => ({ id: r.id, scope: r.scope, studentId: r.student_id, authorId: r.author_id, content: r.content, createdAt: r.created_at, lessonItemId: r.lesson_item_id ?? null, date: r.date ?? null });

export const supabaseWriting: WritingRepo = {
  async listRecordDrafts({ area, year, studentIds }) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const r = await selectIn<DraftRow>(ids, (part) => db().from("record_drafts").select("*").eq("area", area).eq("year", year).in("student_id", part).order("created_at"),
      (a, b) => a.created_at.localeCompare(b.created_at));
    return r.map(toDraft);
  },
  async addRecordDraft(x) {
    const r = await insertWithProv<DraftRow>("record_drafts", {
      area: x.area, student_id: x.studentId, author_id: x.authorId, year: x.year, semester: x.semester,
      content: x.content, unit: x.unit, max_len: x.max, status: x.status,
    }, x);
    return toDraft(r);
  },
  async listRecordMemos(scope, studentIds) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const r = await selectIn<MemoRow>(ids, (part) => db().from("record_memos").select("*").eq("scope", scope).in("student_id", part).order("created_at"),
      (a, b) => a.created_at.localeCompare(b.created_at));
    return r.map(toMemo);
  },
  async addRecordMemo(x) {
    const r = check(await db().from("record_memos").insert({ scope: x.scope, student_id: x.studentId, author_id: x.authorId, content: x.content }).select("*").single());
    return toMemo(r as MemoRow);
  },
};
