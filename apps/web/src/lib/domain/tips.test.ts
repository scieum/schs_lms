import { describe, expect, it } from "vitest";
import { canEditTip, checkTip, filterTips, SEED_TIPS, tipCounts, type Tip } from "./tips";

const tips: Tip[] = SEED_TIPS.map((t, i) => ({ ...t, createdAt: `2026-10-21T00:${String(59 - i).padStart(2, "0")}:00Z`, updatedAt: "" }));

describe("생기부 팁 (N57)", () => {
  it("처음 글 11개 · 분류마다 수", () => {
    expect(SEED_TIPS).toHaveLength(11);
    expect(new Set(SEED_TIPS.map((t) => t.id)).size).toBe(11);
    const c = tipCounts(tips);
    expect(c["전체"]).toBe(11);
    expect(c["구조"]).toBe(2);
    expect(c["문장"]).toBe(4);
  });
  it("검사: 분류 · 제목 · 내용 길이", () => {
    expect(checkTip({ category: "구조", title: "좋은 구조", body: "열 자가 넘는 내용입니다." })).toBeNull();
    expect(checkTip({ category: "없음", title: "좋은 구조", body: "열 자가 넘는 내용입니다." })).toMatch(/분류/);
    expect(checkTip({ category: "구조", title: "a", body: "열 자가 넘는 내용입니다." })).toMatch(/제목/);
    expect(checkTip({ category: "구조", title: "좋은 구조", body: "짧음" })).toMatch(/내용/);
  });
  it("찾기: 낱말 모두 들어간 것 · 분류 · 최신 위", () => {
    expect(filterTips(tips, { text: "DDAR" }).map((t) => t.id)).toEqual(["tip-ddar", "tip-mae"]);
    expect(filterTips(tips, { text: "기승전결" }).map((t) => t.id)).toEqual(["tip-ddar"]);
    expect(filterTips(tips, { category: "점검" }).map((t) => t.id)).toEqual(["tip-less-ai", "tip-checklist"]);
    expect(filterTips(tips, { text: "행동동사 협업" }).map((t) => t.id)).toContain("tip-verbs");
    expect(filterTips(tips, {})[0].id).toBe("tip-ddar");
  });
  it("고치기 권한: 본인 · 관리자, 처음 글은 관리자만", () => {
    expect(canEditTip({ authorId: "t1" }, { id: "t1", admin: false })).toBe(true);
    expect(canEditTip({ authorId: "t1" }, { id: "t2", admin: false })).toBe(false);
    expect(canEditTip({ authorId: null }, { id: "t2", admin: false })).toBe(false);
    expect(canEditTip({ authorId: null }, { id: "t2", admin: true })).toBe(true);
  });
});
