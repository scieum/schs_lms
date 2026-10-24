import { describe, expect, it } from "vitest";
import {
  changePoints, changeScale, checkPicks, checkRubric, defaultLevels, emptyRubric, gradeLine, gradeTotal, latestGrades, newCriterion, parseRubric, rubricTotal, scoreSheet,
  type AssessmentGrade, type Rubric,
} from "./rubric";

const rubric = (): Rubric => ({
  scale: "상중하",
  standards: ["[10통사1-03-02]"],
  criteria: [
    { ...newCriterion("상중하", 8, "주장의 타당성"), id: "a" },
    { ...newCriterion("상중하", 8, "근거 활용"), id: "b" },
    { ...newCriterion("상중하", 4, "표현·형식"), id: "c" },
  ],
});

describe("루브릭 채점 (N72)", () => {
  it("수준 점수 기본값은 배점 비율대로", () => {
    expect(defaultLevels("상중하", 8).map((l) => [l.label, l.points])).toEqual([["상", 8], ["중", 5], ["하", 2]]);
    expect(defaultLevels("A-E", 10).map((l) => l.points)).toEqual([10, 8, 6, 4, 2]);
  });

  it("총점 · 검사", () => {
    const r = rubric();
    expect(rubricTotal(r)).toBe(20);
    expect(checkRubric(r)).toBeNull();
    expect(checkRubric({ ...r, criteria: [] })).toMatch(/하나 이상/);
    expect(checkRubric({ ...r, criteria: [{ ...r.criteria[0], name: " " }] })).toMatch(/이름/);
    expect(checkRubric({ ...r, criteria: [{ ...r.criteria[0], levels: [{ label: "상", points: 9, desc: "" }, ...r.criteria[0].levels.slice(1)] }] })).toMatch(/0~8점/);
    expect(checkRubric(emptyRubric())).toMatch(/이름/);
  });

  it("단계 · 배점을 바꾸면 수준 칸이 따라 바뀐다 (설명은 이어 받음)", () => {
    const r = rubric();
    r.criteria[0].levels[0].desc = "분명한 주장";
    const e = changeScale(r, "A-E");
    expect(e.criteria[0].levels).toHaveLength(5);
    expect(e.criteria[0].levels[0].desc).toBe("분명한 주장");
    expect(changePoints(r.criteria[0], "상중하", 10).levels.map((l) => l.points)).toEqual([10, 6, 3]);
  });

  it("DB 값 읽기: 모르는 값은 버리고 점수는 배점 안으로", () => {
    const p = parseRubric({ scale: "상중하", criteria: [{ id: "x", name: "근거", points: 5, levels: [{ points: 99, desc: "좋음" }] }], standards: ["A", 3] })!;
    expect(p.criteria[0].levels.map((l) => l.points)).toEqual([5, 3, 2]);
    expect(p.criteria[0].levels[0].desc).toBe("좋음");
    expect(p.standards).toEqual(["A"]);
    expect(parseRubric({ criteria: [] })).toBeNull();
    expect(parseRubric(null)).toBeNull();
  });

  it("채점: 합계 · 빠진 기준 · 줄 요약", () => {
    const r = rubric();
    const picks = [{ criterionId: "a", level: 1, reason: "" }, { criterionId: "b", level: 0, reason: "" }, { criterionId: "c", level: 1, reason: "" }];
    expect(gradeTotal(r, picks)).toBe(5 + 8 + 2);
    expect(checkPicks(r, picks.slice(0, 2))).toEqual({ ok: false, error: "'표현·형식' 수준을 골라 주세요" });
    expect(checkPicks(r, [...picks.slice(0, 2), { criterionId: "c", level: 5, reason: "" }]).ok).toBe(false);
    expect(gradeLine(r, picks)).toBe("주장의 타당성 중 5 · 근거 활용 상 8 · 표현·형식 중 2");
  });

  it("학생마다 가장 최근 판정", () => {
    const g = (studentId: string, status: "ai" | "confirmed", at: string): AssessmentGrade =>
      ({ id: at, assessmentId: "x", studentId, teacherId: "t", picks: [], total: 0, status, reading: "", piece: "", createdAt: at });
    const m = latestGrades([g("s1", "confirmed", "2026-10-24T02:00:00Z"), g("s1", "ai", "2026-10-24T01:00:00Z"), g("s2", "ai", "2026-10-24T03:00:00Z")]);
    expect(m.get("s1")!.status).toBe("confirmed");
    expect(m.get("s2")!.status).toBe("ai");
  });
});

describe("점수 엑셀 줄", () => {
  it("기준마다 수준 점수 · 합계 · 상태", () => {
    const r: Rubric = { scale: "상중하", standards: [], criteria: [{ ...newCriterion("상중하", 8, "주장"), id: "a" }, { ...newCriterion("상중하", 4, "표현"), id: "b" }] };
    const latest = latestGrades([{ id: "1", assessmentId: "x", studentId: "s1", teacherId: "t", picks: [{ criterionId: "a", level: 0, reason: "" }, { criterionId: "b", level: 2, reason: "" }], total: 9, status: "confirmed", reading: "", piece: "", createdAt: "1" }]);
    const { head, rows } = scoreSheet(r, [{ id: "s1", no: "20101", name: "가" }, { id: "s2", no: "20102", name: "나" }], latest);
    expect(head).toEqual(["학번", "이름", "주장 (8)", "표현 (4)", "합계 (12)", "상태"]);
    expect(rows[0]).toEqual(["20101", "가", "상 8", "하 1", 9, "확정"]);
    expect(rows[1]).toEqual(["20102", "나", "", "", "", ""]);
  });
});
