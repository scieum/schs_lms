// 협업방 (Figma N69, 2026-10-22): 사이드바 대분류 "협업". 동학년부가 아니어도 · 교과가 달라도 누구나 방을 만들고 선생님을 초대한다.
// 방에 올리는 것 = 메모(멤버 모두 고침) · 수행평가 · 차시별 활동 · 프롬프트 · 자료(링크 · 글). 가져가기는 내 수업에 복사(원본은 그대로).
// 학생 이름 · 학번은 올리기 전에 막는다. 지우기는 숨김(deleted_at, C4).

export const COLLAB_KINDS = ["메모", "수행평가", "차시", "프롬프트", "자료"] as const;
export type CollabKind = (typeof COLLAB_KINDS)[number];
export const isCollabKind = (v: unknown): v is CollabKind => (COLLAB_KINDS as readonly string[]).includes(String(v));
export const KIND_LABEL: Record<CollabKind, string> = { 메모: "메모", 수행평가: "수행평가", 차시: "차시별 활동", 프롬프트: "프롬프트", 자료: "자료" };

export type CollabMember = { teacherId: string; name: string; dept: string | null; owner: boolean };
export type CollabRoom = { id: string; name: string; intro: string; ownerId: string; createdAt: string; members: CollabMember[] };

/** 종류마다 덧붙는 칸: 날짜(수행평가 · 차시) · 영역(프롬프트) · 링크(자료) · 과목 */
export type CollabMeta = { date?: string | null; area?: string | null; url?: string | null; subject?: string | null };
export type CollabItem = {
  id: string; roomId: string; kind: CollabKind; title: string; body: string; meta: CollabMeta;
  authorId: string | null; authorName: string; editorName: string | null; createdAt: string; updatedAt: string;
};

export const COLLAB_LIMITS = { name: 40, intro: 200, title: 80, body: 4000, url: 500, members: 50 } as const;

export function checkRoom(input: { name: string; intro: string }): string | null {
  const name = input.name.trim();
  if (name.length < 2) return "방 이름을 2자 이상 써 주세요";
  if (name.length > COLLAB_LIMITS.name) return `방 이름은 ${COLLAB_LIMITS.name}자까지예요`;
  if (input.intro.trim().length > COLLAB_LIMITS.intro) return `소개는 ${COLLAB_LIMITS.intro}자까지예요`;
  return null;
}

export function checkItem(input: { kind: string; title: string; body: string; meta?: CollabMeta }): string | null {
  if (!isCollabKind(input.kind)) return "종류를 골라 주세요";
  const title = input.title.trim(), body = input.body.trim();
  if (title.length < 2) return "제목을 2자 이상 써 주세요";
  if (title.length > COLLAB_LIMITS.title) return `제목은 ${COLLAB_LIMITS.title}자까지예요`;
  if (body.length > COLLAB_LIMITS.body) return `내용은 ${COLLAB_LIMITS.body.toLocaleString("ko-KR")}자까지예요`;
  if (input.kind === "자료") {
    const url = (input.meta?.url ?? "").trim();
    if (!url && body.length < 2) return "링크나 내용을 적어 주세요";
    if (url && !/^https?:\/\/\S+$/i.test(url)) return "링크는 http:// 나 https:// 로 시작해야 해요";
    if (url.length > COLLAB_LIMITS.url) return "링크가 너무 길어요";
  } else if (body.length < 2) return "내용을 2자 이상 써 주세요";
  if (input.meta?.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.meta.date)) return "날짜를 확인해 주세요";
  return null;
}

/** 멤버만 방을 본다 */
export const isMember = (room: Pick<CollabRoom, "members">, teacherId: string) => room.members.some((m) => m.teacherId === teacherId);
/** 방 이름 · 소개 고치기 · 멤버 내보내기 · 방 닫기: 방장 · 관리자 */
export const canManageRoom = (room: Pick<CollabRoom, "ownerId">, me: { id: string; admin: boolean }) => me.admin || room.ownerId === me.id;
/** 고치기: 메모는 멤버 모두, 그 밖은 올린 선생님 · 방장. 지우기는 올린 선생님 · 방장 */
export function canEditItem(item: Pick<CollabItem, "kind" | "authorId">, room: Pick<CollabRoom, "ownerId" | "members">, me: { id: string; admin: boolean }): boolean {
  if (!isMember(room, me.id) && !me.admin) return false;
  return item.kind === "메모" || item.authorId === me.id || canManageRoom(room, me);
}
export const canDeleteItem = (item: Pick<CollabItem, "authorId">, room: Pick<CollabRoom, "ownerId">, me: { id: string; admin: boolean }) => item.authorId === me.id || canManageRoom(room, me);

/** 종류 · 찾기 거르기 (최근 고친 것 위) */
export function filterItems(list: CollabItem[], q: { kind?: string | null; text?: string | null }): CollabItem[] {
  const words = (q.text ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((x) => !q.kind || q.kind === "전체" || x.kind === q.kind)
    .filter((x) => words.every((w) => `${x.title} ${x.body} ${x.meta.subject ?? ""} ${x.authorName}`.toLowerCase().includes(w)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const kindCounts = (list: CollabItem[]): Record<string, number> =>
  Object.fromEntries([["전체", list.length], ...COLLAB_KINDS.map((k) => [k, list.filter((x) => x.kind === k).length])]);
