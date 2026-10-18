import { describe, expect, it } from "vitest";
import { applyTraits, composeTraitLog, endSentence, FEATURE_TRAITS, LEVEL_TRAITS, makeCustomTrait } from "./trait-logs";

const A = "과학의 날 실험 부스";
const shared = "부스 운영 계획을 세우고 실험을 시연함";

describe("누가기록 한꺼번에 쓰기 (N28)", () => {
  it("공통 문장 끝에 마침표를 붙이고 [활동명] 으로 시작", () => {
    expect(composeTraitLog({ activity: A, shared, features: [] })).toBe("[과학의 날 실험 부스] 부스 운영 계획을 세우고 실험을 시연함.");
  });
  it("참여도 → 특징(팔레트 순서) 순으로 붙인다", () => {
    expect(composeTraitLog({ activity: A, shared: `${shared}.`, level: "active", features: ["research", "question"] })).toBe(
      "[과학의 날 실험 부스] 부스 운영 계획을 세우고 실험을 시연함. 활동에 적극적으로 참여함. 궁금한 점을 질문하며 원리를 확인함. 필요한 자료를 찾아 정리함.",
    );
  });
  it("같은 문장은 한 번만, 모르는 id 는 무시", () => {
    const t = composeTraitLog({ activity: A, shared: "어려움이 있어도 끝까지 마무리함.", features: ["finish", "finish", "nope"], level: "nope" });
    expect(t).toBe("[과학의 날 실험 부스] 어려움이 있어도 끝까지 마무리함.");
  });
  it("교사가 더한 특징은 팔레트 끝 순서로 붙는다", () => {
    const c = makeCustomTrait("관람 안내", "관람객에게 원리를 설명함", [...LEVEL_TRAITS, ...FEATURE_TRAITS])!;
    expect(c.sentence).toBe("관람객에게 원리를 설명함.");
    const palette = [...LEVEL_TRAITS, ...FEATURE_TRAITS, c];
    expect(composeTraitLog({ activity: A, shared, features: [c.id, "present"] }, palette)).toBe(
      "[과학의 날 실험 부스] 부스 운영 계획을 세우고 실험을 시연함. 결과를 정리해 발표함. 관람객에게 원리를 설명함.",
    );
    expect(makeCustomTrait("발표", "또 발표함", palette)).toBeNull();
    expect(makeCustomTrait("", "문장", palette)).toBeNull();
    expect(makeCustomTrait("이름", "", palette)).toBeNull();
  });
  it("일괄 넣기: 참여도는 바꾸고 특징은 더한다", () => {
    expect(applyTraits({ level: "lead", features: ["record"] }, { level: "sincere", features: ["finish", "record"] })).toEqual({ level: "sincere", features: ["record", "finish"] });
    expect(applyTraits({ level: "lead", features: [] }, { features: ["finish"] })).toEqual({ level: "lead", features: ["finish"] });
    expect(applyTraits(undefined, { features: ["help"] })).toEqual({ level: undefined, features: ["help"] });
  });
  it("endSentence", () => {
    expect(endSentence("  참여함  ")).toBe("참여함.");
    expect(endSentence("참여함.")).toBe("참여함.");
    expect(endSentence("")).toBe("");
  });
});
