import { describe, expect, it } from "vitest";
import {
  assignedStudents, canReadCounsel, canViewStudentRecord, cleanCareerGoal, counselStats, gradeTabs, latestCounsel,
  matchRecs, recordsForStudent, semesterStart, studentCanSeeYear, visibleCounsel, weekStart, yearOfGrade,
  type CounselRecord, type PastRecord,
} from "./counsel";
import type { Student, Teacher, Viewer } from "./types";

const st = (id: string, grade: number, classNo: number) =>
  ({ id, pseudonymId: id, studentNo: "", grade, classNo, number: 1, name: id, gender: "남", track: 1, careerGoal: null }) as Student;
const teacher = (id: string, roles: Teacher["roles"], homeroom: Teacher["homeroom"] = null): Viewer => ({
  kind: "teacher", accountId: id, mustChangePassword: false, teacher: { id, name: id, roles, homeroom, dept: null },
});
const student = (s: Student): Viewer => ({ kind: "student", accountId: s.id, mustChangePassword: false, student: s });
const rec = (id: string, studentId: string, authorId: string, date = "2026-10-01", prevId: string | null = null): CounselRecord =>
  ({ id, studentId, authorId, area: "진로", date, content: "x", prevId, createdAt: `${date}T00:00:00Z` });

const minjun = st("s-1", 2, 3);
const other = st("s-4", 2, 1);
const subjectA = teacher("t-a", ["subject"]);
const subjectB = teacher("t-b", ["subject"]);
const homeroom = teacher("t-h", ["homeroom", "subject"], { grade: 2, classNo: 3 });
const admin = teacher("t-admin", ["admin"]);

