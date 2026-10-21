import { describe, expect, it } from "vitest";
import { assessIdOf, assessmentsFor, assessScope, checkAssessment, isAssessScope, latestSummaries, type Assessment } from "./assessment";
import { quickSplit, validateRanges } from "./program";

describe("수행평가 (N59)", () => {
  it("조각 범위", () => {
    const s = assessScope("c-4", "a1");
    expect(s).toBe("세특:c-4#수행:a1");
    expect(isAssessScope(s)).toBe(true);
    expect(isAssessScope("세특:c-4#자료")).toBe(false);
    expect(assessIdOf(s)).toBe("a1");
  });
  it("등록 검사", () => {
    expect(checkAssessment({ title: "빗면 실험", date: "2026-10-14" })).toBeNull();
    expect(checkAssessment({ title: "a", date: "2026-10-14" })).toMatch(/이름/);
    expect(checkAssessment({ title: "빗면 실험", date: "" })).toMatch(/날짜/);
  });
  it("학생마다 마지막 요약 · 분반 거르기", () => {
    const m = latestSummaries([{ studentId: "s1", createdAt: "1" }, { studentId: "s1", createdAt: "3" }, { studentId: "s2", createdAt: "2" }]);
    expect(m.get("s1")!.createdAt).toBe("3");
    const a = (id: string, section: string | null, date: string): Assessment => ({ id, courseId: "c", section, teacherId: "t", title: id, date, description: "", createdAt: date });
    expect(assessmentsFor([a("x", "1분반", "2026-09-01"), a("y", "1분반", "2026-10-01"), a("z", "2분반", "2026-10-02")], "c", "1분반").map((x) => x.id)).toEqual(["y", "x"]);
  });
  it("합본 나누기는 프로그램 규칙 그대로 (번호순 2쪽씩 · 겹침 막기)", () => {
    const r = quickSplit(6, 2, ["s1", "s2", "s3"]);
    expect(r).toEqual([{ from: 1, to: 2, studentId: "s1" }, { from: 3, to: 4, studentId: "s2" }, { from: 5, to: 6, studentId: "s3" }]);
    expect(validateRanges(r, 6)).toBeNull();
    expect(validateRanges([{ from: 1, to: 3, studentId: "s1" }, { from: 3, to: 4, studentId: "s2" }], 6)).toMatch(/겹/);
  });
});
