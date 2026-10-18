import { describe, expect, it } from "vitest";
import { cleanActivity, leadWithActivity, withActivity } from "./activity-name";

describe("활동명 (N27)", () => {
  it("조각·요약은 [활동명] 으로 시작, 두 번 붙이지 않음", () => {
    expect(withActivity("빗면 실험 탐구", "경사각을 바꿔 측정함.")).toBe("[빗면 실험 탐구] 경사각을 바꿔 측정함.");
    expect(withActivity("빗면 실험 탐구", "[빗면 실험 탐구] 측정함.")).toBe("[빗면 실험 탐구] 측정함.");
    expect(withActivity("새 이름", "[옛 이름] 측정함.")).toBe("[새 이름] 측정함.");
    expect(withActivity("", "측정함.")).toBe("측정함.");
  });
  it("초안은 활동명에서 … 로 시작 (이미 있으면 그대로)", () => {
    expect(leadWithActivity("빗면 실험 탐구", "경사각을 독립 변인으로 정함. 오차를 줄임.")).toBe("빗면 실험 탐구에서 경사각을 독립 변인으로 정함. 오차를 줄임.");
    expect(leadWithActivity("빗면 실험 탐구", "빗면 실험 탐구에서 설계함.")).toBe("빗면 실험 탐구에서 설계함.");
    expect(leadWithActivity("빗면 실험 탐구", "[빗면 실험 탐구] 설계함.")).toBe("빗면 실험 탐구에서 설계함.");
  });
  it("대괄호·공백 정리, 40자", () => {
    expect(cleanActivity("  [빗면]   실험 ")).toBe("빗면 실험");
    expect(cleanActivity("가".repeat(50))).toHaveLength(40);
  });
});