describe("상담 기록 열람 (C6)", () => {
  it("교과교사는 자기가 쓴 기록만", () => {
    expect(canReadCounsel(subjectA, rec("1", "s-1", "t-a"), minjun)).toBe(true);
    expect(canReadCounsel(subjectA, rec("2", "s-1", "t-b"), minjun)).toBe(false);
    expect(canReadCounsel(subjectB, rec("1", "s-1", "t-a"), minjun)).toBe(false);
  });
  it("담임은 자기 반 학생 기록 전체(다른 교사 작성분 포함)", () => {
    expect(canReadCounsel(homeroom, rec("1", "s-1", "t-a"), minjun)).toBe(true);
    expect(canReadCounsel(homeroom, rec("3", "s-4", "t-a"), other)).toBe(false);
    expect(canReadCounsel(homeroom, rec("4", "s-4", "t-h"), other)).toBe(true); // 다른 반이어도 자기가 쓴 것
  });
  it("관리자는 전체, 학생은 불가", () => {
    expect(canReadCounsel(admin, rec("1", "s-4", "t-a"), other)).toBe(true);
    expect(canReadCounsel(student(minjun), rec("1", "s-1", "t-a"), minjun)).toBe(false);
  });
  it("비밀번호를 바꾸기 전에는 불가 (C9)", () => {
    expect(canReadCounsel({ ...subjectA, mustChangePassword: true }, rec("1", "s-1", "t-a"), minjun)).toBe(false);
  });
  it("visibleCounsel 은 볼 수 있는 것만 남긴다", () => {
    const all = [rec("1", "s-1", "t-a"), rec("2", "s-1", "t-b"), rec("3", "s-4", "t-b"), rec("4", "zz", "t-a")];
    const map = new Map([["s-1", minjun], ["s-4", other]]);
    expect(visibleCounsel(subjectA, all, map).map((r) => r.id)).toEqual(["1"]);
    expect(visibleCounsel(homeroom, all, map).map((r) => r.id)).toEqual(["1", "2"]);
    expect(visibleCounsel(admin, all, map).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(visibleCounsel(student(minjun), all, map)).toEqual([]);
  });
});

describe("상담 기록 버전 (C4)", () => {
  it("고친 기록은 마지막 버전만, 최신 날짜 먼저", () => {
    const list = latestCounsel([rec("a", "s-1", "t", "2026-09-01"), rec("b", "s-1", "t", "2026-10-01"), rec("c", "s-1", "t", "2026-10-02", "a")]);
    expect(list.map((r) => r.id)).toEqual(["c", "b"]);
  });
});

describe("숫자 타일", () => {
  const now = new Date(2026, 9, 16); // 2026-10-16 (금)
  it("이번 주는 월요일부터, 학기는 9월부터", () => {
    expect(weekStart(now)).toBe("2026-10-12");
    expect(semesterStart(now)).toBe("2026-09-01");
    expect(semesterStart(new Date(2026, 4, 1))).toBe("2026-03-01");
    expect(semesterStart(new Date(2027, 0, 5))).toBe("2026-09-01");
  });
  it("상담 수와 기록 없는 학생", () => {
    const s = counselStats(["s-1", "s-2", "s-3"], [rec("1", "s-1", "t", "2026-10-15"), rec("2", "s-1", "t", "2026-08-01"), rec("3", "s-2", "t", "2026-09-18"), rec("4", "x", "t", "2026-10-15")], now);
    expect(s).toEqual({ students: 3, semester: 2, week: 1, none: 1 });
  });
});

describe("담당 학생", () => {
  const all = [minjun, other, st("s-9", 1, 1)];
  const ctx = { courseClasses: [{ grade: 2, classes: [1] }], clubMemberIds: [] as string[], counseledIds: [] as string[] };
  it("관리자는 전체, 교과교사는 맡은 반만", () => {
    expect(assignedStudents(admin, all, ctx)).toHaveLength(3);
    expect(assignedStudents(subjectA, all, ctx).map((s) => s.id)).toEqual(["s-4"]);
    expect(assignedStudents(homeroom, all, { ...ctx, courseClasses: [] }).map((s) => s.id)).toEqual(["s-1"]);
    expect(assignedStudents(subjectA, all, { ...ctx, clubMemberIds: ["s-9"] }).map((s) => s.id)).toEqual(["s-9", "s-4"]);
    expect(assignedStudents(student(minjun), all, ctx)).toEqual([]);
  });
  it("학생 기록 모아 보기는 담임(자기 반)·관리자만", () => {
    expect(canViewStudentRecord(homeroom, minjun)).toBe(true);
    expect(canViewStudentRecord(homeroom, other)).toBe(false);
    expect(canViewStudentRecord(subjectA, minjun)).toBe(false);
    expect(canViewStudentRecord(admin, other)).toBe(true);
    expect(canViewStudentRecord(student(minjun), minjun)).toBe(false);
  });
});

describe("학생 생기부 열람 (C5)", () => {
  const pr = (id: string, studentId: string, year: number): PastRecord =>
    ({ id, studentId, year, grade: 1, area: "진로활동", title: "t", content: "c", teacherName: "x", confirmedAt: "2026-02-21" });
  it("지난 학년도만 본다", () => {
    expect(studentCanSeeYear(2025, 2026)).toBe(true);
    expect(studentCanSeeYear(2026, 2026)).toBe(false);
  });
  it("본인 것 + 지난 학년도만", () => {
    const list = [pr("a", "s-1", 2025), pr("b", "s-1", 2026), pr("c", "s-4", 2025)];
    expect(recordsForStudent(student(minjun), list, 2026).map((r) => r.id)).toEqual(["a"]);
    expect(recordsForStudent(admin, list, 2026)).toEqual([]);
  });
  it("학년 탭: 지금 학년은 잠김", () => {
    expect(gradeTabs(2)).toEqual([{ grade: 1, locked: false }, { grade: 2, locked: true }]);
    expect(yearOfGrade(1, 2, 2026)).toBe(2025);
  });
});

describe("추천", () => {
  const item = (id: string, careers: string[], createdAt = "2026-10-01") => ({ id, careers, createdAt });
  it("희망 진로와 맞는 것만, 정확히 맞는 것 먼저", () => {
    const items = [item("a", ["디자인"]), item("b", ["산업디자인"]), item("c", ["의학"]), item("d", [])];
    expect(matchRecs(items, "산업디자인").map((i) => i.id)).toEqual(["b", "a", "d"]);
    expect(matchRecs(items, null).map((i) => i.id)).toEqual(["d"]);
  });
  it("희망 진로 정리", () => {
    expect(cleanCareerGoal("  산업  디자인 ")).toBe("산업 디자인");
    expect(cleanCareerGoal("   ")).toBeNull();
  });
});
