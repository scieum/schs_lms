import { describe, expect, it } from "vitest";
import { checkRows, myeongnyeolRows, readMyeongnyeol } from "./roster";

// 학교 명렬표 모양 (이름은 지어낸 것)
const grid = [
  ["3", "1", "3", "", ""],
  ["", "학생명렬표", "", "", ""],
  ["", "3학년 1반", "", "", "속초고등학교"],
  ["", "번호", "이   름", "", ""],
  ["", "1", "가나다", "", ""],
  ["", "2", "", "", ""],
  ["", "3", "라 마바", "", ""],
  ["", "30", "", "", ""],
  ["", "", "2명", "", ""],
];

describe("학교 명렬표 읽기", () => {
  it("학년 · 반 · 번호 · 이름 — 빈 번호와 합계 줄은 건너뜀", () => {
    const m = readMyeongnyeol(grid)!;
    expect(m.grade).toBe(3);
    expect(m.classNo).toBe(1);
    expect(m.students).toEqual([{ line: 5, number: 1, name: "가나다" }, { line: 7, number: 3, name: "라마바" }]);
  });
  it("학번을 만들고, 성별만 비면 '성별이 비어 있어요'", () => {
    const rows = myeongnyeolRows(readMyeongnyeol(grid)!);
    expect(rows.map((r) => r.studentNo)).toEqual(["30101", "30103"]);
    const checked = checkRows(rows, new Set());
    expect(checked[0].problems).toEqual(["성별이 비어 있어요"]);
    expect(checkRows(rows.map((r) => ({ ...r, gender: "남" })), new Set()).every((r) => r.status === "new")).toBe(true);
  });
  it("명렬표가 아니면 null", () => {
    expect(readMyeongnyeol([["학번", "학년", "반"], ["20101", "2", "1"]])).toBeNull();
  });
});
