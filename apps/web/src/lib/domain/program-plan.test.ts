import { describe, expect, it } from "vitest";
import {
  checkPlanFile, classesLabel, cleanTitle, extractPlanHints, findDocKinds, findSubject, findTitleLine, guessArea, guessSource,
  isYmd, mergePlan, parseDateRange, targetClassesFromText, EMPTY_PLAN,
} from "./program-plan";

const CLASSES = ["1-1", "1-2", "2-1", "2-2", "2-3", "2-4", "3-1"];

describe("기간 읽기", () => {
  it("여러 표기", () => {
    expect(parseDateRange("기간: 2026.10.13~10.20", 2026)).toMatchObject({ start: "2026-10-13", end: "2026-10-20" });
    expect(parseDateRange("일시 2026. 10. 13.(화) ~ 10. 20.(화)", 2025)).toMatchObject({ start: "2026-10-13", end: "2026-10-20" });
    expect(parseDateRange("10월 13일 ~ 20일", 2026)).toMatchObject({ start: "2026-10-13", end: "2026-10-20" });
    expect(parseDateRange("2026-10-13 – 2026-10-20", 2026)).toMatchObject({ start: "2026-10-13", end: "2026-10-20" });
  });
  it("해를 넘기면 다음 해, 범위가 없으면 기간 줄의 날짜 하나", () => {
    expect(parseDateRange("12.28~1.5", 2026)).toMatchObject({ start: "2026-12-28", end: "2027-01-05" });
    expect(parseDateRange("문서번호 33\n운영 일시: 11월 3일(화)", 2026)).toMatchObject({ start: "2026-11-03", end: "2026-11-03" });
    expect(parseDateRange("전화 033-123-4567", 2026)).toBeNull();
    expect(parseDateRange("13.40~10.20", 2026)).toBeNull();
  });
  it("날짜 검사", () => {
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-02-28")).toBe(true);
  });
});

describe("대상 반", () => {
  it("범위·나열·전체", () => {
    expect(targetClassesFromText("대상: 2학년 1~3반", CLASSES).keys).toEqual(["2-1", "2-2", "2-3"]);
    expect(targetClassesFromText("2학년 1, 4반 학생", CLASSES).keys).toEqual(["2-1", "2-4"]);
    expect(targetClassesFromText("1학년 전체", CLASSES).keys).toEqual(["1-1", "1-2"]);
    expect(targetClassesFromText("전교생", CLASSES).keys).toEqual(CLASSES);
    expect(targetClassesFromText("2-2반", CLASSES).keys).toEqual(["2-2"]);
  });
  it("학교에 없는 반은 뺀다", () => {
    expect(targetClassesFromText("3학년 1~5반", CLASSES).keys).toEqual(["3-1"]);
    expect(targetClassesFromText("희망 학생", CLASSES)).toEqual({ keys: [], match: null });
  });
  it("표시", () => expect(classesLabel(["2-1", "2-2", "3-1"])).toBe("2학년 1·2반, 3학년 1반"));
});

describe("제목·영역·과목·서류", () => {
  it("제목 다듬기", () => {
    expect(cleanTitle("2026학년도 과학 탐구 발표 운영 계획(안).pdf")).toBe("과학 탐구 발표");
    expect(cleanTitle("20261012_진로탐색 주간 실시계획_(최종)")).toBe("진로탐색 주간");
    expect(findTitleLine("기 안 문\n속초고등학교\n제목 2026학년도 독서 토론 동아리 운영 계획\n1. 목적")).toBe("2026학년도 독서 토론 동아리 운영 계획");
  });
  it("영역 추정", () => {
    expect(guessArea("동아리 활동 운영 동아리", null)).toBe("창체-동아리");
    expect(guessArea("진로 탐색 주간", null)).toBe("창체-진로");
    expect(guessArea("탐구 발표", "통합과학")).toBe("세특");
    expect(guessArea("아무 말", null)).toBeNull();
  });
  it("과목·서류·근거 방식", () => {
    expect(findSubject("통합과학 수업 시간에")).toBe("통합과학");
    expect(findSubject("확률과 통계 수행평가")).toBe("확률과 통계");
    expect(findDocKinds("탐구 보고서와 소감문을 제출")).toEqual(["탐구 보고서", "소감문"]);
    expect(guessSource("활동 후 설문과 보고서 제출", ["보고서"])).toBe("both");
    expect(guessSource("보고서 제출", ["보고서"])).toBe("docs");
  });
  it("HWP 는 안내, 큰 파일은 거절", () => {
    expect(checkPlanFile({ name: "계획.hwp", type: "", size: 10 })).toMatch(/PDF로 저장/);
    expect(checkPlanFile({ name: "a.png", type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10MB/);
    expect(checkPlanFile({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
  });
});

describe("규칙으로 계획서 칸 뽑기", () => {
  it("파일 이름 + 본문", () => {
    const r = extractPlanHints(
      [
        { label: "파일 이름", text: "2026 통합과학 탐구발표 운영계획(안).pdf" },
        { label: "본문", text: "1. 목적: 실생활 현상을 과학 개념으로 설명하는 탐구 발표\n2. 기간: 2026.10.13~10.20\n3. 대상: 2학년 1~3반\n4. 활동 후 탐구 보고서 제출, 설문 응답" },
      ],
      { year: 2026, classes: CLASSES },
    );
    expect(r.fields.title).toBe("통합과학 탐구발표");
    expect(r.fields.startDate).toBe("2026-10-13");
    expect(r.fields.endDate).toBe("2026-10-20");
    expect(r.fields.targetClasses).toEqual(["2-1", "2-2", "2-3"]);
    expect(r.fields.subject).toBe("통합과학");
    expect(r.fields.area).toBe("세특");
    expect(r.fields.docKinds).toEqual(["탐구 보고서"]);
    expect(r.fields.source).toBe("both");
    expect(r.fields.overview).toMatch(/실생활 현상/);
    expect(r.from.title).toMatch(/파일 이름/);
    expect(r.from.startDate).toMatch(/본문/);
  });
  it("빈 칸만 채워 합친다", () => {
    const a = { fields: { ...EMPTY_PLAN, title: "AI 제목" }, from: { title: "본문 1쪽" } };
    const b = { fields: { ...EMPTY_PLAN, title: "규칙 제목", startDate: "2026-10-13", targetClasses: ["2-1"], targetText: "2학년 1반" }, from: { title: "파일 이름", startDate: "파일 이름" } };
    const m = mergePlan(a, b);
    expect(m.fields.title).toBe("AI 제목");
    expect(m.fields.startDate).toBe("2026-10-13");
    expect(m.fields.targetClasses).toEqual(["2-1"]);
    expect(m.fields.targetText).toBe("2학년 1반");
  });
});
