import { describe, expect, it } from "vitest";
import { CURRICULUM_2022, matchSubject, schoolYear, subjectsOf } from "./curriculum";

describe("2022 개정 과목 목록", () => {
  it("과목 이름이 겹치지 않는다", () => {
    const names = CURRICULUM_2022.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("교과별로 고를 수 있다", () => {
    const sci = subjectsOf("과학");
    expect(sci.filter((s) => s.type === "공통").map((s) => s.name)).toEqual(["통합과학1", "통합과학2", "과학탐구실험1", "과학탐구실험2"]);
    expect(sci.some((s) => s.name === "과학의 역사와 문화")).toBe(true);
    expect(subjectsOf("체육").some((s) => s.type === "공통")).toBe(false);
  });
});

describe("편제표 이름 맞추기", () => {
  it("공백·로마 숫자 차이를 무시한다", () => {
    expect(matchSubject("미적분 I")?.name).toBe("미적분Ⅰ");
    expect(matchSubject("영어II")?.name).toBe("영어Ⅱ");
    expect(matchSubject("확률과통계")?.name).toBe("확률과 통계");
    expect(matchSubject("공통 국어 1")?.name).toBe("공통국어1");
  });
  it("2022 개정에 없는 과목은 null (학교 지정 과목)", () => {
    expect(matchSubject("물리학Ⅰ")).toBeNull();
    expect(matchSubject("고급 물리학")).toBeNull();
  });
});

describe("학년도", () => {
  it("3월에 바뀐다", () => {
    expect(schoolYear(new Date(2027, 1, 20))).toBe(2026);
    expect(schoolYear(new Date(2027, 2, 2))).toBe(2027);
  });
});
