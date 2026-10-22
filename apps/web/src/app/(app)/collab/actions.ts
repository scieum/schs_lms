"use server";
import { revalidatePath } from "next/cache";
import { canDeleteItem, canEditItem, canManageRoom, checkItem, checkRoom, COLLAB_LIMITS, type CollabItem, type CollabMeta } from "@/lib/domain/collab";
import { isAdmin } from "@/lib/domain/policy";
import { fitsStyle } from "@/lib/domain/prompt-library";
import { isStyleArea, STYLE_LIMITS, type StyleArea } from "@/lib/domain/writing-style";
import { namedRoom } from "@/lib/server/collab";
import { identityProblem } from "@/lib/server/identity-check";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 협업방 (Figma N69): 방 만들기 · 고치기 · 닫기 · 초대 · 나가기 · 올리기 · 고치기 · 지우기 · 프롬프트 내 스타일에 넣기 · 다른 화면에서 올리기 · 가져오기.
// 멤버만 방을 보고 쓴다. 학생 이름 · 학번이 들어가면 막는다.

export type CollabResult = { ok: true; id: string } | { ok: false; error: string };
const err = (e: unknown, msg: string) => ({ ok: false as const, error: e instanceof Error ? e.message : msg });
const touch = (id?: string) => { revalidatePath("/collab"); if (id) revalidatePath(`/collab/${id}`); };

async function me() {
  const v = await requireCan("record.write");
  if (v.kind !== "teacher") throw new Error("선생님만 쓸 수 있어요");
  return { v, id: v.accountId, admin: isAdmin(v), name: `${v.teacher.name} 선생님` };
}

async function myRoom(roomId: string) {
  const m = await me();
  const r = await repo.getRoom(String(roomId));
  if (!r || (!r.memberIds.includes(m.id) && !m.admin)) return null;
  return { ...m, room: await namedRoom(r) };
}

export async function createRoomAction(input: { name: string; intro: string }): Promise<CollabResult> {
  const m = await me();
  const data = { name: String(input.name ?? "").trim(), intro: String(input.intro ?? "").trim() };
  const bad = checkRoom(data) ?? (await identityProblem(`${data.name}\n${data.intro}`));
  if (bad) return { ok: false, error: bad };
  try {
    const id = await repo.createRoom(m.id, data);
    await repo.audit(m.id, "collab.room.create", data.name);
    touch(id);
    return { ok: true, id };
  } catch (e) { return err(e, "방을 만들지 못했어요"); }
}

export async function updateRoomAction(roomId: string, input: { name: string; intro: string }): Promise<CollabResult> {
  const m = await myRoom(roomId);
  if (!m || !canManageRoom(m.room, m)) return { ok: false, error: "방장만 고칠 수 있어요" };
  const data = { name: String(input.name ?? "").trim(), intro: String(input.intro ?? "").trim() };
  const bad = checkRoom(data) ?? (await identityProblem(`${data.name}\n${data.intro}`));
  if (bad) return { ok: false, error: bad };
  try { await repo.updateRoom(m.room.id, data); } catch (e) { return err(e, "고치지 못했어요"); }
  touch(m.room.id);
  return { ok: true, id: m.room.id };
}

export async function closeRoomAction(roomId: string): Promise<CollabResult> {
  const m = await myRoom(roomId);
  if (!m || !canManageRoom(m.room, m)) return { ok: false, error: "방장만 닫을 수 있어요" };
  try { await repo.closeRoom(m.room.id); } catch (e) { return err(e, "닫지 못했어요"); }
  await repo.audit(m.id, "collab.room.close", m.room.name);
  touch();
  return { ok: true, id: m.room.id };
}

/** 초대: 멤버 누구나 우리 학교 선생님을 넣는다 (교과 · 학년 무관) */
export async function inviteAction(roomId: string, teacherIds: string[]): Promise<CollabResult> {
  const m = await myRoom(roomId);
  if (!m) return { ok: false, error: "방 멤버만 초대할 수 있어요" };
  const teachers = await repo.listTeachers();
  const ids = [...new Set((teacherIds ?? []).map(String))].filter((t) => teachers.some((x) => x.id === t) && !m.room.members.some((x) => x.teacherId === t));
  if (!ids.length) return { ok: false, error: "초대할 선생님을 골라 주세요" };
  if (m.room.members.length + ids.length > COLLAB_LIMITS.members) return { ok: false, error: `한 방은 ${COLLAB_LIMITS.members}명까지예요` };
  try { await repo.addMembers(m.room.id, ids); } catch (e) { return err(e, "초대하지 못했어요"); }
  await repo.audit(m.id, "collab.invite", `${m.room.name} ${ids.length}명`);
  touch(m.room.id);
  return { ok: true, id: m.room.id };
}

/** 나가기(나) · 내보내기(방장). 방장은 나갈 수 없고 방을 닫는다 */
export async function removeMemberAction(roomId: string, teacherId: string): Promise<CollabResult> {
  const m = await myRoom(roomId);
  if (!m) return { ok: false, error: "방을 찾지 못했어요" };
  const self = teacherId === m.id;
  if (!self && !canManageRoom(m.room, m)) return { ok: false, error: "방장만 내보낼 수 있어요" };
  if (teacherId === m.room.ownerId) return { ok: false, error: "방장은 나갈 수 없어요 · 방 닫기를 써 주세요" };
  try { await repo.removeMember(m.room.id, String(teacherId)); } catch (e) { return err(e, "처리하지 못했어요"); }
  touch(m.room.id);
  return { ok: true, id: m.room.id };
}

