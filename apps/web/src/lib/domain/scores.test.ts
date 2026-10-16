import { describe, expect, it } from "vitest";
import {
  averageTrend, checkScoreRows, colLetter, countVerdicts, describeRule, judgeMinimum, matchScoreHeaders, mockAverage, parseGrade,
  ruleProblems, shortRule, summarizeScoreRows, trendSummary, validColumnMap, type Grades, type MinRule, type ScoreField,
} from "./scores";

const g = (ko: number | null, ma: number | null, en: number | null, t1: number | null, t2: number | null, hi: number | null = 3): Grades => ({ ko, ma, en, hi, t1, t2 });
const rule = (p: Partial<MinRule> = {}): MinRule => ({
  id: "r", university: "A대", major: "산업디자인", pool: ["ko", "ma", "en", "tam"], pick: 2, maxSum: 5, required: [], historyMax: null, inquiry: "best", note: null, ...p,
});

describe("모의고사 평균", () => {
  it("국·수·영·탐(두 과목 평균)의 평균, 한국사 제외", () => {
    expect(mockAverage(g(2, 3, 2, 2, 2, 9))).toBe(2.3); // (2+3+2+2)/4 = 2.25 → 2.3
    expect(mockAverage(g(3, 4, 3, 3, 3))).toBe(3.3); // 3.25 → 3.3
    expect(mockAverage(g(2, 2, 2, 1, 3))).toBe(2);
  });
  it("빈 과목은 빼고, 다 비면 null", () => {
    expect(mockAverage(g(2, null, 4, null, null))).toBe(3);
    expect(mockAverage(g(null, null, null, null, null))).toBeNull();
  });
});

describe("수능 최저 판정", () => {
  it("1. 2개 합 5: 가장 좋은 두 영역 (김민준 2·3·2·탐2 → 충족)", () => {
    const j = judgeMinimum(rule(), g(2, 3, 2, 2, 2));
    expect(j.status).toBe("충족");
    expect(j.sum).toBe(4);
    expect(j.used.map((u) => u.area)).toEqual(["ko", "en"]);
  });
  it("2. 경계값: 합이 기준과 같으면 충족, 1 넘으면 미충족", () => {
    expect(judgeMinimum(rule({ maxSum: 4 }), g(2, 3, 2, 3, 3)).status).toBe("충족");
    expect(judgeMinimum(rule({ maxSum: 4 }), g(3, 3, 3, 3, 3)).status).not.toBe("충족");
  });
  it("3. 필수 영역(수학 포함 2개 합 4): 수학 3이면 근접, 등급이 낮은 수학부터 제안", () => {
    const j = judgeMinimum(rule({ pick: 2, maxSum: 4, required: ["ma"] }), g(2, 3, 2, 2, 2));
    expect(j.status).toBe("근접");
    expect(j.fixes[0]).toBe("ma");
    expect(judgeMinimum(rule({ pick: 2, maxSum: 4, required: ["ma"] }), g(3, 3, 3, 3, 3)).fixes).toEqual([]);
    expect(j.reason).toBe("수학 1등급만 올리면 충족");
  });
  it("4. 한국사 기준: 합은 되지만 한국사가 넘으면 미충족, 한국사 한 등급으로 근접", () => {
    const r = rule({ historyMax: 4 });
    expect(judgeMinimum(r, g(1, 1, 1, 1, 1, 4)).status).toBe("충족");
    const j = judgeMinimum(r, g(1, 1, 1, 1, 1, 5));
    expect(j.status).toBe("근접");
    expect(j.fixes).toEqual(["hi"]);
    expect(judgeMinimum(r, g(1, 1, 1, 1, 1, 7)).status).toBe("미충족");
  });
  it("5. 탐구 1과목은 좋은 과목, 2과목 평균은 평균, 버림은 소수 버림", () => {
    const grades = g(5, 5, 5, 1, 4);
    expect(judgeMinimum(rule({ pool: ["tam"], pick: 1, maxSum: 1, inquiry: "best" }), grades).status).toBe("충족");
    expect(judgeMinimum(rule({ pool: ["tam"], pick: 1, maxSum: 2, inquiry: "avg" }), grades).status).not.toBe("충족"); // 2.5
    expect(judgeMinimum(rule({ pool: ["tam"], pick: 1, maxSum: 2, inquiry: "avgFloor" }), grades).status).toBe("충족"); // floor 2.5 = 2
  });
  it("6. 빈 과목: 있어도 충족이면 충족, 결과가 달라질 수 있으면 자료 부족 (배준혁)", () => {
    expect(judgeMinimum(rule({ maxSum: 4 }), g(3, null, 2, 3, 3)).status).toBe("자료 부족");
    expect(judgeMinimum(rule({ maxSum: 5 }), g(3, null, 2, 3, 3)).status).toBe("충족");
    const j = judgeMinimum(rule({ maxSum: 4 }), g(3, null, 2, 3, 3));
    expect(j.reason).toContain("수학");
  });
  it("7. 빈 과목이 있어도 이미 안 되는 경우는 미충족", () => {
    expect(judgeMinimum(rule({ pick: 2, maxSum: 4, required: ["ko", "en"] }), g(4, null, 4, null, null)).status).toBe("미충족");
  });
  it("8. 기준이 없거나 이상하면 판정 불가, 성적이 없으면 자료 부족", () => {
    expect(judgeMinimum(null, g(1, 1, 1, 1, 1)).status).toBe("판정 불가");
    expect(judgeMinimum(rule({ pick: 5 }), g(1, 1, 1, 1, 1)).status).toBe("판정 불가");
    expect(judgeMinimum(rule({ required: ["ma"], pool: ["ko", "en"] }), g(1, 1, 1, 1, 1)).status).toBe("판정 불가");
    expect(judgeMinimum(rule(), null).status).toBe("자료 부족");
  });
  it("9. 4개 합 5 (E대 의예): 1·1·1·2 충족, 탐구 평균 2.5면 미충족", () => {
    const r = rule({ pick: 4, maxSum: 5, inquiry: "avg" });
    expect(judgeMinimum(r, g(1, 1, 1, 2, 2)).status).toBe("충족");
    const j = judgeMinimum(r, g(1, 1, 1, 2, 3));
    expect(j.status).toBe("근접"); // 탐구2 를 2로 → 평균 2 → 합 5
    expect(j.fixes).toEqual(["t2", "t1"]);
  });
  it("10. 두 과목 이상 올려야 하면 미충족 (근접 아님)", () => {
    const j = judgeMinimum(rule({ pick: 3, maxSum: 7 }), g(4, 4, 4, 4, 4));
    expect(j.status).toBe("미충족");
    expect(j.sum).toBe(12);
    expect(j.fixes).toEqual([]);
  });
  it("11. 반영 영역이 일부(국·영)면 그 안에서만 고른다", () => {
    expect(judgeMinimum(rule({ pool: ["ko", "en"], pick: 2, maxSum: 4 }), g(2, 1, 2, 1, 1)).status).toBe("충족");
    expect(judgeMinimum(rule({ pool: ["ko", "en"], pick: 2, maxSum: 3 }), g(2, 1, 2, 1, 1)).status).toBe("근접");
  });
  it("개수 세기", () => {
    expect(countVerdicts(["충족", "충족", "근접", "자료 부족"])).toEqual({ 충족: 2, 근접: 1, 미충족: 0, "자료 부족": 1, "판정 불가": 0 });
  });
});

