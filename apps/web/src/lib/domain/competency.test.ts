import { describe, expect, it } from "vitest";
import { applyTags, competencySummary, tagByRules } from "./competency";

describe("역량 보기", () => {
  const text = "빗면 실험에서 변인을 통제하고 오차를 분석함. 모둠 토의에서 친구들의 의견을 경청하며 결론을 함께 정리함. 신소재공학 진로와 연계해 반도체 소자를 조사함. 수업에 참여함.";

  it("낱말 규칙으로 문장마다 역량을 고른다", () => {
    const t = tagByRules(text);
    expect(t.map((x) => x.competency)).toEqual(["학업", "공동체", "진로", null]);
    expect(t[0].sub).toBe("탐구력");
    expect(t[1].sub).toBe("협업과 소통능력");
  });

  it("AI 결과를 문장 번호로 붙이고 없는 항목은 첫 항목으로", () => {
    const t = applyTags(text, [{ index: 0, competency: "학업", sub: "탐구력" }, { index: 2, competency: "진로", sub: "모름" }, { index: 3, competency: "기타", sub: null }]);
    expect(t.map((x) => [x.competency, x.sub])).toEqual([["학업", "탐구력"], [null, null], ["진로", "전공(계열) 관련 교과 이수 노력"], [null, null]]);
  });

  it("역량별 문장 수와 빠진 역량", () => {
    const s = competencySummary(tagByRules("오차를 분석함. 실험을 설계함."));
    expect(s.counts).toEqual({ 학업: 2, 진로: 0, 공동체: 0 });
    expect(s.missing).toEqual(["진로", "공동체"]);
  });
});
