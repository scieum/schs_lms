import { describe, expect, it } from "vitest";
import { checkExternal, externalNo, parseExternalPaste } from "./joint-curriculum";
import { studentsInCourse } from "./setuk";
import type { Student } from "./types";

describe("공동교육과정 다른 학교 학생 (N54)", () => {
  it("학번 칸은 학교 + 학년반번호", () => {
    expect(externalNo({ school: "강릉고", grade: 2, classNo: 3, number: 7 })).toBe("강릉고 20307");
  });
  it("한 명 검사", () => {
    expect(checkExternal({ school: "강릉고", grade: 2, classNo: 3, number: 7, name: "학생가" })).toBeNull();
    expect(checkExternal({ school: "", grade: 2, classNo: 3, number: 7, name: "학생가" })).toMatch(/학교/);
    expect(checkExternal({ school: "강릉고", grade: 4, classNo: 3, number: 7, name: "학생가" })).toMatch(/학년/);
    expect(checkExternal({ school: "강릉고", grade: 2, classNo: 3, number: 7, name: " " })).toMatch(/이름/);
  });
  it("엑셀 붙여넣기: 탭 · 쉼표 · 공백, 머리 줄 건너뜀, '등학교' · '학년' · '반' · '번' 떼기", () => {
    const text = "학교\t학년\t반\t번호\t이름\n강릉고등학교\t2학년\t3반\t7번\t학생가\n양양고, 2, 1, 4, 학생나\n속초여고 2 4 3 학생다\n\n틀린줄";
    const r = parseExternalPaste(text);
    expect(r.rows).toEqual([
      { school: "강릉고", grade: 2, classNo: 3, number: 7, name: "학생가" },
      { school: "양양고", grade: 2, classNo: 1, number: 4, name: "학생나" },
      { school: "속초여고", grade: 2, classNo: 4, number: 3, name: "학생다" },
    ]);
    expect(r.bad).toBe(1);
  });
  it("학교를 뺀 줄은 기본 학교로", () => {
    expect(parseExternalPaste("2\t5\t12\t학생라", { school: "강릉고" }).rows[0]).toEqual({ school: "강릉고", grade: 2, classNo: 5, number: 12, name: "학생라" });
  });
  it("고정반 과목에는 같은 학년 · 반이어도 다른 학교 학생이 안 들어온다", () => {
    const st = (id: string, school?: string): Student => ({ id, pseudonymId: id, studentNo: id, grade: 2, classNo: 3, number: 1, name: id, gender: "남", track: 1, careerGoal: null, ...(school ? { school } : {}) });
    const course = { id: "c", year: 2026, grade: 2, semester: 2 as const, subject: "물리학", group: "과학" as const, type: null, credits: 4 };
    const list = studentsInCourse([st("a"), st("b", "강릉고")], course, { teacherId: "t", courseId: "c", classes: [3], mode: "fixed" });
    expect(list.map((s) => s.id)).toEqual(["a"]);
    const moving = studentsInCourse([st("a"), st("b", "강릉고")], course, { teacherId: "t", courseId: "c", classes: [], mode: "moving", sections: ["공동"] }, [{ section: "공동", studentIds: ["a", "b"] }]);
    expect(moving.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
