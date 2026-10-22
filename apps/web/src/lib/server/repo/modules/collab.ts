import "server-only";
import type { CollabItem, CollabKind, CollabMeta } from "@/lib/domain/collab";
import { check, db, isUuid } from "../supabase";

// 협업방 (Figma N69). 표 0038_collab.sql (collab_rooms · collab_members · collab_items). 지우기 · 방 닫기는 deleted_at 만 (C4).
// 멤버 이름은 부르는 쪽이 교사 목록으로 붙인다. 적용 전 DB면 읽기는 빈 목록, 쓰기는 안내 문구로 실패한다.

export type RoomRow = { id: string; name: string; intro: string; ownerId: string; createdAt: string; memberIds: string[] };
export type ItemSave = { kind: CollabKind; title: string; body: string; meta: CollabMeta };

export interface CollabRepo {
  /** 내가 든 방 (teacherId 없으면 모두 — 관리자) */
  listRooms(teacherId?: string): Promise<RoomRow[]>;
  getRoom(id: string): Promise<RoomRow | null>;
  createRoom(ownerId: string, input: { name: string; intro: string }): Promise<string>;
  updateRoom(id: string, input: { name: string; intro: string }): Promise<void>;
  closeRoom(id: string): Promise<void>;
  addMembers(id: string, teacherIds: string[]): Promise<void>;
  removeMember(id: string, teacherId: string): Promise<void>;
  listItems(roomIds: string[]): Promise<CollabItem[]>;
  addItem(roomId: string, author: { id: string; name: string }, input: ItemSave): Promise<string>;
  updateItem(id: string, input: ItemSave, editorName: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
}

type MemRoom = RoomRow & { closed?: boolean };
const g = globalThis as unknown as { __schscollab?: { rooms: MemRoom[]; items: CollabItem[] } };
const SEED_AT = "2026-10-21T09:00:00.000Z";
const mem = () => (g.__schscollab ??= {
  rooms: [{ id: "room-demo", name: "2학년 융합 수업", intro: "물리 · 화학 · 정보가 함께 하는 '에너지' 주제 융합 수업 준비", ownerId: "t-subject", createdAt: SEED_AT, memberIds: ["t-subject", "t-admin"] }],
  items: [
    { id: "ci-1", roomId: "room-demo", kind: "메모", title: "융합 수업 일정 맞추기", body: "11월 2주에 물리 · 화학이 같이 '에너지 전환' 주제로 해요.\n보고서 양식은 하나로 맞추기.", meta: {}, authorId: "t-subject", authorName: "이서연 선생님", editorName: null, createdAt: SEED_AT, updatedAt: SEED_AT },
    { id: "ci-2", roomId: "room-demo", kind: "수행평가", title: "에너지 전환 탐구 보고서", body: "역학적 에너지와 열에너지 전환을 실험으로 확인하고 그래프 해석 · 오차 분석으로 평가", meta: { date: "2026-11-11", subject: "물리학" }, authorId: "t-subject", authorName: "이서연 선생님", editorName: null, createdAt: SEED_AT, updatedAt: SEED_AT },
  ],
});
const live = () => mem().rooms.filter((r) => !r.closed);

export const demoCollab: CollabRepo = {
  async listRooms(tid) { return live().filter((r) => !tid || r.memberIds.includes(tid)).map((r) => ({ ...r, memberIds: [...r.memberIds] })); },
  async getRoom(id) { const r = live().find((x) => x.id === id); return r ? { ...r, memberIds: [...r.memberIds] } : null; },
  async createRoom(owner, input) { const id = crypto.randomUUID(); mem().rooms.push({ id, ...input, ownerId: owner, createdAt: new Date().toISOString(), memberIds: [owner] }); return id; },
  async updateRoom(id, input) { const r = live().find((x) => x.id === id); if (r) Object.assign(r, input); },
  async closeRoom(id) { const r = live().find((x) => x.id === id); if (r) r.closed = true; },
  async addMembers(id, ids) { const r = live().find((x) => x.id === id); if (r) r.memberIds = [...new Set([...r.memberIds, ...ids])]; },
  async removeMember(id, tid) { const r = live().find((x) => x.id === id); if (r) r.memberIds = r.memberIds.filter((x) => x !== tid); },
  async listItems(ids) { return mem().items.filter((x) => ids.includes(x.roomId)).map((x) => ({ ...x, meta: { ...x.meta } })); },
  async addItem(roomId, a, input) { const id = crypto.randomUUID(); const at = new Date().toISOString(); mem().items.push({ id, roomId, ...input, authorId: a.id, authorName: a.name, editorName: null, createdAt: at, updatedAt: at }); return id; },
  async updateItem(id, input, editor) { const x = mem().items.find((i) => i.id === id); if (x) Object.assign(x, input, { editorName: editor, updatedAt: new Date().toISOString() }); },
  async deleteItem(id) { g.__schscollab!.items = mem().items.filter((x) => x.id !== id); },
};

const NEED38 = "협업방을 쓰려면 DB 업데이트(0038)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /collab_(rooms|members|items)/.test(e.message);
const fail = (res: { data: unknown; error: { message: string } | null }) => { if (missing(res.error)) throw new Error(NEED38); check(res); };
type RRow = { id: string; name: string; intro: string; owner_id: string; created_at: string; collab_members: { teacher_id: string }[] };
const toRoom = (r: RRow): RoomRow => ({ id: r.id, name: r.name, intro: r.intro, ownerId: r.owner_id, createdAt: r.created_at, memberIds: r.collab_members.map((m) => m.teacher_id) });
type IRow = { id: string; room_id: string; kind: CollabKind; title: string; body: string; meta: CollabMeta | null; author_id: string | null; author_name: string; editor_name: string | null; created_at: string; updated_at: string };
const toItem = (r: IRow): CollabItem => ({ id: r.id, roomId: r.room_id, kind: r.kind, title: r.title, body: r.body, meta: r.meta ?? {}, authorId: r.author_id, authorName: r.author_name, editorName: r.editor_name, createdAt: r.created_at, updatedAt: r.updated_at });

export const supabaseCollab: CollabRepo = {
  async listRooms(tid) {
    if (tid && !isUuid(tid)) return [];
    let ids: string[] | null = null;
    if (tid) {
      const m = await db().from("collab_members").select("room_id").eq("teacher_id", tid);
      if (missing(m.error)) return [];
      ids = (check(m) as { room_id: string }[]).map((x) => x.room_id);
      if (!ids.length) return [];
    }
    let q = db().from("collab_rooms").select("id, name, intro, owner_id, created_at, collab_members(teacher_id)").is("deleted_at", null).order("created_at");
    if (ids) q = q.in("id", ids);
    const res = await q;
    if (missing(res.error)) return [];
    return (check(res) as RRow[]).map(toRoom);
  },
  async getRoom(id) {
    if (!isUuid(id)) return null;
    const res = await db().from("collab_rooms").select("id, name, intro, owner_id, created_at, collab_members(teacher_id)").eq("id", id).is("deleted_at", null).maybeSingle();
    if (missing(res.error)) return null;
    const r = check(res) as RRow | null;
    return r ? toRoom(r) : null;
  },
  async createRoom(owner, input) {
    const res = await db().from("collab_rooms").insert({ ...input, owner_id: owner }).select("id").single();
    fail(res);
    const id = (res.data as { id: string }).id;
    fail(await db().from("collab_members").insert({ room_id: id, teacher_id: owner }));
    return id;
  },
  async updateRoom(id, input) { fail(await db().from("collab_rooms").update(input).eq("id", id)); },
  async closeRoom(id) { fail(await db().from("collab_rooms").update({ deleted_at: new Date().toISOString() }).eq("id", id)); },
  async addMembers(id, ids) {
    const rows = ids.filter(isUuid).map((t) => ({ room_id: id, teacher_id: t }));
    if (rows.length) fail(await db().from("collab_members").upsert(rows, { onConflict: "room_id,teacher_id", ignoreDuplicates: true }));
  },
  async removeMember(id, tid) { fail(await db().from("collab_members").delete().eq("room_id", id).eq("teacher_id", tid)); },
  async listItems(ids) {
    const ok = ids.filter(isUuid);
    if (!ok.length) return [];
    const res = await db().from("collab_items").select("*").in("room_id", ok).is("deleted_at", null);
    if (missing(res.error)) return [];
    return (check(res) as IRow[]).map(toItem);
  },
  async addItem(roomId, a, input) {
    const res = await db().from("collab_items").insert({ room_id: roomId, ...input, author_id: isUuid(a.id) ? a.id : null, author_name: a.name }).select("id").single();
    fail(res);
    return (res.data as { id: string }).id;
  },
  async updateItem(id, input, editor) { fail(await db().from("collab_items").update({ ...input, editor_name: editor, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null)); },
  async deleteItem(id) { fail(await db().from("collab_items").update({ deleted_at: new Date().toISOString() }).eq("id", id)); },
};
