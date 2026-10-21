import { describe, expect, it } from "vitest";
import { checkRows, myeongnyeolRows, readMyeongnyeol, readNoNameRoster } from "./roster";

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

describe("학번 · 이름 명단 읽기 (2026-10-22)", () => {
  it("학번에서 학년 · 반 · 번호, 빈 줄 · 다른 열은 건너뜀, 이름 앞 띄어쓰기 지움", () => {
    const r = readNoNameRoster([["학번", "이름", "", ""], ["10101", "가나다", "101", ""], ["", "", "", ""], ["30527", " 라마바", "305", ""]])!;
    expect(r.grades).toEqual([1, 3]);
    expect(r.rows.map((x) => [x.studentNo, x.grade, x.classNo, x.number, x.name, x.gender])).toEqual([["10101", "1", "1", "1", "가나다", ""], ["30527", "3", "5", "27", "라마바", ""]]);
  });
  it("학번 · 이름 제목이 없으면 null", () => {
    expect(readNoNameRoster([["번호", "성명"], ["1", "가나다"]])).toBeNull();
  });
});

describe("성별만 빈 줄의 중복", () => {
  it("이미 등록된 학번이면 성별을 고르기 전에 중복으로", () => {
    const r = readNoNameRoster([["학번", "이름"], ["20301", "가나다"], ["20302", "라마바"]])!;
    const checked = checkRows(r.rows, new Set(["20301"]));
    expect(checked.map((c) => c.status)).toEqual(["duplicate", "invalid"]);
    expect(checked[0].problems).toEqual(["이미 등록된 학생"]);
  });
});