describe("기준 설명·검사", () => {
  it("짧은 기준과 긴 설명", () => {
    expect(shortRule(rule())).toBe("2개 합 5");
    expect(shortRule(rule({ required: ["ma"], maxSum: 4 }))).toBe("수학 포함 2개 합 4");
    expect(describeRule(rule({ historyMax: 4 }))).toEqual({ main: "국·수·영·탐 중 2개 합 5", extra: "한국사 4 이내 · 탐구 1과목" });
    expect(describeRule(rule({ pool: ["ko", "en"] })).extra).toBe("");
  });
  it("이상한 기준을 찾는다", () => {
    expect(ruleProblems(rule())).toEqual([]);
    expect(ruleProblems(rule({ pool: [] })).length).toBeGreaterThan(0);
    expect(ruleProblems(rule({ maxSum: 0 })).length).toBeGreaterThan(0);
    expect(ruleProblems(rule({ historyMax: 10 })).length).toBeGreaterThan(0);
  });
});

describe("추이", () => {
  const exams = [
    { id: "e10", year: 2026, month: 10, name: "10월" },
    { id: "e3", year: 2026, month: 3, name: "3월" },
  ];
  const scores = [
    { examId: "e3", studentId: "s", grades: g(3, 4, 3, 3, 3), createdAt: "" },
    { examId: "e10", studentId: "s", grades: g(2, 3, 2, 2, 2), createdAt: "" },
  ];
  it("시험 순서대로 평균", () => {
    expect(averageTrend(exams, scores).map((p) => [p.label, p.average])).toEqual([["3월", 3.3], ["10월", 2.3]]);
  });
  it("오른 폭과 가장 많이 오른 과목", () => {
    const t = trendSummary(exams, scores);
    expect(t.change).toBe(1);
    expect(t.months).toBe(7);
    expect(t.bestSubject).toBe("ko");
    expect(t.text).toContain("1.0등급 올랐어요");
  });
  it("시험이 하나면 추이 없음", () => {
    expect(trendSummary(exams, scores.slice(0, 1)).change).toBeNull();
  });
});

