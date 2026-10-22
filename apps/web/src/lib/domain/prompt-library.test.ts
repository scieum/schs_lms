import { describe, expect, it } from "vitest";
import { canEditPrompt, checkPrompt, filterPrompts, fitsStyle, promptsOf, type PromptDoc } from "./prompt-library";

const P = (over: Partial<PromptDoc>): PromptDoc => ({
  id: "x", official: false, public: true, area: "세특", subject: "화학Ⅱ", title: "탐구형", body: "탐구 과정을 순서대로 쓴다", authorId: "t1", authorName: "가 선생님",
  stars: 0, starred: false, createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z", ...over,
});

describe("프롬프트 보관함", () => {
  const list = [
    P({ id: "off", official: true, authorId: null }),
    P({ id: "app", official: true, builtin: true, authorId: null }),
    P({ id: "a", stars: 1, createdAt: "2026-10-23T00:00:00Z" }),
    P({ id: "b", stars: 5, authorId: "t2" }),
    P({ id: "c", stars: 1, area: "행발", subject: null }),
    P({ id: "mine-private", public: false }),
  ];

  it("탭: 공식(+앱 기본) · 공유(공개만) · 내 프롬프트(비공개 포함)", () => {
    expect(promptsOf(list, "공식", "t1").map((p) => p.id)).toEqual(["off", "app"]);
    expect(promptsOf(list, "공유", "t1").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(promptsOf(list, "내 프롬프트", "t1").map((p) => p.id)).toEqual(["a", "c", "mine-private"]);
  });

  it("공유는 별 많은 순, 같으면 최신 · 영역 · 찾기", () => {
    const shared = promptsOf(list, "공유", "t1");
    expect(filterPrompts(shared, { tab: "공유" }).map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(filterPrompts(shared, { tab: "공유", area: "행발" }).map((p) => p.id)).toEqual(["c"]);
    expect(filterPrompts(shared, { tab: "공유", text: "화학" })).toHaveLength(2);
    expect(filterPrompts(promptsOf(list, "공식", "t1"), { tab: "공식" })[1].id).toBe("app");
  });

  it("고치기: 쓴 선생님 · 관리자, 공식은 관리자만, 앱 기본은 아무도", () => {
    expect(canEditPrompt(P({}), { id: "t1", admin: false })).toBe(true);
    expect(canEditPrompt(P({}), { id: "t2", admin: false })).toBe(false);
    expect(canEditPrompt(P({ official: true }), { id: "t1", admin: false })).toBe(false);
    expect(canEditPrompt(P({ official: true }), { id: "t9", admin: true })).toBe(true);
    expect(canEditPrompt(P({ builtin: true, official: true }), { id: "t9", admin: true })).toBe(false);
  });

  it("검사 · 내 스타일 길이", () => {
    expect(checkPrompt({ official: false, public: true, area: "기타", subject: null, title: "제목", body: "열 글자 이상인 프롬프트" })).toMatch(/영역/);
    expect(checkPrompt({ official: false, public: true, area: "세특", subject: null, title: "제목", body: "짧음" })).toMatch(/10자/);
    expect(checkPrompt({ official: false, public: true, area: "세특", subject: "화학", title: "제목", body: "열 글자 이상인 프롬프트" })).toBeNull();
    expect(fitsStyle("가".repeat(2000))).toBe(true);
    expect(fitsStyle("가".repeat(2001))).toBe(false);
  });
});
