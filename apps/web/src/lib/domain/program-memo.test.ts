import { describe, expect, it } from "vitest";
import { buildEvidence, programMemoScope, sampleDraft, sourceFromPicks, sourceLabel, usesDocs, usesMemos, usesSurvey } from "./program";

describe("프로그램 교사 메모 (N41)", () => {
  it("근거 고르기: 설문 · 서류 · 교사 메모 (메모만도 된다)", () => {
    expect(sourceFromPicks({ survey: true, docs: false, memo: false })).toEqual({ source: "survey", useMemos: false });
    expect(sourceFromPicks({ survey: true, docs: true, memo: true })).toEqual({ source: "both", useMemos: true });
    expect(sourceFromPicks({ survey: false, docs: true, memo: true })).toEqual({ source: "docs", useMemos: true });
    expect(sourceFromPicks({ survey: false, docs: false, memo: true })).toEqual({ source: "memo", useMemos: true });
    expect(sourceFromPicks({ survey: false, docs: false, memo: false })).toBeNull();
  });

  it("memo 는 설문·서류를 쓰지 않는다 · 이름", () => {
    expect(usesSurvey("memo")).toBe(false);
    expect(usesDocs("memo")).toBe(false);
    expect(usesSurvey("both") && usesDocs("both")).toBe(true);
    expect(usesMemos({ source: "memo" })).toBe(true);
    expect(usesMemos({ source: "survey", useMemos: true })).toBe(true);
    expect(usesMemos({ source: "survey" })).toBe(false);
    expect(sourceLabel({ source: "survey", useMemos: true })).toBe("설문 + 교사 메모");
    expect(sourceLabel({ source: "memo", useMemos: true })).toBe("교사 메모");
    expect(programMemoScope("p1")).toBe("프로그램:p1");
  });

  it("근거에 교사 메모가 들어간다 (메모를 쓰는 프로그램만)", () => {
    const q = [{ id: "q1", title: "활동 내용", prompt: "", fixed: true, minChars: 0 }];
    const resp = { answers: { q1: "빗면 실험을 함" }, submittedAt: "2026-10-01" };
    expect(buildEvidence({ source: "survey", questions: q, useMemos: true }, resp, [], "발표 뒤 그래프로 다시 설명함").map((e) => e.label)).toEqual(["설문 Q1 활동 내용", "교사 메모"]);
    expect(buildEvidence({ source: "survey", questions: q }, resp, [], "메모").map((e) => e.label)).toEqual(["설문 Q1 활동 내용"]);
    expect(buildEvidence({ source: "memo", questions: [] }, null, [], "모둠 기록을 맡아 정리함")).toEqual([{ label: "교사 메모", text: "모둠 기록을 맡아 정리함" }]);
    expect(buildEvidence({ source: "memo", questions: [] }, null, [], "  ")).toEqual([]);
  });

  it("예시 초안에 메모가 들어간다", () => {
    const t = sampleDraft({ title: "과학 탐구 발표", area: "세특", answers: [], docs: [], careerGoal: null, range: { unit: "bytes", min: 10, max: 1500, capped: false }, memo: "발표 뒤 그래프로 다시 설명함" });
    expect(t).toContain("발표 뒤 그래프로 다시 설명함");
  });
});
