import { describe, expect, it } from "vitest";
import { cleanStyle, hasStyle, styleAreaOf, styleTone } from "./writing-style";

describe("내 스타일 (N58)", () => {
  it("영역: 자율 · 동아리 · 진로는 창체 하나", () => {
    expect(styleAreaOf("세특")).toBe("세특");
    expect(styleAreaOf("동아리")).toBe("창체");
    expect(styleAreaOf("자율·자치")).toBe("창체");
    expect(styleAreaOf("행발")).toBe("행발");
  });
  it("정리: 빈 레퍼런스 빼기 · 개수 · 길이", () => {
    expect(cleanStyle({ prompt: " 짧게 ", refs: ["", " 예시 글 ", "  "] })).toEqual({ prompt: "짧게", refs: ["예시 글"] });
    expect(cleanStyle({ prompt: "", refs: ["a", "b", "c", "d"] })).toEqual({ error: "레퍼런스는 3개까지예요" });
    expect("error" in cleanStyle({ prompt: "가".repeat(2001), refs: [] })).toBe(true);
  });
  it("프롬프트에 붙일 글: 없으면 빈 글, 있으면 학교 규칙 먼저 · 내용 가져오지 않기", () => {
    expect(hasStyle({ prompt: " ", refs: [""] })).toBe(false);
    expect(styleTone({ prompt: "", refs: [] })).toBe("");
    const t = styleTone({ prompt: "한 문장 80자", refs: ["예시 하나"] });
    expect(t).toContain("<내 프롬프트>\n한 문장 80자");
    expect(t).toContain("<예시 1>\n예시 하나");
    expect(t).toContain("학교 규칙을 따른다");
    expect(t).toContain("절대 가져오지 않는다");
  });
});
