import { describe, expect, it } from "vitest";
import { neisBytes } from "./length";
import { budgetStatus, fitGap, fitGoal, fitRange, groupByActivity, mergeByRules, nextImportance, orderPieces, pickByBudget, type Importance, type MergePiece } from "./merge";

const P = (id: string, date: string | null, text: string, source: MergePiece["source"] = "누가기록"): MergePiece => ({ id, source, date, text });

describe("합치기", () => {
  it("날짜 순으로 놓고 본문은 맨 앞", () => {
    expect(orderPieces([P("b", "2026-05-02", "나"), P("a", "2026-04-01", "가"), P("m", null, "본", "본문")]).map((p) => p.id)).toEqual(["m", "a", "b"]);
  });

  it("규칙으로 이으면 같은 문장은 한 번, NEIS 어미, 분량 안", () => {
    const out = mergeByRules([P("a", "2026-04-01", "빗면 실험을 설계함. 오차를 분석함."), P("b", "2026-05-01", "오차를 분석함. 모둠 발표를 주도함")], { unit: "bytes", max: 1500 });
    // 같은 조각의 짧은 문장은 이어 쓰고, 다른 조각(활동명 없음)은 끊는다
    expect(out).toBe("빗면 실험을 설계하고 오차를 분석함. 모둠 발표를 주도함.");
    const long = mergeByRules([P("a", "2026-04-01", "가나다라마바사 실험함. ".repeat(80))], { unit: "bytes", max: 300 });
    expect(neisBytes(long)).toBeLessThanOrEqual(300);
  });

  it("목표 범위는 최대의 90%부터", () => {
    expect(fitRange({ unit: "bytes", max: 1500 })).toMatchObject({ min: 1350, max: 1500 });
  });

  it("중요도: 보통 → 핵심 → 참고 → 보통", () => {
    expect([2, 3, 1].map((w) => nextImportance(w as Importance))).toEqual([3, 1, 2]);
  });

  it("중요도 순으로 목표에 맞춰 고르기: 핵심은 늘, 나머지는 목표까지", () => {
    const W = (id: string, date: string, bytes: number, weight: Importance): MergePiece => ({ ...P(id, date, "a".repeat(bytes)), weight });
    const pieces = [W("old", "2026-04-01", 400, 2), W("new", "2026-06-01", 400, 2), W("key", "2026-03-01", 500, 3), W("ref", "2026-07-01", 300, 1), W("big", "2026-08-01", 2000, 2)];
    // 핵심 500 → 보통 새 것부터(big 2000 은 넘쳐서 건너뜀) new 400 → old 400 = 1300, 목표 1000 넘어서 멈춤
    expect([...pickByBudget(pieces, 1000, "bytes")].sort()).toEqual(["key", "new", "old"]);
    // 목표가 작아도 핵심은 고른다
    expect([...pickByBudget(pieces, 100, "bytes")]).toEqual(["key"]);
  });

  it("고른 양 상태: 최소 미만 부족 · 1.5배 넘으면 많음", () => {
    expect(budgetStatus(1000, 1500)).toBe("부족");
    expect(budgetStatus(1500, 1500)).toBe("맞음");
    expect(budgetStatus(2250, 1500)).toBe("맞음");
    expect(budgetStatus(2300, 1500)).toBe("많음");
  });

  it("규칙으로 이을 때 같은 활동 조각은 한 문장으로, 활동명은 첫 문장에만", () => {
    const out = mergeByRules([
      P("a", "2026-09-01", "[산성비 탐구] 모둠장 맡음."),
      P("b", "2026-09-02", "[산성비 탐구] pH 측정함."),
      P("c", "2026-09-03", "[산성비 탐구] 결과표 정리함."),
      P("d", "2026-09-04", "[독서 토론] 토론 사회를 봄."),
    ], { unit: "bytes", max: 1500 });
    expect(out).toBe("산성비 탐구에서 모둠장 맡고 pH 측정하며 결과표 정리함. 독서 토론에서 토론 사회를 봄.");
  });

  it("조각을 활동명별로 묶는다 (번호는 들어온 순서)", () => {
    const g = groupByActivity([P("a", null, "[실험] 가함."), P("b", null, "나함."), P("c", null, "[실험] 다함.")]);
    expect(g.map((x) => [x.activity, x.pieces.map((p) => p.n)])).toEqual([["실험", [1, 3]], [null, [2]]]);
  });

  it("규칙으로 이을 때 넘치면 참고 조각 문장부터 뺀다", () => {
    const pieces: MergePiece[] = [
      { ...P("a", "2026-04-01", "핵심 실험을 설계함."), weight: 3 },
      { ...P("b", "2026-05-01", "참고 활동을 함."), weight: 1 },
      { ...P("c", "2026-06-01", "보통 발표를 함."), weight: 2 },
    ];
    const max = neisBytes("핵심 실험을 설계함. 보통 발표를 함.");
    expect(mergeByRules(pieces, { unit: "bytes", max })).toBe("핵심 실험을 설계함. 보통 발표를 함.");
  });
});

describe("분량 맞추기 겨냥 (fitGoal · fitGap)", () => {
  const range = { unit: "bytes" as const, min: 1350, max: 1500 };
  it("범위 가운데를 겨냥하고, 바이트는 그 글의 비율로 글자 수를 셈한다", () => {
    expect(fitGoal(range).value).toBe(1425);
    expect(fitGoal(range).chars).toBe(Math.round(1425 / 2.6));
    const ko = "가".repeat(60); // 한글만: 3B/자
    expect(fitGoal(range, ko).chars).toBe(475);
  });
  it("범위 안이면 null, 짧으면 늘리기 · 길면 줄이기", () => {
    expect(fitGap("가".repeat(470), range)).toBeNull();
    expect(fitGap("가".repeat(300), range)).toEqual({ dir: "늘리기", now: 900, by: 525 });
    expect(fitGap("가".repeat(520), range)).toEqual({ dir: "줄이기", now: 1560, by: 135 });
  });
});
