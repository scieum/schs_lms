import { describe, expect, it } from "vitest";
import { findStudents } from "./collect";

const list = [{ no: "20504", name: "김태완" }, { no: "20705", name: "김태윤" }, { no: "20102", name: "김도윤" }];

describe("학생 찾기 (2026-10-22)", () => {
  it("학번 · 이름 일부, 띄어 쓴 말은 모두 맞아야", () => {
    expect(findStudents(list, "").length).toBe(3);
    expect(findStudents(list, "태").map((s) => s.no)).toEqual(["20504", "20705"]);
    expect(findStudents(list, "207").map((s) => s.name)).toEqual(["김태윤"]);
    expect(findStudents(list, "김 윤").map((s) => s.no)).toEqual(["20705", "20102"]);
    expect(findStudents(list, "박")).toEqual([]);
  });
});
