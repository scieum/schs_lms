import { describe, expect, it } from "vitest";
import { activeQuick, bandText, charsBytes, composeRequest, gateRow, missingPieces, parseTol, quickPick, reviseChips, traceLine } from "./memo-gate";
import type { GateResult } from "./length-gate";

const ko = (k: number) => "가".repeat(k); // 한글 1자 = 3B

const pieces = [
  { id: "body", date: null, weight: 3 },
  { id: "a", date: "2026-10-02", weight: 3 },
  { id: "b", date: "2026-10-05", weight: 2 },
  { id: "c", date: "2026-10-14", weight: 2 },
  { id: "d", date: null, weight: 1 },
  { id: "e", date: "2026-10-01", weight: 2 },
];

describe("빠르게 고르기", () => {
  it("모두 · 꼭 넣기만", () => {
    expect([...quickPick(pieces, "all")]).toHaveLength(6);
    expect([...quickPick(pieces, "must")].sort()).toEqual(["a", "body"]);
  });
  it("최근 3개 = 날짜 순 마지막 3개 (지금 글 빼고, 날짜 없는 메모 = 지금)", () => {
    expect([...quickPick(pieces, "recent")].sort()).toEqual(["b", "c", "d"]);
  });
  it("지금 고른 묶음과 같은 칩만", () => {
    expect(activeQuick(pieces, new Set(["body", "a"]))).toBe("must");
    expect(activeQuick(pieces, new Set(["b", "c", "d"]))).toBe("recent");
    expect(activeQuick(pieces, new Set(["a"]))).toBeNull();
    expect(activeQuick(pieces, new Set())).toBeNull();
  });
});

describe("오차 기억", () => {
  it("고를 수 있는 값만, 아니면 기본", () => {
    expect(parseTol("30", "bytes")).toBe(30);
    expect(parseTol("100", "bytes")).toBe(100);
    expect(parseTol("70", "bytes")).toBe(50);
    expect(parseTol(null, "chars")).toBe(20);
  });
  it("범위 글", () => {
    expect(bandText({ lo: 1450, hi: 1500 }, "bytes")).toBe("1,450~1,500B");
    expect(bandText({ lo: 480, hi: 500 }, "chars")).toBe("480~500자");
  });
});

const gate = (over: Partial<GateResult> = {}): GateResult => ({ target: 1500, tol: 50, lo: 1450, hi: 1500, value: 1482, pass: true, rounds: 0, ...over });

describe("③ 게이트 줄", () => {
  it("통과 + AI 결과 그대로면 메모 반영도", () => {
    const t = ko(494); // 1,482B
    const r = gateRow({ text: t, gateText: t, gate: gate({ memos: { picked: 5, covered: 5, missing: [] } }), unit: "bytes", limit: 1500 });
    expect(r).toMatchObject({ tone: "pass", label: "1,482 / 1,500B · 게이트 통과", value: 1482 });
    expect(r.memos?.covered).toBe(5);
  });
  it("손으로 고치면 분량은 다시 재고 메모 반영은 숨긴다", () => {
    const r = gateRow({ text: ko(440), gateText: ko(494), gate: gate({ memos: { picked: 5, covered: 4, missing: ["x"] }, thin: true }), unit: "bytes", limit: 1500 });
    expect(r).toMatchObject({ tone: "short", value: 1320, thin: true, label: "1,320B · 목표보다 130B 짧아요 · 근거가 적어요" });
    expect(r.memos).toBeUndefined();
  });
  it("나이스 한도를 넘으면 빨강", () => {
    const r = gateRow({ text: ko(500) + "가가가가가가가가가가가가가", gateText: "", gate: gate(), unit: "bytes", limit: 1500 });
    expect(r.tone).toBe("over");
    expect(r.label).toBe("1,539B · 나이스 한도보다 39B 넘어요");
  });
  it("목표가 한도보다 작아 띠 위로 넘치면 주황 '길어요'", () => {
    const r = gateRow({ text: ko(400), gateText: "", gate: gate({ target: 1000, lo: 950, hi: 1050 }), unit: "bytes", limit: 1500 });
    expect(r).toMatchObject({ tone: "long", label: "1,200B · 목표보다 150B 길어요" });
  });
  it("빠진 메모 id → 메모", () => {
    expect(missingPieces(["c", "zz"], [{ id: "a" }, { id: "c" }])).toEqual([{ id: "c" }]);
    expect(missingPieces(undefined, [{ id: "a" }])).toEqual([]);
  });
});

describe("쓴 뒤 줄", () => {
  it("서버가 거친 단계 그대로", () => {
    expect(traceLine(gate({ trace: { first: 1612, added: { before: 4, after: 5 }, fit: { from: 1612, to: 1480 } } }), "bytes"))
      .toBe("첫 글 1,612B · 빠진 조각 넣기 4→5 · 분량 맞추기 1,612→1,480B");
  });
  it("빠진 메모 없음 · 이미 맞음", () => {
    expect(traceLine(gate({ trace: { first: 1482 }, memos: { picked: 5, covered: 5, missing: [] } }), "bytes"))
      .toBe("첫 글 1,482B · 조각 반영 5/5 · 1,482B · 맞음");
  });
  it("trace 가 없으면 빈 글", () => {
    expect(traceLine(gate(), "bytes")).toBe("");
    expect(traceLine(undefined, "bytes")).toBe("");
  });
});

describe("수정 요청", () => {
  it("행발은 진로와 잇기 대신 생활 장면 더", () => {
    expect(reviseChips("record")).toContain("진로와 잇기");
    expect(reviseChips("behavior")).toContain("생활 장면 더");
    expect(reviseChips("behavior")).not.toContain("진로와 잇기");
    expect(reviseChips("log")).toEqual(["더 구체적으로", "문장 자연스럽게", "짧게 핵심만"]);
  });
  it("칩 + 적은 말", () => {
    expect(composeRequest(["더 구체적으로"], " 실험 과정 더 자세히 ")).toBe("더 구체적으로 / 실험 과정 더 자세히");
    expect(composeRequest([], "  ")).toBe("");
    expect(composeRequest(["순서 바꾸기", "줄여서 핵심만"], "")).toBe("순서 바꾸기, 줄여서 핵심만");
    expect(composeRequest([], "가".repeat(300))).toHaveLength(200);
  });
  it("글자 · 바이트", () => {
    expect(charsBytes("가나 다.")).toBe("5자 · 11B");
  });
});