describe("성적 파일 열 맞추기", () => {
  it("양식 그대로", () => {
    const m = matchScoreHeaders(["번호", "이름", "국어", "수학", "영어", "한국사", "탐구1", "탐구2"]);
    expect(m.missing).toEqual([]);
    expect(m.renamed).toEqual([]);
  });
  it("다른 이름도 맞춘다 (국어 등급, 수학(미적), 탐1·탐2, 한국사가 국어로 잡히지 않음)", () => {
    const m = matchScoreHeaders(["번호", "성명", "한국사", "국어 등급", "수학(미적)", "영어", "탐1", "탐2"]);
    expect(m.map).toEqual({ number: 0, name: 1, hi: 2, ko: 3, ma: 4, en: 5, t1: 6, t2: 7 });
    expect(m.renamed.map((r) => r.to)).toEqual(["name", "ko", "ma", "t1", "t2"]);
  });
  it("원점수·표준점수 열은 건너뛰고 '등급' 열을 고른다", () => {
    const m = matchScoreHeaders(["번호", "이름", "국어 원점수", "국어", "국어 등급", "수학", "영어", "한국사", "탐구1", "탐구2"]);
    expect(m.map.ko).toBe(4);
  });
  it("없는 열은 missing", () => {
    expect(matchScoreHeaders(["번호", "이름", "국어"]).missing).toEqual(["ma", "en", "hi", "t1", "t2"]);
  });
  it("열 맞춤 검사", () => {
    const full = { number: 0, name: 1, ko: 2, ma: 3, en: 4, hi: 5, t1: 6, t2: 7 };
    expect(validColumnMap(full, 8)).toBeNull();
    expect(validColumnMap({ ...full, t2: 6 }, 8)).toContain("G열");
    expect(validColumnMap({ ...full, t2: 9 }, 8)).not.toBeNull();
    expect(colLetter(0)).toBe("A");
    expect(colLetter(26)).toBe("AA");
  });
});

describe("성적 행 검사", () => {
  const roster = [
    { id: "s-1", number: 12, name: "김민준" },
    { id: "s-14", number: 5, name: "배준혁" },
    { id: "s-13", number: 14, name: "문태오" },
    { id: "s-8", number: 2, name: "오승우" },
  ];
  const row = (number: string, name: string, ko = "2", ma = "3", en = "2", hi = "3", t1 = "2", t2 = "2"): Record<ScoreField, string> => ({ number, name, ko, ma, en, hi, t1, t2 });

  it("등급 칸 읽기", () => {
    expect(parseGrade("3")).toEqual({ ok: true, value: 3 });
    expect(parseGrade("2등급")).toEqual({ ok: true, value: 2 });
    expect(parseGrade("")).toEqual({ ok: true, value: null });
    expect(parseGrade("—")).toEqual({ ok: true, value: null });
    expect(parseGrade("12")).toEqual({ ok: false });
    expect(parseGrade("0")).toEqual({ ok: false });
    expect(parseGrade("2.5")).toEqual({ ok: false });
  });
  it("정상·빈 칸·범위 오류", () => {
    const rows = checkScoreRows([row("12", "김민준"), row("5", "배준혁", "3", ""), row("14", "문태오", "3", "3", "12")], roster);
    expect(rows.map((r) => r.status)).toEqual(["정상", "빈 칸", "범위 오류"]);
    expect(rows[1].grades.ma).toBeNull();
    expect(rows[1].problems.join()).toContain("수학 칸이 비어 있어요");
    const s = summarizeScoreRows(rows, roster.length);
    expect(s).toMatchObject({ ok: 1, blank: 1, range: 1, needsCheck: 2, blocked: false, applicable: 2, notInFile: 1 });
  });
  it("이름 불일치·명단에 없음·번호 중복이 하나라도 있으면 전체를 막는다", () => {
    const rows = checkScoreRows([row("12", "김민수"), row("40", "누구"), row("2", "오승우"), row("2", "오승우")], roster);
    expect(rows.map((r) => r.status)).toEqual(["이름 불일치", "명단에 없음", "번호 중복", "번호 중복"]);
    const s = summarizeScoreRows(rows, roster.length);
    expect(s.blocked).toBe(true);
    expect(s.applicable).toBe(0);
  });
  it("이름 사이 공백은 무시", () => {
    expect(checkScoreRows([row("12", "김 민준")], roster)[0].status).toBe("정상");
  });
});
