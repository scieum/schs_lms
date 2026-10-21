import { describe, expect, it } from "vitest";
import { joinParagraphs, paragraphCount, splitParagraphs } from "./paragraphs";

describe("문단 나누기 (N56)", () => {
  it("[활동명] · 이어지는 말에서 나눈다 (문단마다 2문장 이상)", () => {
    const t = "[빗면 실험] 각도를 바꾸며 측정함. 오차를 마찰로 설명함. 또한 보고서에 변인을 정리함. 한계를 적음. [발표] 결과를 3분 동안 발표함.";
    const out = splitParagraphs(t);
    expect(out.split("\n")).toEqual(["[빗면 실험] 각도를 바꾸며 측정함. 오차를 마찰로 설명함.", "또한 보고서에 변인을 정리함. 한계를 적음.", "[발표] 결과를 3분 동안 발표함."]);
    expect(paragraphCount(out)).toBe(3);
  });
  it("나눌 말이 없으면 비슷한 길이로 (4문장 → 2문단)", () => {
    const out = splitParagraphs("가 함. 나 함. 다 함. 라 함.");
    expect(out).toBe("가 함. 나 함.\n다 함. 라 함.");
  });
  it("근거가 있으면 조각별로 (직접 쓴 문장은 앞 문단에) · 빈 줄 없음", () => {
    const t = "실험을 설계함. 변인을 통제함. 발표를 준비함. 질문에 답함.";
    const at = (x: string) => ({ start: t.indexOf(x), end: t.indexOf(x) + x.length });
    const out = splitParagraphs(t, [{ ...at("실험을 설계함."), key: "p1" }, { ...at("변인을 통제함."), key: null }, { ...at("발표를 준비함."), key: "p2" }, { ...at("질문에 답함."), key: "p2" }]);
    expect(out).toBe("실험을 설계함. 변인을 통제함.\n발표를 준비함. 질문에 답함.");
    expect(out).not.toContain("\n\n");
    expect(paragraphCount(out)).toBe(2);
    expect(joinParagraphs(out)).toBe(t);
  });
  it("짧은 글은 그대로 · 다시 붙이면 처음과 같다", () => {
    expect(splitParagraphs("한 문장만 있음.")).toBe("한 문장만 있음.");
    const t = "[A] 하나 함. 둘 함. 또한 셋 함. 넷 함.";
    expect(joinParagraphs(splitParagraphs(t))).toBe(t);
    expect(joinParagraphs("앞 문단.\n\n  뒤 문단.\n")).toBe("앞 문단. 뒤 문단.");
  });
});
