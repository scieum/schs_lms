import { describe, expect, it } from "vitest";
import { hasBatchim, polishStyle, styleIssues } from "./neis-style";

describe("생기부 문체 규칙", () => {
  it("받침에 따라 와/과를 고른다", () => {
    expect(hasBatchim("발표")).toBe(false);
    expect(hasBatchim("실험")).toBe(true);
  });

  it("가운데 점을 와/과로 풀어 쓴다", () => {
    expect(polishStyle("실험·발표·토론에 참여함.")).toBe("실험과 발표와 토론에 참여함.");
  });

  it("줄바꿈과 문장을 감싼 따옴표를 정리하고 끝에 마침표를 붙인다", () => {
    expect(polishStyle("“자료를 비교함.”\n가설을 수정함")).toBe("자료를 비교함. 가설을 수정함.");
  });

  it("고치지 못한 위반을 찾는다", () => {
    expect(styleIssues("학생은 실험을 설계했다.")).toEqual(expect.arrayContaining(["학생 주어", "서술형 어미"]));
    expect(styleIssues("그는 자료를 정리함.")).toContain("그는·그가·그의");
    expect(styleIssues("자료를 비교하고 기준을 세워 결론을 정교화함.")).toEqual([]);
  });
});
