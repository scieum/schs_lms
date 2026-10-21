import { describe, expect, it } from "vitest";
import { listLines, matchRoster } from "./class-roster";
import { readTemplate, TEMPLATES } from "./excel-template";
import { lockReasons, planTargets, rosterAuditLine } from "./program-roster";
import type { Student } from "./types";

const st = (id: string, grade: number, classNo: number, number: number, name: string) =>
  ({ id, pseudonymId: id, studentNo: `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade, classNo, number, name, gender: "남", track: 1, careerGoal: null }) as Student;

describe("프로그램 대상 계산 (N36)", () => {
  it("더하기: 지금 대상은 그대로, 새 학생만 뒤에 더한다", () => {
    const p = planTargets({ current: ["a", "b", "c"], matched: ["b", "d", "e", "d"], mode: "add", locked: new Set() });
    expect(p.next).toEqual(["a", "b", "c", "d", "e"]);
    expect(p.added).toEqual(["d", "e"]);
    expect(p.already).toBe(1);
    expect(p.removed).toEqual([]);
    expect(p.kept).toEqual([]);
  });

  it("바꾸기: 명단에 없는 학생은 빼되, 기록이 있는 학생은 남긴다", () => {
    const p = planTargets({ current: ["a", "b", "c", "x"], matched: ["b", "d"], mode: "replace", locked: new Set(["c", "x"]) });
    expect(p.removed).toEqual(["a"]);
    expect(p.kept).toEqual(["c", "x"]);
    expect(p.added).toEqual(["d"]);
    expect(p.next).toEqual(["b", "c", "x", "d"]);
  });

  it("바꾸기: 잠김은 함수로도 받는다 · 모두 명단에 있으면 빠지는 학생이 없다", () => {
    const p = planTargets({ current: ["a", "b"], matched: ["a", "b"], mode: "replace", locked: () => false });
    expect(p.next).toEqual(["a", "b"]);
    expect(p.removed).toEqual([]);
    expect(p.already).toBe(2);
  });

  it("빈 명단으로 바꾸면 기록 없는 학생만 빠진다", () => {
    const p = planTargets({ current: ["a", "b"], matched: [], mode: "replace", locked: new Set(["b"]) });
    expect(p.next).toEqual(["b"]);
    expect(p.removed).toEqual(["a"]);
  });

  it("잠김 까닭을 학생마다 모은다 (같은 까닭은 한 번)", () => {
    const m = lockReasons({ responded: ["a", "b"], materials: ["b", "b"], drafts: ["c"], reasons: ["d"] });
    expect(m.get("a")).toEqual(["설문"]);
    expect(m.get("b")).toEqual(["설문", "서류"]);
    expect(m.get("c")).toEqual(["초안"]);
    expect(m.get("d")).toEqual(["사유"]);
    expect(m.has("e")).toBe(false);
  });

  it("감사 줄에는 숫자만 남긴다", () => {
    const p = planTargets({ current: ["a", "b", "c"], matched: ["b", "d"], mode: "replace", locked: new Set(["c"]) });
    expect(rosterAuditLine("p1", "replace", p)).toBe("p1 replace +1 -1 keep 1 → 3명");
  });

  it("양식 줄 → 학번·학년반번호로 찾고 (공동) 덧붙임은 무시, 못 찾은 줄은 엑셀 줄 번호를 가진다", () => {
    const students = [st("a", 2, 1, 3, "김민준"), st("b", 2, 4, 12, "이서연"), st("c", 2, 6, 5, "박지훈")];
    const body = readTemplate([
      [...TEMPLATES.list.legacy!],
      ["20103", "", "", "", "김민준(공동)"],
      ["", "2", "4", "12", "이서연"],
      ["", "", "", "", ""],
      ["20605", "", "", "", "다른이름"],
    ], "list")!;
    const r = matchRoster(listLines(body), students);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "b"]);
    expect(r.unmatched.map((l) => l.line)).toEqual([5]);
  });
});
