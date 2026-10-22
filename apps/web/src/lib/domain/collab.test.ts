import { describe, expect, it } from "vitest";
import { canDeleteItem, canEditItem, canManageRoom, checkItem, checkRoom, filterItems, kindCounts, type CollabItem } from "./collab";

const room = { ownerId: "o", members: [{ teacherId: "o", name: "방장", dept: null, owner: true }, { teacherId: "m", name: "멤버", dept: null, owner: false }] };
const I = (over: Partial<CollabItem>): CollabItem => ({ id: "x", roomId: "r", kind: "수행평가", title: "빗면 실험", body: "가속도 측정", meta: {}, authorId: "m", authorName: "멤버", editorName: null, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z", ...over });

describe("협업방 (N69)", () => {
  it("방 · 글 검사", () => {
    expect(checkRoom({ name: "가", intro: "" })).toMatch(/2자/);
    expect(checkRoom({ name: "융합 수업", intro: "" })).toBeNull();
    expect(checkItem({ kind: "잡담", title: "제목", body: "내용" })).toMatch(/종류/);
    expect(checkItem({ kind: "자료", title: "양식", body: "", meta: { url: "docs.google.com" } })).toMatch(/http/);
    expect(checkItem({ kind: "자료", title: "양식", body: "", meta: { url: "https://docs.google.com/x" } })).toBeNull();
    expect(checkItem({ kind: "메모", title: "일정", body: "" })).toMatch(/내용/);
  });

  it("권한: 메모는 멤버 모두 고침, 그 밖은 올린 사람 · 방장. 멤버 아니면 못 고침", () => {
    expect(canEditItem(I({ kind: "메모", authorId: "o" }), room, { id: "m", admin: false })).toBe(true);
    expect(canEditItem(I({ authorId: "o" }), room, { id: "m", admin: false })).toBe(false);
    expect(canEditItem(I({}), room, { id: "o", admin: false })).toBe(true);
    expect(canEditItem(I({ kind: "메모" }), room, { id: "z", admin: false })).toBe(false);
    expect(canDeleteItem(I({ kind: "메모", authorId: "o" }), room, { id: "m", admin: false })).toBe(false);
    expect(canManageRoom(room, { id: "m", admin: false })).toBe(false);
    expect(canManageRoom(room, { id: "m", admin: true })).toBe(true);
  });

  it("종류 · 찾기 거르기, 최근 고친 것 위", () => {
    const list = [I({ id: "a" }), I({ id: "b", kind: "메모", title: "일정", body: "11월 2주", updatedAt: "2026-10-23T00:00:00Z" })];
    expect(filterItems(list, {}).map((x) => x.id)).toEqual(["b", "a"]);
    expect(filterItems(list, { kind: "수행평가" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterItems(list, { text: "가속도" }).map((x) => x.id)).toEqual(["a"]);
    expect(kindCounts(list)).toMatchObject({ 전체: 2, 메모: 1, 수행평가: 1, 차시: 0 });
  });
});
