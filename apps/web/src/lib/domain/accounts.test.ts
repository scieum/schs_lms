import { describe, expect, it } from "vitest";
import {
  accountStatus, auditFlags, checkRoleChange, checkSignup, csvCell, dailyCheck, homeroomTakenBy, isStale, kstDateLabel,
  lastSeenLabel, MANUAL_LOCK_UNTIL, normalizeRoles, parseHomeroom, parseTeacherRoster, periodStart, signupRoles,
} from "./accounts";

describe("교사 명부 붙여넣기", () => {
  const existing = [{ name: "최현우", homeroom: { grade: 1, classNo: 1 } }];
  it("탭 표: 머리글 건너뛰고 이름·부서·담임 반", () => {
    const rows = parseTeacherRoster("이름\t부서\t담임\n김민지\t국어과\t1-3\n박서준\t과학과\t담임 없음", existing);
    expect(rows).toEqual([
      { line: 2, name: "김민지", dept: "국어과", homeroom: { grade: 1, classNo: 3 }, error: null },
      { line: 3, name: "박서준", dept: "과학과", homeroom: null, error: null },
    ]);
  });
  it("공백·쉼표 줄, 2학년 3반, 순서가 달라도", () => {
    const rows = parseTeacherRoster("수학과 이도윤 2학년 3반\n정하은, 영어과, 3-12", existing);
    expect(rows.map((r) => [r.name, r.dept, r.homeroom])).toEqual([
      ["이도윤", "수학과", { grade: 2, classNo: 3 }],
      ["정하은", "영어과", { grade: 3, classNo: 12 }],
    ]);
  });
  it("이미 있는 이름·담임 반, 명부 안 중복은 오류", () => {
    const rows = parseTeacherRoster("최현우\t국어과\n한지민\t과학과\t1-1\n윤서연\t\t2-2\n강다은\t\t2-2\n윤서연", existing);
    expect(rows.map((r) => r.error)).toEqual([
      "이미 있는 이름이에요", "1학년 1반은 최현우 선생님이 담임이에요", null, "2학년 2반 담임이 명부에 두 명이에요", "명부에 두 번 있어요",
    ]);
  });
  it("동명이인 숫자를 담임 반으로 읽지 않는다", () => {
    expect(parseHomeroom("김민수2\t과학과")).toBeNull();
    expect(parseHomeroom("2학년3반")).toEqual({ grade: 2, classNo: 3 });
  });
});

describe("오늘 점검", () => {
  it("급한 순서, 없는 항목은 뺀다", () => {
    const items = dailyCheck({ errors: 2, waiting: 3, flagged: 0, overSubjects: ["2학년 기하"], locked: 1 });
    expect(items.map((i) => i.key)).toEqual(["errors", "over", "locked", "waiting"]);
    expect(dailyCheck({ errors: 0, waiting: 0, flagged: 0, overSubjects: [], locked: 0 })).toEqual([]);
  });
});

const now = new Date("2026-10-16T03:00:00Z"); // 한국 12:00

describe("교사 가입", () => {
  it("교사가 0명이면 첫 가입자는 관리자(교육과정부)가 된다", () => {
    expect(signupRoles(0)).toEqual({ roles: ["admin", "subject"], dept: "교육과정부" });
  });
  it("이후 가입자는 일반 교사", () => {
    expect(signupRoles(1)).toEqual({ roles: ["subject"], dept: null });
    expect(signupRoles(58).roles).not.toContain("admin");
  });
  it("인증코드·이름·비밀번호를 검사한다", () => {
    const ok = { name: "최현우", password: "goodpass1", confirm: "goodpass1", code: "schs-2026" };
    expect(checkSignup(ok, "schs-2026")).toBeNull();
    expect(checkSignup({ ...ok, code: "wrong" }, "schs-2026")).toMatch(/인증코드/);
    expect(checkSignup({ ...ok, name: "최" }, "schs-2026")).toMatch(/2~20자/);
    expect(checkSignup({ ...ok, name: "최현우!" }, "schs-2026")).toMatch(/한글·영문/);
    expect(checkSignup({ ...ok, password: "short", confirm: "short" }, "schs-2026")).toMatch(/8자/);
    expect(checkSignup({ ...ok, password: "schs-2026", confirm: "schs-2026" }, "schs-2026")).toMatch(/인증코드와 다른/);
    expect(checkSignup({ ...ok, confirm: "different1" }, "schs-2026")).toMatch(/같지 않아요/);
  });
});

