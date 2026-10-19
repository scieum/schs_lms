import { describe, expect, it } from "vitest";
import { barParts, classCheck, fixTargets, sortForReview, topLabel, withJosa, type ClassCheckInput } from "./class-check";
import { autoCheck } from "./auto-check";

const range = { unit: "bytes" as const, max: 1500, min: 30, capped: false };
const OK = "빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정함. 오차 원인을 분석함.";
const item = (id: string, text: string, extra: Partial<ClassCheckInput> = {}): ClassCheckInput => ({ id, label: id, text, range, identity: [], ...extra });

describe("반 전체 검사 (N35 ①)", () => {
  it("결과 · 합계 · 빈 글", () => {
    const r = classCheck([
      item("a", `${OK} 서울대학교 주최 대회에서 수상함.`),
      item("b", "실험 결과를 정리하였다. 발표를 준비하였다."),
      item("c", OK),
      item("d", "  "),
    ]);
    expect(r.rows.map((x) => x.status)).toEqual(["block", "warn", "pass", "empty"]);
    expect(r.totals).toEqual({ block: 1, warn: 1, pass: 1, empty: 1 });
    expect(r.rows[3].top).toBeNull();
    expect(r.rows[2].bytes).toBeGreaterThan(0);
  });

  it("가장 큰 문제: 막음 → 분량 → 비슷한 문장 → 어미 순, 나머지는 '외 n곳'", () => {
    const r = classCheck([item("a", `서울대학교 주최 과학탐구대회에서 수상함. 결과를 소논문으로 정리하였다.`)]);
    expect(r.rows[0].top?.label).toBe("금칙어 ‘서울대학교’");
    expect(r.rows[0].top?.more).toBe(r.rows[0].issues - 1);

    const long = classCheck([item("b", `${OK} `.repeat(30), { range: { ...range, max: 300 } })]);
    expect(long.rows[0].top?.label).toMatch(/^분량 초과 [\d,]+B$/);

    const sim = classCheck([item("c", "실험 결과를 정리하였다.", { similar: { count: 1, with: "학생A", spots: 2 } })]);
    expect(sim.rows[0].top?.label).toBe("비슷한 문장 · 학생A와 2곳");
    expect(sim.rows[0].status).toBe("warn");

    const end = classCheck([item("d", "실험 결과를 정리하였다. 발표를 준비하였다.")]);
    expect(end.rows[0].top?.label).toBe("어미 ‘~하였다.’ 2문장");
  });

  it("실명·학번은 막음과 같은 순위", () => {
    const r = classCheck([item("a", "민준이는 실험 결과를 정리하였다.", { identity: ["민준"] })]);
    expect(r.rows[0].top?.label).toBe("학번·실명 ‘민준’");
  });

  it("정렬: 확정 불가 → 확인 → 통과 → 빈 글, 같은 결과는 걸린 곳 많은 순", () => {
    const rows = sortForReview([
      { id: "p", status: "pass" as const, issues: 0 },
      { id: "e", status: "empty" as const, issues: 0 },
      { id: "w1", status: "warn" as const, issues: 1 },
      { id: "b", status: "block" as const, issues: 2 },
      { id: "w3", status: "warn" as const, issues: 3 },
    ]);
    expect(rows.map((x) => x.id)).toEqual(["b", "w3", "w1", "p", "e"]);
  });

  it("AI 고치기 대상: 확정 학생 · 통과 · 빈 글은 빼고 40명까지", () => {
    const r = classCheck([
      item("a", `${OK} 서울대학교 대회에서 수상함.`, { locked: true }),
      item("b", "결과를 정리하였다."),
      item("c", OK),
      item("d", ""),
    ]);
    expect(fixTargets(r.rows).map((x) => x.id)).toEqual(["b"]);
    expect(r.rows[0].locked).toBe(true);
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `${i}`, status: "warn" as const, locked: false }));
    expect(fixTargets(many)).toHaveLength(40);
  });

  it("요약 막대 비율 · 조사", () => {
    const parts = barParts({ block: 2, warn: 5, pass: 15, empty: 2 });
    expect(parts.map((p) => p.key)).toEqual(["block", "warn", "pass", "empty"]);
    expect(parts.reduce((n, p) => n + p.pct, 0)).toBeCloseTo(100);
    expect(barParts({ block: 0, warn: 0, pass: 0, empty: 0 })).toEqual([]);
    expect(withJosa("학생A")).toBe("학생A와");
    expect(withJosa("민준")).toBe("민준과");
    expect(withJosa("지우")).toBe("지우와");
  });

  it("행 이름표: 쉼표 많은 문장", () => {
    const c = autoCheck("가, 나, 다, 라, 마를 모두 정리함.", range, []);
    const row = c.rows.find((r) => r.key === "style-쉼표 과다");
    if (row) expect(topLabel(row, "bytes")).toBe("쉼표가 많은 문장 1개");
  });
});