const cleanMeta = (kind: string, meta?: CollabMeta): CollabMeta => ({
  ...(meta?.date ? { date: String(meta.date) } : {}),
  ...(meta?.subject ? { subject: String(meta.subject).trim().slice(0, 30) } : {}),
  ...(kind === "프롬프트" && meta?.area && isStyleArea(meta.area) ? { area: meta.area } : {}),
  ...(kind === "자료" && meta?.url ? { url: String(meta.url).trim() } : {}),
});

/** 올리기 · 고치기 (다른 화면의 "협업방에 올리기"도 이걸 쓴다) */
export async function saveItemAction(input: { id?: string; roomId: string; kind: string; title: string; body: string; meta?: CollabMeta }): Promise<CollabResult> {
  const m = await myRoom(input.roomId);
  if (!m) return { ok: false, error: "방 멤버만 올릴 수 있어요" };
  const kind = String(input.kind) as CollabItem["kind"];
  const data = { kind, title: String(input.title ?? "").trim(), body: String(input.body ?? "").trim(), meta: cleanMeta(kind, input.meta) };
  const bad = checkItem(data) ?? (await identityProblem(`${data.title}\n${data.body}`));
  if (bad) return { ok: false, error: bad };
  try {
    if (input.id) {
      const it = (await repo.listItems([m.room.id])).find((x) => x.id === input.id);
      if (!it || !canEditItem(it, m.room, m)) return { ok: false, error: "고칠 수 없는 글이에요" };
      await repo.updateItem(it.id, { ...data, kind: it.kind }, m.name);
      touch(m.room.id);
      return { ok: true, id: it.id };
    }
    const id = await repo.addItem(m.room.id, { id: m.id, name: m.name }, data);
    await repo.audit(m.id, "collab.item.add", `${m.room.name} ${data.kind} ${data.title}`);
    touch(m.room.id);
    return { ok: true, id };
  } catch (e) { return err(e, "저장하지 못했어요"); }
}

export async function deleteItemAction(roomId: string, id: string): Promise<CollabResult> {
  const m = await myRoom(roomId);
  if (!m) return { ok: false, error: "방을 찾지 못했어요" };
  const it = (await repo.listItems([m.room.id])).find((x) => x.id === String(id));
  if (!it || !canDeleteItem(it, m.room, m)) return { ok: false, error: "올린 선생님 · 방장만 지울 수 있어요" };
  try { await repo.deleteItem(it.id); } catch (e) { return err(e, "지우지 못했어요"); }
  touch(m.room.id);
  return { ok: true, id: it.id };
}

/** 방 프롬프트 → 내 스타일에 넣기 (레퍼런스는 그대로) */
export async function applyRoomPrompt(roomId: string, id: string): Promise<{ ok: true; area: StyleArea } | { ok: false; error: string }> {
  const m = await myRoom(roomId);
  if (!m) return { ok: false, error: "방을 찾지 못했어요" };
  const it = (await repo.listItems([m.room.id])).find((x) => x.id === String(id) && x.kind === "프롬프트");
  if (!it) return { ok: false, error: "프롬프트를 찾지 못했어요" };
  const area: StyleArea = isStyleArea(it.meta.area) ? it.meta.area : "세특";
  if (!fitsStyle(it.body)) return { ok: false, error: `내 스타일에는 ${STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자까지 들어가요` };
  try {
    const cur = await repo.getWritingStyle(m.id, area);
    await repo.saveWritingStyle(m.id, area, { prompt: it.body, refs: cur.refs });
  } catch (e) { return err(e, "내 스타일에 넣지 못했어요"); }
  await repo.audit(m.id, "collab.prompt.use", `${m.room.name} ${it.title}`);
  return { ok: true, area };
}

/** 다른 화면의 "협업방에 올리기" 고르기용: 내가 든 방 이름 */
export async function myRoomsLite(): Promise<{ id: string; name: string }[]> {
  const m = await me().catch(() => null);
  if (!m) return [];
  return (await repo.listRooms(m.id)).map((r) => ({ id: r.id, name: r.name }));
}

/** 수행평가 등록 창 "협업방에서 가져오기": 내가 든 방의 수행평가 */
export async function roomAssessments(): Promise<{ id: string; title: string; date: string | null; description: string; who: string; where: string }[]> {
  const m = await me().catch(() => null);
  if (!m) return [];
  const rooms = await repo.listRooms(m.id);
  const items = (await repo.listItems(rooms.map((r) => r.id))).filter((x) => x.kind === "수행평가");
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30).map((x) => ({
    id: x.id, title: x.title.slice(0, 40), date: x.meta.date ?? null, description: x.body.slice(0, 500),
    who: x.authorName, where: `협업방 · ${rooms.find((r) => r.id === x.roomId)?.name ?? ""}${x.meta.subject ? ` · ${x.meta.subject}` : ""}`,
  }));
}