describe("계정 상태", () => {
  it("잠김 > 대기 > 활성", () => {
    expect(accountStatus({ mustChangePassword: true, lockedUntil: MANUAL_LOCK_UNTIL }, now)).toBe("잠김");
    expect(accountStatus({ mustChangePassword: true, lockedUntil: null }, now)).toBe("대기");
    expect(accountStatus({ mustChangePassword: false, lockedUntil: "2026-10-15T00:00:00Z" }, now)).toBe("활성");
  });
  it("90일 이상 접속하지 않으면 오래 쓰지 않은 계정", () => {
    expect(isStale(new Date(now.getTime() - 90 * 86400000).toISOString(), now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 89 * 86400000).toISOString(), now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
  });
  it("최근 접속을 짧게 적는다", () => {
    expect(lastSeenLabel(null, now)).toBe("접속 없음");
    expect(lastSeenLabel("2026-10-16T02:58:00Z", now)).toBe("지금");
    expect(lastSeenLabel("2026-10-15T23:12:00Z", now)).toBe("오늘 08:12");
    expect(lastSeenLabel("2026-10-15T05:00:00Z", now)).toBe("어제");
    expect(lastSeenLabel("2026-07-16T03:00:00Z", now)).toBe("92일 전");
  });
});

describe("역할 바꾸기", () => {
  const teachers = [
    { id: "a", name: "정다은", roles: ["admin", "subject"] as const, homeroom: null },
    { id: "b", name: "박지훈", roles: ["homeroom", "subject"] as const, homeroom: { grade: 2, classNo: 3 } },
  ].map((t) => ({ ...t, roles: [...t.roles] }));

  it("마지막 관리자는 관리자 역할을 뺄 수 없다", () => {
    expect(checkRoleChange(teachers, "a", ["subject"])).toMatch(/마지막 관리자/);
    expect(checkRoleChange(teachers, "a", ["admin"])).toBeNull();
  });
  it("관리자가 둘이면 한 명은 뺄 수 있다", () => {
    const two = [...teachers, { id: "c", name: "새교사", roles: ["admin" as const], homeroom: null }];
    expect(checkRoleChange(two, "a", ["subject"])).toBeNull();
  });
  it("없는 교사는 실패", () => {
    expect(checkRoleChange(teachers, "z", ["subject"])).toMatch(/없는/);
  });
  it("담임 반이 있으면 담임 역할을 붙이고 없으면 뗀다", () => {
    expect(normalizeRoles(["subject"], { grade: 1, classNo: 2 })).toEqual(["homeroom", "subject"]);
    expect(normalizeRoles(["homeroom", "subject"], null)).toEqual(["subject"]);
    expect(normalizeRoles([], null)).toEqual(["subject"]);
    expect(normalizeRoles(["admin"], null)).toEqual(["admin", "subject"]);
  });
  it("같은 반 담임이 겹치면 알려준다", () => {
    expect(homeroomTakenBy(teachers, "a", { grade: 2, classNo: 3 })).toBe("박지훈");
    expect(homeroomTakenBy(teachers, "b", { grade: 2, classNo: 3 })).toBeNull();
  });
});

describe("감사 로그", () => {
  it("오늘은 한국 시간 0시부터", () => {
    expect(periodStart("today", now).toISOString()).toBe("2026-10-15T15:00:00.000Z");
    expect(periodStart("week", now).getTime()).toBe(now.getTime() - 7 * 86400000);
  });
  it("날짜 머리", () => {
    expect(kstDateLabel("2026-10-16T00:12:00Z")).toBe("10.16 (금)");
  });
  it("대량 열람·야간 열람·잠김을 표시한다", () => {
    const f = auditFlags([
      { id: "1", actorId: "t", action: "record.view", target: "학생 기록 38건", at: "2026-10-15T13:10:00Z" },
      { id: "2", actorId: "t", action: "record.view", target: "S001", at: "2026-10-15T14:00:00Z" }, // 23시
      { id: "3", actorId: "t", action: "record.view", target: "S002", at: "2026-10-16T01:00:00Z" }, // 10시
      { id: "4", actorId: "s", action: "login.locked", target: null, at: "2026-10-16T01:00:00Z" },
      { id: "5", actorId: "t", action: "draft.confirm", target: "12건", at: "2026-10-15T14:00:00Z" },
    ]);
    expect(f.get("1")).toBe("대량 열람");
    expect(f.get("2")).toBe("야간 열람");
    expect(f.has("3")).toBe(false);
    expect(f.get("4")).toBe("잠김");
    expect(f.has("5")).toBe(false);
  });
  it("10분 안에 30번 열람하면 대량 열람", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, actorId: "t", action: "record.view", target: `S${i}`, at: new Date(Date.UTC(2026, 9, 16, 1, 0, i * 10)).toISOString() }));
    expect(auditFlags(rows).get("r29")).toBe("대량 열람");
    expect(auditFlags(rows.slice(0, 29)).has("r28")).toBe(false);
  });
  it("CSV 칸을 안전하게 감싼다", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("plain")).toBe("plain");
  });
});
