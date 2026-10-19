import { describe, expect, it } from "vitest";
import { canDeleteMaterial } from "./program";
import type { Student, TeacherRole, Viewer } from "./types";

// N33 올린 파일 지우기 권한
const teacher = (id: string, roles: TeacherRole[] = ["program"], homeroom: { grade: number; classNo: number } | null = null): Viewer => ({
  kind: "teacher", accountId: id, mustChangePassword: false, teacher: { id, name: "교사", roles, homeroom, dept: null },
});
const student = (id: string): Viewer => ({
  kind: "student", accountId: id, mustChangePassword: false,
  student: { id, pseudonymId: `P-${id}`, studentNo: "20301", grade: 2, classNo: 3, number: 1, name: "학생", gender: "남", track: 1, careerGoal: null } as Student,
});
const program = { id: "p", ownerId: "t-own", coOwnerIds: ["t-co"], status: "open" as const, endDate: "2026-10-20", targetIds: ["s-1", "s-2"] };
const mine = { programId: "p", studentId: "s-1", uploaderId: "s-1", matchedBy: "student" as const };
const byTeacher = { programId: "p", studentId: "s-1", uploaderId: "t-own", matchedBy: "manual" as const };
const T = "2026-10-19";

describe("올린 파일 지우기 (N33)", () => {
  it("담당 교사·공동 담당·관리자는 그 프로그램의 모든 자료를 지운다", () => {
    expect(canDeleteMaterial(teacher("t-own"), program, byTeacher, T)).toBe(true);
    expect(canDeleteMaterial(teacher("t-co"), program, mine, T)).toBe(true);
    expect(canDeleteMaterial(teacher("t-admin", ["admin"]), program, mine, T)).toBe(true);
    // 마감 뒤에도 교사는 지울 수 있다
    expect(canDeleteMaterial(teacher("t-own"), { ...program, status: "closed" }, mine, T)).toBe(true);
  });
  it("담임·다른 교사는 못 지운다", () => {
    expect(canDeleteMaterial(teacher("t-hr", ["homeroom"], { grade: 2, classNo: 3 }), program, mine, T)).toBe(false);
    expect(canDeleteMaterial(teacher("t-other"), program, byTeacher, T)).toBe(false);
  });
  it("다른 프로그램의 자료는 안 된다", () => {
    expect(canDeleteMaterial(teacher("t-own"), program, { ...byTeacher, programId: "q" }, T)).toBe(false);
  });
  it("학생은 마감 전 내가 올린 내 파일만", () => {
    expect(canDeleteMaterial(student("s-1"), program, mine, T)).toBe(true);
    expect(canDeleteMaterial(student("s-1"), program, mine, "2026-10-20")).toBe(true);
    expect(canDeleteMaterial(student("s-2"), program, mine, T)).toBe(false);
    expect(canDeleteMaterial(student("s-1"), program, byTeacher, T)).toBe(false);
    expect(canDeleteMaterial(student("s-1"), program, { ...mine, matchedBy: "manual" }, T)).toBe(false);
  });
  it("학생은 마감 뒤·마감된 프로그램·대상이 아니면 못 지운다", () => {
    expect(canDeleteMaterial(student("s-1"), program, mine, "2026-10-21")).toBe(false);
    expect(canDeleteMaterial(student("s-1"), { ...program, status: "closed" }, mine, T)).toBe(false);
    expect(canDeleteMaterial(student("s-1"), { ...program, targetIds: ["s-2"] }, mine, T)).toBe(false);
  });
});
