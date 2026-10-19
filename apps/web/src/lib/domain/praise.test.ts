import { describe, expect, it } from "vitest";
import { evidenceAmount, findTopPraise, isFewEvidence, overPraise, praisePrompt } from "./praise";
import { autoCheck, fixableRows } from "./auto-check";

const range = { unit: "bytes" as const, min: 10, max: 1500, capped: false };
const TEXT = "빗면 실험에서 각도를 바꿔 가속도를 측정하고 차이의 원인을 마찰로 설명하는 모습이 돋보임. 개념 이해가 탁월함.";

describe("과장 막기 (N41)", () => {
  it("최상급 칭찬어를 자리와 함께 찾는다", () => {
    const hits = findTopPraise(TEXT);
    expect(hits.map((h) => h.word)).toEqual(["돋보임", "탁월함"]);
    expect(TEXT.slice(hits[0].start, hits[0].end)).toBe("돋보임");
    expect(hits[0].soft).toBe("드러남");
    expect(findTopPraise("인상 깊었음. 두드러진 변화. 뛰어난 이해").map((h) => h.stem)).toEqual(["인상깊", "두드러", "뛰어"]);
    expect(findTopPraise("측정하고 설명함.")).toEqual([]);
  });

  it("수준을 안 골랐고 근거에 없으면 걸린다 · 근거에 있거나 A·상이면 안 걸린다", () => {
    expect(overPraise(TEXT, null, "각도 바꿔 측정, 마찰로 설명").map((h) => h.word)).toEqual(["돋보임", "탁월함"]);
    expect(overPraise(TEXT, null, "개념 이해가 탁월했음").map((h) => h.word)).toEqual(["돋보임"]);
    expect(overPraise(TEXT, "B", "")).toHaveLength(2);
    expect(overPraise(TEXT, "A", "")).toEqual([]);
    expect(overPraise(TEXT, "상", "")).toEqual([]);
  });

  it("근거 양: 메모 2개 이하나 짧으면 적다", () => {
    expect(isFewEvidence(evidenceAmount(["메모 하나"]))).toBe(true);
    expect(isFewEvidence(evidenceAmount(["", "  "]))).toBe(true);
    expect(isFewEvidence(evidenceAmount(Array(5).fill("가".repeat(50))))).toBe(false);
    expect(isFewEvidence(evidenceAmount(Array(5).fill("가")))).toBe(true);
  });

  it("프롬프트: 안 고르면 사실 그대로 · 적으면 총평 금지 · 학생 정보 없음", () => {
    const few = praisePrompt(null, { count: 1, chars: 40 });
    expect(few).toContain("성취수준을 고르지 않았음");
    expect(few).toContain("LV1~LV2");
    expect(few).toContain("총평");
    expect(few).toContain("LV3 서술어도 쓰지 않음");
    expect(few).not.toMatch(/S\d{3}|가명/);
    const many = praisePrompt(null, { count: 5, chars: 400 });
    expect(many).not.toContain("근거 자료가 5개로 적음");
    expect(praisePrompt("A", { count: 5, chars: 400 })).toContain("한 번까지만");
    expect(praisePrompt("D", { count: 5, chars: 400 })).toContain("우수함과 최상급 칭찬어");
    expect(praisePrompt("C", { count: 5, chars: 400 })).toContain("직접 적혀 있을 때만");
  });

  it("자동 검사 행 '근거보다 높은 평가' (확인 · 고칠 말 · 밑줄)", () => {
    const c = autoCheck(TEXT, range, [], undefined, undefined, { praise: { level: null, evidence: "각도 바꿔 측정" } });
    const rows = c.rows.filter((r) => r.key.startsWith("praise-"));
    expect(rows.map((r) => r.label)).toEqual(["근거보다 높은 평가 '돋보임'", "근거보다 높은 평가 '탁월함'"]);
    expect(rows.every((r) => r.level === "warn")).toBe(true);
    expect(rows[0].fix).toEqual({ from: "돋보임", to: "드러남" });
    expect(rows[0].ranges).toHaveLength(1);
    expect(fixableRows(c).some((r) => r.key === "praise-돋보임")).toBe(true);
    expect(c.status).not.toBe("block");
    // 근거를 모르면(praise 없음) 행이 없다 · A면 통과
    expect(autoCheck(TEXT, range, []).rows.some((r) => r.key.startsWith("praise-"))).toBe(false);
    expect(autoCheck(TEXT, range, [], undefined, undefined, { praise: { level: "A", evidence: "" } }).passed).toContain("평가 수위");
  });
});
