import { describe, expect, it } from "vitest";
import {
  absencePattern, addDays, cellStatus, checkApplication, dailyRates, dayLabel, deadlineOf, isPastDeadline, isYmd, nextAttend, periodSummary,
  remainingSeats, seoulNow, sessionTime, studentDays, suggestPattern, weekDays, weekStart, type NightAttendance, type NightSignup,
} from "./night";

const su = (studentId: string, date: string, session: NightSignup["session"] = "both", place: NightSignup["place"] = "자습실 A"): NightSignup => ({ studentId, date, session, place, status: "신청" });
const at = (studentId: string, date: string, period: 1 | 2, status: NightAttendance["status"] = "출석"): NightAttendance => ({ studentId, date, period, status });

describe("날짜", () => {
  it("주 시작은 월요일, 월~금", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // 일요일은 그 주
    expect(weekDays("2026-10-16")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(dayLabel("2026-10-12")).toBe("10.12 (월)");
    expect(isYmd("2026-02-30")).toBe(false);
  });
  it("마감: 다음 주 시작 전 일요일 22:00", () => {
    expect(deadlineOf("2026-10-19")).toEqual({ date: "2026-10-18", time: "22:00" });
    expect(isPastDeadline({ date: "2026-10-16", time: "23:59" }, "2026-10-19")).toBe(false);
    expect(isPastDeadline({ date: "2026-10-18", time: "21:59" }, "2026-10-19")).toBe(false);
    expect(isPastDeadline({ date: "2026-10-18", time: "22:00" }, "2026-10-19")).toBe(true);
    expect(isPastDeadline({ date: "2026-10-19", time: "08:00" }, "2026-10-19")).toBe(true);
  });
  it("한국 시간", () => {
    expect(seoulNow(new Date("2026-10-16T15:30:00Z"))).toEqual({ date: "2026-10-17", time: "00:30" });
  });
  it("시간 표시", () => {
    expect(sessionTime("both")).toBe("18:30 – 21:20");
    expect(sessionTime("2")).toBe("20:10 – 21:20");
  });
});

describe("출석", () => {
  it("칸 상태: 신청 안 한 교시는 미신청, 기록 없으면 미확인", () => {
    expect(cellStatus(undefined, undefined, 1)).toBe("미신청");
    expect(cellStatus(su("a", "d", "2"), undefined, 1)).toBe("미신청");
    expect(cellStatus({ ...su("a", "d"), status: "취소" }, undefined, 1)).toBe("미신청");
    expect(cellStatus(su("a", "d"), undefined, 1)).toBe("미확인");
    expect(cellStatus(su("a", "d"), at("a", "d", 1, "조퇴"), 1)).toBe("조퇴");
  });
  it("누를 때마다 출석→결석→조퇴→출석", () => {
    expect(nextAttend(null)).toBe("출석");
    expect(nextAttend("출석")).toBe("결석");
    expect(nextAttend("조퇴")).toBe("출석");
  });
  it("교시 요약", () => {
    expect(periodSummary(["출석", "출석", "결석", "조퇴", "미신청", "미확인"])).toEqual({ signed: 5, present: 2, absent: 2, unchecked: 1 });
  });
  it("요일별 출석률은 확인한 교시만 센다", () => {
    const d = "2026-10-12";
    const r = dailyRates([d, "2026-10-13"], [su("a", d), su("b", d, "1")], [at("a", d, 1), at("a", d, 2, "결석"), at("b", d, 1)]);
    expect(r[0]).toEqual({ date: d, signed: 3, present: 2, rate: 67 });
    expect(r[1].rate).toBeNull();
  });
  it("학생 신청 일수·출석 일수", () => {
    const days = weekDays("2026-10-16");
    const r = studentDays("a", days, [su("a", days[0]), su("a", days[2]), su("a", days[3]), su("b", days[0])], [at("a", days[0], 1), at("a", days[2], 2), at("a", days[3], 1, "결석")]);
    expect(r).toEqual({ signed: 3, attended: 2 });
  });
});

describe("잔여석", () => {
  it("가장 빡빡한 날 기준, 연속은 두 교시 모두 본다, 본인은 빼고", () => {
    const d1 = "2026-10-19";
    const d2 = "2026-10-21";
    const signups = [
      ...Array.from({ length: 19 }, (_, i) => su(`x${i}`, d1, "2", "도서관")),
      ...Array.from({ length: 8 }, (_, i) => su(`y${i}`, d2, "1", "도서관")),
      su("me", d1, "2", "도서관"),
    ];
    expect(remainingSeats(signups, [d1, d2], "1", "도서관")).toBe(12);
    expect(remainingSeats(signups, [d1, d2], "2", "도서관")).toBe(0);
    expect(remainingSeats(signups, [d1, d2], "2", "도서관", "me")).toBe(1);
    expect(remainingSeats(signups, [d1, d2], "both", "도서관", "me")).toBe(1);
    expect(remainingSeats(signups, [], "both", "자습실 A")).toBe(40);
  });
  it("신청 검사", () => {
    const allowed = ["2026-10-19", "2026-10-20"];
    expect(checkApplication({ dates: ["2026-10-19"], session: "both", place: "자습실 A" }, allowed)).toBeNull();
    expect(checkApplication({ dates: [], session: "both", place: "자습실 A" }, allowed)).toContain("요일");
    expect(checkApplication({ dates: ["2026-10-26"], session: "both", place: "자습실 A" }, allowed)).toContain("날짜");
    expect(checkApplication({ dates: ["2026-10-19"], session: "3", place: "자습실 A" }, allowed)).toContain("시간");
    expect(checkApplication({ dates: ["2026-10-19"], session: "1", place: "옥상" }, allowed)).toContain("장소");
  });
});

describe("패턴", () => {
  // 지난 3주 월·수·목 연속 신청, 모두 출석. 화요일은 한 번만
  const weeks = ["2026-09-28", "2026-10-05", "2026-10-12"];
  const signups: NightSignup[] = [];
  const atts: NightAttendance[] = [];
  for (const w of weeks) {
    for (const i of [0, 2, 3]) {
      const d = addDays(w, i);
      signups.push(su("a", d));
      atts.push(at("a", d, 1), at("a", d, 2));
    }
  }
  signups.push(su("a", "2026-10-06", "1"));
  atts.push(at("a", "2026-10-06", 1, "결석"));

  it("자주·잘 나온 요일과 가장 많이 고른 시간으로 채운다", () => {
    const p = suggestPattern("a", signups, atts);
    expect(p).not.toBeNull();
    expect(p!.weekdays).toEqual([1, 3, 4]);
    expect(p!.session).toBe("both");
    expect(p!.place).toBe("자습실 A");
    expect(p!.text).toBe("월·수·목 출석률 100% — 같은 요일, 1·2교시 연속으로 채울까요?");
  });
  it("기록이 없으면 null", () => {
    expect(suggestPattern("z", signups, atts)).toBeNull();
  });
  it("결석 패턴: 2회 이상 결석과 몰린 요일", () => {
    const days = weekDays("2026-10-16");
    const fri = days[4];
    const r = absencePattern(
      [at("a", days[0], 1, "결석"), at("a", fri, 1, "결석"), at("b", fri, 1, "조퇴"), at("b", days[1], 2, "결석"), at("c", fri, 2, "결석"), at("c", days[2], 1, "결석"), at("d", fri, 1)],
      days,
    );
    expect(r.students.map((s) => s.studentId).sort()).toEqual(["a", "b", "c"]);
    expect(r.peakDay).toBe(5);
    expect(r.text).toBe("이번 주 2회 이상 결석 3명 (금요일에 몰려 있어요)");
  });
});
