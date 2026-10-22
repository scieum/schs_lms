import { describe, expect, it } from "vitest";
import { courseSections, sectionAllowed, studentsInCourse } from "./setuk";
import type { Course } from "./curriculum";
import type { Student } from "./types";

const course = { id: "c", year: 2026, grade: 2, semester: 2, subject: "화학", group: "과학", type: "일반 선택", credits: 4, active: true } as Course;
const st = (id: string, classNo: number, number: number) => ({ id, studentNo: `2${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade: 2, classNo, number, name: id }) as Student;
const students = [st("a", 1, 1), st("b", 2, 1), st("c", 3, 1)];

describe("고정반도 반마다 따로 (2026-10-22)", () => {
  const fixed = { teacherId: "t", courseId: "c", classes: [2, 1] };
  it("고정반 여러 반 → 반마다 칸, 한 반 → 하나", () => {
    expect(courseSections(fixed)).toEqual(["1반", "2반"]);
    expect(courseSections({ ...fixed, classes: [3] })).toEqual([null]);
    expect(courseSections({ ...fixed, classes: [], mode: "moving", sections: ["1분반"] })).toEqual(["1분반"]);
  });
  it("'2반' 칸이면 그 반 학생만, 맡지 않은 반은 막음", () => {
    expect(studentsInCourse(students, course, fixed, null, "2반").map((s) => s.id)).toEqual(["b"]);
    expect(studentsInCourse(students, course, fixed, null, null).map((s) => s.id)).toEqual(["a", "b"]);
    expect(sectionAllowed(fixed, "2반")).toBe(true);
    expect(sectionAllowed(fixed, "3반")).toBe(false);
    expect(sectionAllowed(fixed, null)).toBe(true);
  });
});
