import { describe, expect, it } from "vitest";
import { defaultLogStep, defaultWriteStep, parseStep, stepState, stepStorageKey, withStepParam } from "./write-step";

describe("기록 쓰기 첫 단계 (N48)", () => {
  it("메모가 없고 글도 없으면 ①", () => {
    expect(defaultWriteStep({ memos: 0, hasBody: false })).toBe(1);
  });
  it("메모가 있고 글이 없으면 ②", () => {
    expect(defaultWriteStep({ memos: 3, hasBody: false })).toBe(2);
  });
  it("글이 있으면 메모 수와 상관없이 ③ (확정한 글도 ③ 읽기)", () => {
    expect(defaultWriteStep({ memos: 0, hasBody: true })).toBe(3);
    expect(defaultWriteStep({ memos: 5, hasBody: true })).toBe(3);
    expect(defaultWriteStep({ memos: null, hasBody: true })).toBe(3);
  });
  it("반 전체 검사에서 열면 ③", () => {
    expect(defaultWriteStep({ memos: 0, hasBody: false, openCheck: true })).toBe(3);
  });
  it("행발(키워드로 쓰기)은 글이 없으면 메모 수와 상관없이 ②", () => {
    expect(defaultWriteStep({ memos: 0, hasBody: false, keywordFirst: true })).toBe(2);
    expect(defaultWriteStep({ memos: null, hasBody: false, keywordFirst: true })).toBe(2);
    expect(defaultWriteStep({ memos: 0, hasBody: true, keywordFirst: true })).toBe(3);
  });
  it("메모를 불러오는 중이면 아직 정하지 않음", () => {
    expect(defaultWriteStep({ memos: null, hasBody: false })).toBeNull();
  });
});

describe("누가기록 첫 단계 (N48)", () => {
  it("고른 학생이 없으면 ① · 있으면 ②", () => {
    expect(defaultLogStep(0)).toBe(1);
    expect(defaultLogStep(4)).toBe(2);
  });
});

describe("단계 값 다루기", () => {
  it("1·2·3만 받는다", () => {
    expect(parseStep("1")).toBe(1);
    expect(parseStep("3")).toBe(3);
    expect(parseStep("4")).toBeNull();
    expect(parseStep("")).toBeNull();
    expect(parseStep(null)).toBeNull();
    expect(parseStep(undefined)).toBeNull();
  });
  it("지금 단계가 먼저, 아니면 끝/아직", () => {
    expect(stepState(2, 2, true)).toBe("current");
    expect(stepState(1, 2, true)).toBe("done");
    expect(stepState(3, 2, false)).toBe("todo");
  });
  it("주소 줄은 step 만 바꾸고 나머지는 그대로", () => {
    expect(withStepParam("?course=c1&student=s9", 2)).toBe("?course=c1&student=s9&step=2");
    expect(withStepParam("?course=c1&step=1", 3)).toBe("?course=c1&step=3");
    expect(withStepParam("", 1)).toBe("?step=1");
  });
  it("기억 열쇠에는 학생 id만", () => {
    expect(stepStorageKey("setuk:c1", "s9")).toBe("schs.write-step.setuk:c1.s9");
  });
});
