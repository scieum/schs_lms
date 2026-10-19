import { describe, expect, it } from "vitest";
import { activityTag, cleanActivity, leadWithActivity, stripActivity, withActivity } from "./activity-name";

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
  it("이미 '○○에서'로 시작하면 '활동명의'로 (에서 겹침 막기)", () => {
    expect(leadWithActivity("산화 환원 실험", "철 못 부식 실험에서 변인을 정함.")).toBe("산화 환원 실험의 철 못 부식 실험에서 변인을 정함.");
  });
  it("띄어쓰기만 다른 활동명은 다시 붙이지 않음", () => {
    expect(leadWithActivity("빗면 실험 탐구", "빗면실험 탐구에서 설계함.")).toBe("빗면실험 탐구에서 설계함.");
  });
  it("조각의 [활동명] 읽기·떼기", () => {
    expect(activityTag("[빗면 실험]  측정함.")).toBe("빗면 실험");
    expect(activityTag("측정함.")).toBeNull();
    expect(stripActivity("[빗면 실험] 측정함.")).toBe("측정함.");
  });
  it("대괄호·공백 정리, 40자", () => {
    expect(cleanActivity("  [빗면]   실험 ")).toBe("빗면 실험");
    expect(cleanActivity("가".repeat(50))).toHaveLength(40);
  });
});
