import { describe, expect, it } from "vitest";
import { areasFor, canLog, matchStudent, parseHours } from "./activity";
import type { Student, Teacher, Viewer } from "./types";

const st = (id: string, grade: number, classNo: number, name = id, no = "") =>
  ({ id, pseudonymId: id, studentNo: no, grade, classNo, number: 1, name, gender: "남", track: 1, careerGoal: null }) as Student;
const teacher = (homeroom: Teacher["homeroom"]): Viewer => ({
  kind: "teacher", accountId: "t", mustChangePassword: false,
  teacher: { id: "t", name: "교사", roles: homeroom ? ["homeroom", "subject"] : ["subject"], homeroom, dept: null },
});

describe("누가기록 권한", () => {
  it("담임만 자율·자치·진로, 모두 동아리", () => {
    expect(areasFor(teacher(null))).toEqual(["동아리"]);
    expect(areasFor(teacher({ grade: 2, classNo: 3 }))).toEqual(["동아리", "자율·자치", "진로"]);
  });
  it("자율·진로는 우리 반 학생만", () => {
    const v = teacher({ grade: 2, classNo: 3 });
    expect(canLog(v, "진로", st("a", 2, 3))).toBe(true);
    expect(canLog(v, "진로", st("b", 2, 1))).toBe(false);
    expect(canLog(teacher(null), "자율·자치", st("a", 2, 3))).toBe(false);
  });
  it("동아리는 내가 지도하는 동아리 부원만", () => {
    const v = teacher(null);
    const club = { advisorId: "t", memberIds: new Set(["a"]) };
    expect(canLog(v, "동아리", st("a", 1, 1), club)).toBe(true);
    expect(canLog(v, "동아리", st("b", 1, 1), club)).toBe(false);
    expect(canLog(v, "동아리", st("a", 1, 1), { advisorId: "x", memberIds: new Set(["a"]) })).toBe(false);
    expect(canLog(v, "동아리", st("a", 1, 1))).toBe(false);
  });
});

describe("봉사활동", () => {
  it("시간은 0.5 단위, 0 초과 24 이하", () => {
    expect(parseHours("3시간")).toBe(3);
    expect(parseHours("2.4")).toBe(2.5);
    expect(parseHours(0)).toBeNull();
    expect(parseHours("30")).toBe(30);
    expect(parseHours("300")).toBeNull();
    expect(parseHours("abc")).toBeNull();
  });
  it("학번 우선, 이름은 한 명일 때만", () => {
    const list = [st("a", 2, 3, "김민준", "20312"), st("b", 1, 1, "김민준", "10101"), st("c", 2, 1, "한지민", "20111")];
    expect(matchStudent(list, { studentNo: "2-03-12", name: "아무개" })?.id).toBe("a");
    expect(matchStudent(list, { name: "한 지민" })?.id).toBe("c");
    expect(matchStudent(list, { name: "김민준" })).toBeNull();
  });
});
