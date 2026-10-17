import { describe, expect, it } from "vitest";
import { neisBytes } from "./length";
import { fitRange, mergeByRules, orderPieces, type MergePiece } from "./merge";

const P = (id: string, date: string | null, text: string, source: MergePiece["source"] = "누가기록"): MergePiece => ({ id, source, date, text });

describe("합치기", () => {
  it("날짜 순으로 놓고 본문은 맨 앞", () => {
    expect(orderPieces([P("b", "2026-05-02", "나"), P("a", "2026-04-01", "가"), P("m", null, "본", "본문")]).map((p) => p.id)).toEqual(["m", "a", "b"]);
  });

  it("규칙으로 이으면 같은 문장은 한 번, NEIS 어미, 분량 안", () => {
    const out = mergeByRules([P("a", "2026-04-01", "빗면 실험을 설계함. 오차를 분석함."), P("b", "2026-05-01", "오차를 분석함. 모둠 발표를 주도함")], { unit: "bytes", max: 1500 });
    expect(out).toBe("빗면 실험을 설계함. 오차를 분석함. 모둠 발표를 주도함.");
    const long = mergeByRules([P("a", "2026-04-01", "가나다라마바사 실험함. ".repeat(80))], { unit: "bytes", max: 300 });
    expect(neisBytes(long)).toBeLessThanOrEqual(300);
  });

  it("목표 범위는 최대의 90%부터", () => {
    expect(fitRange({ unit: "bytes", max: 1500 })).toMatchObject({ min: 1350, max: 1500 });
  });
});
