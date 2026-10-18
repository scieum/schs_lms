import { describe, expect, it } from "vitest";
import data from "@/lib/data/standards-2022-high.json";
import { findSubject, pickStandards, standardsBlock, type SubjectStandards } from "./standards";

const all = data.subjects as Record<string, SubjectStandards>;

describe("성취기준 매핑", () => {
  it("앱 과목 이름으로 찾기 (띄어쓰기·로마 숫자·분반 이름)", () => {
    expect(findSubject(all, "물리학")?.[0]).toBe("물리학");
    expect(findSubject(all, "미적분 1")?.[0]).toBe("미적분Ⅰ");
    expect(findSubject(all, "물리학 2분반")?.[0]).toBe("물리학");
    expect(findSubject(all, "없는과목")).toBeNull();
  });
  it("활동과 겹치는 성취기준부터 고른다", () => {
    const [, phys] = findSubject(all, "물리학")!;
    const picked = pickStandards(phys, "빗면에서 수레의 역학적 에너지 보존을 측정하고 운동 에너지와 위치 에너지를 비교함");
    expect(picked.length).toBeGreaterThan(0);
    expect(picked[0].code).toBe("[12물리01-04]");
  });
  it("겹치는 게 없으면 단원·내용 요소만", () => {
    const [, phys] = findSubject(all, "물리학")!;
    const block = standardsBlock("물리학", phys, "모둠 발표를 준비함");
    expect(block).toContain("단원:");
    expect(block).not.toContain("[12물리");
  });
});
