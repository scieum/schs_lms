import { describe, expect, it } from "vitest";
import { can, homePath } from "./policy";
import { checkNewPassword } from "./password";
import { afterFailure, afterSuccess, isAdminLock, isLocked, MAX_FAILS } from "./lockout";
import { checkRows, makeStudentNo, matchHeaders, nextPseudonymIds, normalizeGender, summarize } from "./roster";
import type { Student, Teacher, Viewer } from "./types";

const student: Student = {
  id: "s1", pseudonymId: "S001", studentNo: "20312", grade: 2, classNo: 3, number: 12,
  name: "김민준", gender: "남", track: 1, careerGoal: null,
};
const teacher = (roles: Teacher["roles"], homeroom: Teacher["homeroom"] = null): Viewer => ({
  kind: "teacher", accountId: "t", mustChangePassword: false,
  teacher: { id: "t", name: "교사", roles, homeroom, dept: "교육과정부" },
});
const asStudent: Viewer = { kind: "student", accountId: "s1", mustChangePassword: false, student };

describe("권한", () => {
  it("관리자와 교사는 학생을 등록할 수 있고 학생은 못 한다", () => {
    expect(can(teacher(["admin"]), "student.register")).toBe(true);
    expect(can(teacher(["subject"]), "student.register")).toBe(true);
    expect(can(teacher(["homeroom"], { grade: 2, classNo: 3 }), "student.register")).toBe(true);
    expect(can(asStudent, "student.register")).toBe(false);
  });
  it("계정 관리·감사 로그는 관리자만", () => {
    expect(can(teacher(["admin"]), "account.manage")).toBe(true);
    expect(can(teacher(["subject", "homeroom"]), "account.manage")).toBe(false);
    expect(can(teacher(["subject"]), "audit.view")).toBe(false);
  });
  it("비밀번호를 바꾸기 전에는 아무 권한도 없다 (C9)", () => {
    const v = { ...teacher(["admin"]), mustChangePassword: true } as Viewer;
    expect(can(v, "student.register")).toBe(false);
    expect(can(v, "account.manage")).toBe(false);
  });
  it("역할별 홈", () => {
    expect(homePath(asStudent)).toBe("/student");
    expect(homePath(teacher(["admin", "subject"]))).toBe("/teacher");
    expect(homePath(teacher(["homeroom", "subject"], { grade: 2, classNo: 3 }))).toBe("/homeroom");
    expect(homePath(teacher(["subject"]))).toBe("/teacher");
  });
});

describe("비밀번호 규칙", () => {
  it("8자 미만, 인증코드와 같음, 불일치를 막는다", () => {
    expect(checkNewPassword("abc", "abc", "code")).toBe("too_short");
    expect(checkNewPassword("schs-2026", "schs-2026", "schs-2026")).toBe("same_as_initial");
    expect(checkNewPassword("abcd1234", "abcd1235", "code")).toBe("mismatch");
    expect(checkNewPassword("abcd1234", "abcd1234", "code")).toBeNull();
  });
});

describe("로그인 잠금", () => {
  it("관리자가 잠근 계정은 자동 잠금과 구분한다", () => {
    const now = new Date("2026-10-16T09:00:00Z");
    expect(isAdminLock({ failedCount: 0, lockedUntil: "9999-12-31T00:00:00Z" }, now)).toBe(true);
    expect(isAdminLock(afterFailure({ failedCount: MAX_FAILS - 1, lockedUntil: null }, now), now)).toBe(false);
  });
  const now = new Date("2026-10-16T09:00:00Z");
  it("5번 틀리면 10분 잠기고, 성공하면 초기화", () => {
    let s = afterSuccess();
    for (let i = 0; i < MAX_FAILS - 1; i++) s = afterFailure(s, now);
    expect(isLocked(s, now)).toBe(false);
    s = afterFailure(s, now);
    expect(isLocked(s, now)).toBe(true);
    expect(isLocked(s, new Date(now.getTime() + 9 * 60000))).toBe(true);
    expect(isLocked(s, new Date(now.getTime() + 11 * 60000))).toBe(false);
  });
  it("잠금이 풀린 뒤에는 실패 횟수를 1부터 센다", () => {
    const later = new Date(now.getTime() + 11 * 60000);
    const locked = { failedCount: 0, lockedUntil: new Date(now.getTime() + 10 * 60000).toISOString() };
    expect(afterFailure(locked, later)).toEqual({ failedCount: 1, lockedUntil: null });
  });
});

describe("학생 등록 — 엑셀", () => {
  it("양식과 다른 열 이름도 맞춘다", () => {
    const m = matchHeaders(["학년", "학급", "번호", "성명", "남녀"]);
    expect(m.missing).toEqual([]);
    expect(m.renamed.map((r) => r.from)).toEqual(["학급", "성명", "남녀"]);
  });
  it("없는 열을 알려준다 (계열은 없어도 됨)", () => {
    expect(matchHeaders(["학년", "반", "이름"]).missing).toEqual(["number", "gender"]);
  });
  it("성별 여러 표기", () => {
    expect(normalizeGender("남자")).toBe("남");
    expect(normalizeGender("F")).toBe("여");
    expect(normalizeGender("2")).toBe("여");
    expect(normalizeGender("기타")).toBeNull();
  });
  it("학번과 가명ID", () => {
    expect(makeStudentNo(2, 3, 12)).toBe("20312");
    expect(nextPseudonymIds(["S001", "S186"], 2)).toEqual(["S187", "S188"]);
    expect(nextPseudonymIds([], 1)).toEqual(["S001"]);
  });
  it("새 학생·중복·오류를 나눈다", () => {
    const rows = checkRows(
      [
        { grade: "2", classNo: "3", number: "31", name: "김하늘", gender: "여", track: "" },
        { grade: "2", classNo: "1", number: "7", name: "최지호", gender: "남", track: "1" },
        { grade: "2", classNo: "2", number: "29", name: "정예린", gender: "모름", track: "" },
        { grade: "2", classNo: "3", number: "31", name: "김하늘2", gender: "여", track: "" },
        { grade: "5", classNo: "3", number: "1", name: "이도윤", gender: "남", track: "" },
      ],
      new Set(["20107"]),
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "duplicate", "invalid", "invalid", "invalid"]);
    expect(rows[0].studentNo).toBe("20331");
    expect(rows[0].input.track).toBe(1); // 계열 비우면 1
    expect(rows[3].problems[0]).toContain("2행");
    expect(summarize(rows)).toEqual({ total: 5, ok: 1, duplicate: 1, invalid: 3 });
  });
});
