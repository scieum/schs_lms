import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { manualText } = await import("./qna-draft");

describe("문의 AI 초안 — 매뉴얼 글", () => {
  it("태그 · 스크립트 · 스타일을 빼고 줄을 남긴다", () => {
    const t = manualText(`<style>.a{}</style><h2>조각 &amp; 글</h2><ul><li>휴지통을 <b>눌러요</b></li><li>둘째</li></ul><script>x()</script>`);
    expect(t).toBe("조각 & 글\n휴지통을 눌러요\n둘째");
  });
});
