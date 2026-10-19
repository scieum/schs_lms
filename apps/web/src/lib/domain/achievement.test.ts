import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_SCALES, countLevels, guideLine, isLevel, levelIn, levelPrompt, scaleOf, toneLine } from "./achievement";

describe("성취수준 (N35 ③)", () => {
  it("단계: 기본 A~E, 학교 설정이면 상·중·하", () => {
    expect(scaleOf(undefined)).toBe("A-E");
    expect(scaleOf("상중하")).toBe("상중하");
    expect(ACHIEVEMENT_SCALES["A-E"].map((x) => x.level)).toEqual(["A", "B", "C", "D", "E"]);
    expect(ACHIEVEMENT_SCALES["상중하"].map((x) => x.level)).toEqual(["상", "중", "하"]);
    expect(levelIn("A-E", "B")).toBe(true);
    expect(levelIn("A-E", "상")).toBe(false);
    expect(levelIn("상중하", "중")).toBe(true);
    expect(isLevel("F")).toBe(false);
  });

  it("말투 한 줄: 상 = A, 중 = C, 하 = D", () => {
    expect(toneLine("B")).toBe("정확히 이해하고 성실하게 해냄");
    expect(toneLine("상")).toBe(toneLine("A"));
    expect(toneLine("중")).toBe(toneLine("C"));
    expect(toneLine("하")).toBe(toneLine("D"));
  });

  it("안내 줄 · 프롬프트", () => {
    expect(guideLine("B")).toBe("B · ‘정확히 이해하고 성실하게 해냄’ 쪽 말투로 써요 · 예: 정확하게 설명함 · 꼼꼼히 정리함");
    expect(guideLine(null)).toBe("안 고르면 사실 그대로 써요 · 메모에 없는 높은 평가는 하지 않아요");
    const p = levelPrompt("D");
    expect(p).toContain("성취수준 말투: 기본 개념을 익히려 꾸준히 노력함");
    expect(p).toContain("수준 글자(A~E/상중하)를 쓰지 않는다");
    expect(p).toContain("부정적인 말을 쓰지 않는다");
    expect(p).not.toMatch(/학생|가명/);
    expect(levelPrompt(null)).toBe("");
  });

  it("정한 학생 수", () => {
    expect(countLevels({ a: "B", b: null, c: "A" }, ["a", "b", "c", "d"])).toBe(2);
  });
});
