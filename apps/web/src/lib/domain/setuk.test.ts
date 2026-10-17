import { defaultClassMode, nextSection } from "./curriculum";
import { describe, expect, it } from "vitest";
import type { Course } from "./curriculum";
import { latestByStudent, statusLabel, studentsInCourse, type SetukRecord } from "./setuk";
import type { Student } from "./types";

const course: Course = { id: "c", year: 2026, grade: 2, semester: 1, subject: "물리학", group: "과학", type: "일반 선택", credits: 4 };
const st = (id: string, grade: number, classNo: number, number: number) =>
  ({ id, pseudonymId: id, studentNo: "", grade, classNo, number, name: id, gender: "남", track: 1, careerGoal: null }) as Student;
const rec = (studentId: string, at: string, status: SetukRecord["status"], content = "내용") =>
  ({ id: at, courseId: "c", studentId, authorId: "t", content, unit: "bytes", max: 1500, status, createdAt: at }) as SetukRecord;

describe("교과 세특", () => {
  it("과목 학년 + 맡은 반 학생만, 반·번호 순", () => {
    const list = [st("a", 2, 3, 5), st("b", 2, 1, 2), st("c", 1, 1, 1), st("d", 2, 2, 1), st("e", 2, 3, 1)];
    const r = studentsInCourse(list, course, { teacherId: "t", courseId: "c", classes: [1, 3] });
    expect(r.map((s) => s.id)).toEqual(["b", "e", "a"]);
    expect(studentsInCourse(list, course, undefined)).toEqual([]);
  });
  it("학생마다 마지막 버전만 쓴다 (앞 버전은 남아 있음)", () => {
    const m = latestByStudent([rec("a", "2026-10-01", "draft"), rec("a", "2026-10-03", "confirmed"), rec("a", "2026-10-02", "draft")]);
    expect(m.get("a")?.status).toBe("confirmed");
  });
  it("상태 이름", () => {
    expect(statusLabel(undefined)).toBe("미작성");
    expect(statusLabel(rec("a", "x", "draft", "  "))).toBe("미작성");
    expect(statusLabel(rec("a", "x", "draft"))).toBe("작성 중");
    expect(statusLabel(rec("a", "x", "confirmed"))).toBe("확정");
  });
});

describe("이동반 분반", () => {
  const course = { id: "c", year: 2026, grade: 2, semester: 1, subject: "물리학", group: "과학", type: "일반 선택", credits: 4 } as const;
  const s = (id: string, classNo: number, number: number) => ({ id, pseudonymId: id, studentNo: `2${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade: 2, classNo, number, name: id, gender: "남", track: 1, careerGoal: null });
  const list = [s("a", 1, 1), s("b", 4, 2), s("c", 6, 3)] as never[];
  const moving = { teacherId: "t", courseId: "c", classes: [], mode: "moving" as const, sections: ["1분반", "2분반"] };
  const rosters = [{ section: "1분반", studentIds: ["c", "a"] }, { section: "2분반", studentIds: ["b"] }, { section: "옛분반", studentIds: ["x"] }];
  it("분반을 고르면 그 분반만, 안 고르면 모든 분반을 합쳐서", () => {
    expect(studentsInCourse(list, course as never, moving, rosters, "1분반").map((x: { id: string }) => x.id)).toEqual(["a", "c"]);
    expect(studentsInCourse(list, course as never, moving, rosters).map((x: { id: string }) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("고정반은 명단이 있어도 반 기준", () => {
    expect(studentsInCourse(list, course as never, { teacherId: "t", courseId: "c", classes: [4] }, rosters).map((x: { id: string }) => x.id)).toEqual(["b"]);
  });
  it("기본 방식과 다음 분반 이름", () => {
    expect(defaultClassMode({ grade: 1, type: "공통" })).toBe("fixed");
    expect(defaultClassMode({ grade: 2, type: "일반 선택" })).toBe("moving");
    expect(nextSection(["1분반", "3분반"])).toBe("2분반");
  });
});
