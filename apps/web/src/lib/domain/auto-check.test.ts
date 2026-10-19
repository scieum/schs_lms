import { describe, expect, it } from "vitest";
import { autoCheck } from "./auto-check";
import { findIdentity } from "./writing";

const range = { unit: "bytes" as const, max: 300, min: 60, capped: false };
const who = { name: "한지민", studentNo: "20111", grade: 2, classNo: 1, number: 11 };
const check = (t: string) => autoCheck(t, range, findIdentity(t, who));

describe("자동 검사 (N23)", () => {
  it("빈 본문은 검사하지 않음", () => {
    expect(check("  ").status).toBe("empty");
  });
  it("통과하면 지난 항목만 한 줄로", () => {
    const r = check("빗면 실험에서 변인을 정해 설계함. 오차 원인을 스스로 찾아 다시 측정함.");
    expect(r.status).toBe("pass");
    expect(r.rows).toEqual([]);
    expect(r.passed).toEqual(["글자수", "학번·실명", "어미", "문체", "금칙어", "맞춤법"]);
  });
  it("못 지난 항목은 걸린 말과 함께, 금칙어 금지가 맨 앞 · 확정 불가", () => {
    const r = check("한지민 학생은 빗면 실험을 설계하였다. 교외 대회에서 상을 받음.");
    expect(r.status).toBe("block");
    expect(r.rows[0].level).toBe("block");
    const id = r.rows.find((x) => x.key === "id")!;
    expect(id.hit).toContain("한지민");
    const end = r.rows.find((x) => x.key === "end")!;
    expect(end.find).toBe("한지민 학생은 빗면 실험을 설계하였다.");
    expect(r.rows.some((x) => x.label === "학생 주어")).toBe(true);
  });
  it("분량: 넘으면 넘은 양, 모자라면 더 쓸 양", () => {
    const long = check("가".repeat(110) + "함.");
    expect(long.over).toBe(3 * 111 + 1 - 300);
    expect(long.rows.find((x) => x.key === "len")!.label).toBe(`분량 초과 ${long.over}B`);
    expect(check("짧게 씀.").rows.find((x) => x.key === "len")!.detail).toMatch(/B 더 써 주세요$/);
  });
  it("초안 검토: 근거 반영·학생 근거 문장", () => {
    const r = autoCheck("빗면 실험을 설계함. 오차를 분석함.", range, [], { evidence: { ok: false, hits: 0 }, specific: { ok: true, grounded: 2, total: 2 } });
    expect(r.rows.map((x) => x.key)).toContain("evidence");
    expect(r.passed).toContain("학생 근거 문장 2/2");
  });
});

describe("자동 검사 N38 (근거 없음 · 맞춤법)", () => {
  it("근거 없는 문장은 확인 행(점선 밑줄), 확정을 막지 않는다", () => {
    const t = "빗면 실험에서 변인을 정해 설계함. 광섬유의 원리로 관심을 넓혀 자료를 찾음.";
    const at = t.indexOf("광섬유");
    const r = autoCheck(t, range, [], undefined, undefined, { provenance: { nosource: [{ i: 1, start: at, end: t.length }] } });
    expect(r.status).toBe("check");
    const row = r.rows.find((x) => x.key === "nosource-1")!;
    expect(row).toMatchObject({ level: "warn", underline: "dotted", sentenceIndex: 1 });
    expect(row.detail).toContain("2번 문장");
    expect(r.passed).not.toContain("근거");
  });
  it("원안이 있고 근거 없는 문장이 없으면 '근거' 통과, 원안이 없으면 근거 항목 자체가 없다", () => {
    const t = "빗면 실험에서 변인을 정해 설계함. 오차 원인을 스스로 찾아 다시 측정함.";
    expect(autoCheck(t, range, [], undefined, undefined, { provenance: { nosource: [] } }).passed).toContain("근거");
    expect(check(t).passed).not.toContain("근거");
  });
  it("맞춤법 행: 규칙 사전 → 물결 밑줄 · 바꿀 말", () => {
    const r = check("빗면 실험에서 끝까지 확인할수 있도록 자료를 찾아 정리함.");
    const row = r.rows.find((x) => x.key.startsWith("spell-"))!;
    expect(row).toMatchObject({ level: "warn", underline: "wavy", origin: "rule", fix: { from: "확인할수", to: "확인할 수" } });
    expect(r.passed).not.toContain("맞춤법");
  });
  it("AI 맞춤법 결과는 규칙과 겹치지 않을 때만 행으로", () => {
    const t = "빗면 실험을 했읍니다 하고 확인할수 있도록 정리함.";
    const at = t.indexOf("했읍니다");
    const r = autoCheck(t, range, [], undefined, undefined, { spellAi: [{ start: at, end: at + 4, from: "했읍니다", to: "했습니다", kind: "맞춤법", why: "옛 표기", rule: "ai" }] });
    expect(r.rows.filter((x) => x.key.startsWith("spell-")).map((x) => x.origin)).toEqual(["ai", "rule"]);
  });
});
