import "server-only";
import type { CommonActivity, CommonActivityPiece } from "@/lib/domain/common-activity";
import { check, db, isUuid } from "../supabase";

// 공통 활동 (Figma N26): 활동 등록 + 학생마다 만든 조각 기록.
// 표는 0019_common_activities.sql. 적용 전 DB면 읽기는 빈 목록, 저장은 안내 문구로 실패한다.

export type NewCommonActivity = Omit<CommonActivity, "id" | "createdAt">;
export type NewCommonActivityPiece = Omit<CommonActivityPiece, "id" | "createdAt">;

export interface CommonRepo {
  /** 이 범위의 공통 활동 (새 것부터) */
  listCommonActivities(scope: string): Promise<CommonActivity[]>;
  getCommonActivity(id: string): Promise<CommonActivity | null>;
  addCommonActivity(a: NewCommonActivity): Promise<CommonActivity>;
  /** 이 활동들에서 만든 조각 기록 (오래된 것부터) */
  listCommonActivityPieces(activityIds: string[]): Promise<CommonActivityPiece[]>;
  addCommonActivityPiece(p: NewCommonActivityPiece): Promise<CommonActivityPiece>;
}

const g = globalThis as unknown as { __schscommon?: { activities: CommonActivity[]; pieces: CommonActivityPiece[] } };
// 데모: 이서연 선생님 물리학 1분반 수행평가, 박지훈 선생님 2학년 3반 학급 자치
// 공유용 깨끗한 데모 (2026-10-22): 공통 활동 없이 시작
const cs = () => (g.__schscommon ??= { activities: [], pieces: [] });

export const demoCommon: CommonRepo = {
  async listCommonActivities(scope) {
    return cs().activities.filter((a) => a.scope === scope).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => ({ ...a }));
  },
  async getCommonActivity(id) {
    const a = cs().activities.find((x) => x.id === id);
    return a ? { ...a } : null;
  },
  async addCommonActivity(a) {
    const row: CommonActivity = { ...a, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    cs().activities.push(row);
    return { ...row };
  },
  async listCommonActivityPieces(ids) {
    const set = new Set(ids);
    return cs().pieces.filter((p) => set.has(p.activityId)).map((p) => ({ ...p }));
  },
  async addCommonActivityPiece(p) {
    const row: CommonActivityPiece = { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    cs().pieces.push(row);
    return { ...row };
  },
};

const NEED19 = "공통 활동을 쓰려면 DB 업데이트(0019)가 필요해요. 관리자에게 알려 주세요";
const missingTable = (e: { message: string } | null) => !!e && /common_activit/.test(e.message);
type ActRow = { id: string; scope: string; name: string; date: string | null; description: string | null; author_id: string; created_at: string; lesson_item_id?: string | null };
type PieceRow = { id: string; activity_id: string; student_id: string; author_id: string; content: string; file_count: number; created_at: string };
const toAct = (r: ActRow): CommonActivity => ({ id: r.id, scope: r.scope, name: r.name, date: r.date, description: r.description ?? "", authorId: r.author_id, createdAt: r.created_at, lessonItemId: r.lesson_item_id ?? null });
const toPiece = (r: PieceRow): CommonActivityPiece => ({ id: r.id, activityId: r.activity_id, studentId: r.student_id, authorId: r.author_id, content: r.content, fileCount: r.file_count, createdAt: r.created_at });

export const supabaseCommon: CommonRepo = {
  async listCommonActivities(scope) {
    const res = await db().from("common_activities").select("*").eq("scope", scope).order("created_at", { ascending: false });
    if (missingTable(res.error)) return [];
    return (check(res) as ActRow[]).map(toAct);
  },
  async getCommonActivity(id) {
    if (!isUuid(id)) return null;
    const res = await db().from("common_activities").select("*").eq("id", id).maybeSingle();
    if (missingTable(res.error)) return null;
    const r = check(res) as ActRow | null;
    return r ? toAct(r) : null;
  },
  async addCommonActivity(a) {
    const res = await db().from("common_activities").insert({ scope: a.scope, name: a.name, date: a.date, description: a.description, author_id: a.authorId, ...(a.lessonItemId ? { lesson_item_id: a.lessonItemId } : {}) }).select("*").single();
    if (missingTable(res.error)) throw new Error(NEED19);
    return toAct(check(res) as ActRow);
  },
  async listCommonActivityPieces(ids) {
    const list = ids.filter(isUuid);
    if (!list.length) return [];
    const res = await db().from("common_activity_pieces").select("*").in("activity_id", list).order("created_at");
    if (missingTable(res.error)) return [];
    return (check(res) as PieceRow[]).map(toPiece);
  },
  async addCommonActivityPiece(p) {
    const res = await db().from("common_activity_pieces")
      .insert({ activity_id: p.activityId, student_id: p.studentId, author_id: p.authorId, content: p.content, file_count: p.fileCount }).select("*").single();
    if (missingTable(res.error)) throw new Error(NEED19);
    return toPiece(check(res) as PieceRow);
  },
};
