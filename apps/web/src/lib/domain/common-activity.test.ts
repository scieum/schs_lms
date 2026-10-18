import { describe, expect, it } from "vitest";
import { classScope, clubScope, commonScope, fileTokens, isCommonScope, matchFile, matchFiles, matchSummary, parseScope, progressChip, setukScope } from "./common-activity";

const S = [
  { id: "a", studentNo: "20111", name: "한지민" },
  { id: "b", studentNo: "20203", name: "최지우" },
  { id: "c", studentNo: "20301", name: "강예린" },
  { id: "d", studentNo: "20302", name: "강예린" },
];

describe("공통 활동 범위", () => {
  it("만들고 다시 읽는다", () => {
    expect(parseScope(setukScope("c-4"))).toEqual({ kind: "세특", courseId: "c-4", section: null });
    expect(parseScope(setukScope("c-4", "1분반"))).toEqual({ kind: "세특", courseId: "c-4", section: "1분반" });
    expect(parseScope(classScope("자율·자치", 2, 3))).toEqual({ kind: "자율·자치", grade: 2, classNo: 3 });
    expect(parseScope(classScope("행발", 1, 12))).toEqual({ kind: "행발", grade: 1, classNo: 12 });
    expect(parseScope(clubScope("club-1"))).toEqual({ kind: "동아리", clubId: "club-1" });
    expect(parseScope("진로:2반")).toBeNull();
    expect(parseScope("세특:")).toBeNull();
    expect(parseScope("아무거나")).toBeNull();
  });
  it("공통 메모 범위", () => {
    expect(commonScope("세특:c-4")).toBe("세특:c-4#공통");
    expect(isCommonScope("세특:c-4#공통")).toBe(true);
    expect(isCommonScope("세특:c-4#조각")).toBe(false);
  });
});

describe("파일 이름으로 학생 맞추기", () => {
  it("낱말로 나눈다", () => {
    expect(fileTokens("20111한지민_보고서(1).pdf")).toEqual(["20111", "한지민", "보고서", "1"]);
  });
  it("학번으로", () => {
    expect(matchFile("20111_보고서.pdf", S)).toBe("a");
    expect(matchFile("20203.jpg", S)).toBe("b");
  });
  it("이름으로 (같은 이름 둘이면 모름)", () => {
    expect(matchFile("최지우 빗면실험.hwpx", S)).toBe("b");
    expect(matchFile("강예린_보고서.pdf", S)).toBeNull();
    expect(matchFile("20302_강예린.pdf", S)).toBe("d");
  });
  it("학번과 이름이 다른 학생이면 모름", () => {
    expect(matchFile("20111_최지우.txt", S)).toBeNull();
  });
  it("6자리 숫자·이름 일부는 맞추지 않는다", () => {
    expect(matchFile("201110.pdf", S)).toBeNull();
    expect(matchFile("한지민민.pdf", S)).toBeNull();
    expect(matchFile("보고서(1).hwpx", S)).toBeNull();
  });
  it("요약", () => {
    const m = matchFiles(["20111_한지민.txt", "20203.txt", "모름.txt"], S);
    expect(matchSummary(m, S.map((s) => s.id))).toEqual({ matched: 2, missing: 2, unknown: 1 });
  });
  it("진행 칩", () => {
    expect(progressChip(0, 24)).toEqual({ label: "자료 없음", tone: "none" });
    expect(progressChip(20, 24)).toEqual({ label: "조각 20/24", tone: "key" });
    expect(progressChip(24, 24)).toEqual({ label: "조각 24/24", tone: "ok" });
  });
});
