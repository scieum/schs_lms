import { describe, expect, it } from "vitest";
import { classesOf, filterStudents, movedNote, otherSectionOf, pickAll, pickedByClass, pickState, planPick, togglePick, type PickStudent } from "./roster-pick";

const st = (id: string, grade: number, classNo: number, number: number, name: string): PickStudent =>
  ({ id, studentNo: `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade, classNo, number, name });
const list = [st("d", 2, 3, 2, "학생D"), st("c", 2, 3, 1, "학생C"), st("a", 2, 1, 3, "학생A"), st("b", 2, 4, 12, "학생B"), st("z", 1, 3, 1, "학생Z")];

describe("직접 고르기 거르기", () => {
  it("학년·반으로 거르고 학번 순으로 놓는다", () => {
    expect(filterStudents(list, { grade: 2, classNo: 3, q: "" }).map((s) => s.id)).toEqual(["c", "d"]);
    expect(filterStudents(list, { grade: 2, classNo: null, q: "" }).map((s) => s.id)).toEqual(["a", "c", "d", "b"]);
  });
  it("찾는 말이 있으면 학년·반과 상관없이 이름이나 학번 앞자리로 찾는다", () => {
    expect(filterStudents(list, { grade: 2, classNo: 3, q: "학생 Z" }).map((s) => s.id)).toEqual(["z"]);
    expect(filterStudents(list, { grade: 1, classNo: null, q: "204" }).map((s) => s.id)).toEqual(["b"]);
  });
  it("반 목록과 반마다 고른 수", () => {
    expect(classesOf(list, 2)).toEqual([1, 3, 4]);
    expect(pickedByClass(list, ["c", "d", "a", "z"], 2)).toEqual({ 1: 1, 3: 2 });
  });
});

describe("직접 고르기 고르기", () => {
  it("한 명 넣기·빼기", () => {
    expect(togglePick(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
  });
  it("보이는 학생 모두 고르기·빼기는 다른 학생을 건드리지 않는다", () => {
    expect(pickAll(["a"], ["c", "d"], true)).toEqual(["a", "c", "d"]);
    expect(pickAll(["a", "c", "d"], ["c", "d"], false)).toEqual(["a"]);
    expect(pickState(["a", "c"], ["c", "d"])).toBe("some");
    expect(pickState(["c", "d"], ["c", "d"])).toBe("all");
    expect(pickState([], [])).toBe("none");
  });
});

describe("다른 분반에서 옮기기", () => {
  const members = { "1분반": ["a", "c"], "2분반": ["d", "b"], "3분반": [] };
  it("다른 분반 표시는 지금 분반을 뺀다", () => {
    const m = otherSectionOf(members, "1분반");
    expect(m.get("d")).toBe("2분반");
    expect(m.has("a")).toBe(false);
  });
  it("저장하면 고른 학생은 다른 분반에서 빠진다", () => {
    const p = planPick(members, "1분반", ["a", "d", "d"]);
    expect(p.ids).toEqual(["a", "d"]);
    expect(p.others).toEqual([{ section: "2분반", ids: ["b"], moved: 1 }]);
    expect(p.moved).toBe(1);
    expect(movedNote(members, "1분반", ["a", "d", "b"])).toBe("2분반에서 2명");
  });
  it("옮기는 학생이 없으면 다른 분반은 그대로", () => {
    expect(planPick(members, "3분반", ["z"]).others).toEqual([]);
  });
});
