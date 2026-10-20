import { describe, expect, it } from "vitest";
import { closest, coverage, gateAim, gateBand, gateCheck, gateLabel, gateResult, thinEvidence } from "./length-gate";

const ko = (n: number) => "가".repeat(n); // 한글 1자 = 3B

describe("gateBand", () => {
  it("목표 = 한도면 위쪽은 한도에서 멈춘다", () => {
    expect(gateBand({ unit: "bytes", target: 1500, tol: 50, limit: 1500 })).toMatchObject({ lo: 1450, hi: 1500 });
  });
  it("목표가 한도보다 작으면 양쪽으로 오차", () => {
    expect(gateBand({ unit: "bytes", target: 1200, tol: 50, limit: 1500 })).toMatchObject({ lo: 1150, hi: 1250 });
  });
  it("목표가 한도를 넘으면 한도로", () => {
    expect(gateBand({ unit: "bytes", target: 3000, tol: 30, limit: 1500 })).toMatchObject({ target: 1500, lo: 1470, hi: 1500 });
  });
  it("오차 기본값", () => {
    expect(gateBand({ unit: "bytes", target: 1500, limit: 1500 }).tol).toBe(50);
    expect(gateBand({ unit: "chars", target: 500, limit: 500 }).tol).toBe(20);
  });
});

describe("gateCheck", () => {
  const g = gateBand({ unit: "bytes", target: 1500, tol: 60, limit: 1500 }); // 1440~1500, 겨눔 1470
  it("띠 안이면 통과", () => {
    expect(gateCheck(ko(490), g)).toEqual({ value: 1470, pass: true, dir: null, by: 0 });
  });
  it("짧으면 늘리기 (겨눔까지)", () => {
    expect(gateCheck(ko(400), g)).toMatchObject({ value: 1200, pass: false, dir: "늘리기", by: 270 });
  });
  it("길면 줄이기", () => {
    expect(gateCheck(ko(540), g)).toMatchObject({ value: 1620, dir: "줄이기", by: 150 });
    expect(gateAim(g)).toBe(1470);
  });
});

describe("closest", () => {
  const g = gateBand({ unit: "bytes", target: 1500, tol: 60, limit: 1500 });
  it("띠에 가장 가까운 글", () => {
    expect(closest([ko(560), ko(510), ko(300)], g)).toBe(ko(510));
    expect(closest([ko(400), ko(495)], g)).toBe(ko(495));
  });
  it("빈 글은 건너뛴다", () => expect(closest(["", ko(10)], g)).toBe(ko(10)));
});

describe("coverage", () => {
  it("문장에 기댄 key 가 없는 메모는 빠짐", () => {
    expect(coverage([{ keys: ["a"] }, { keys: ["a", "c"] }], ["a", "b", "c"])).toEqual({ covered: ["a", "c"], missing: ["b"] });
  });
  it("문장 근거가 없으면 모두 빠짐", () => expect(coverage(undefined, ["a"]).missing).toEqual(["a"]));
});

describe("gateLabel · gateResult", () => {
  const g = gateBand({ unit: "bytes", target: 1500, tol: 50, limit: 1500 });
  it("통과", () => expect(gateLabel(gateResult(ko(494), g, 1), "bytes")).toBe("1,482 / 1,500B · 게이트 통과"));
  it("짧음", () => expect(gateLabel(gateResult(ko(440), g, 3), "bytes")).toBe("1,320B · 목표보다 130B 짧아요"));
  it("김", () => expect(gateLabel(gateResult(ko(510), g, 3), "bytes")).toBe("1,530B · 목표보다 30B 길어요"));
});

describe("thinEvidence", () => {
  const g = gateBand({ unit: "bytes", target: 1500, tol: 50, limit: 1500 });
  it("메모가 띠 아래쪽의 1/4 도 안 되면 얇음", () => {
    expect(thinEvidence([ko(50), ko(40)], g)).toBe(true); // 270B < 362
    expect(thinEvidence([ko(130)], g)).toBe(false); // 390B
  });
});
