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
    expect(r.passed).toEqual(["글자수", "학번·실명", "어미", "문체", "금칙어"]);
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
