import { describe, expect, it } from "vitest";
import { briefingLine, briefSignals, peakAbsenceDay, pickBriefing, serviceCheck, serviceTotals, type BriefInput } from "./homeroom";
import type { NightAttendance } from "./night";

const abs = (date: string, status: NightAttendance["status"] = "결석"): NightAttendance => ({ studentId: "x", date, period: 1, status });
const input = (p: Partial<BriefInput> & { studentId: string }): BriefInput => ({ verdict: null, verdictReason: null, absences: [], pendingCorrections: 0, newDrafts: 0, ...p });

describe("우리 반 브리핑 규칙", () => {
  it("최저 근접이 미충족보다 급하다", () => {
    expect(briefSignals(input({ studentId: "a", verdict: "근접", verdictReason: "수학 1등급만 올리면 충족" }))[0]).toMatchObject({ kind: "최저", weight: 4 });
    expect(briefSignals(input({ studentId: "b", verdict: "미충족" }))[0].weight).toBe(3);
    expect(briefSignals(input({ studentId: "c", verdict: "충족" }))).toEqual([]);
  });
  it("야자 결석은 날짜 수로 세고 2일 이상부터 본다. 몰린 요일을 적는다", () => {
    expect(briefSignals(input({ studentId: "a", absences: [abs("2026-10-05")] }))).toEqual([]);
    // 10-05, 10-12 모두 월요일
    const s = briefSignals(input({ studentId: "a", absences: [abs("2026-10-05"), abs("2026-10-05", "조퇴"), abs("2026-10-12"), abs("2026-10-14", "출석")] }));
    expect(s[0].text).toBe("4주 야자 결석·조퇴 2일 (월요일에 몰림)");
    expect(s[0].weight).toBe(2);
  });
  it("몰린 요일은 2회 이상일 때만", () => {
    expect(peakAbsenceDay([{ date: "2026-10-05" }, { date: "2026-10-06" }])).toBeNull();
    expect(peakAbsenceDay([{ date: "2026-10-06" }, { date: "2026-10-13" }])).toBe(2);
  });
  it("점수 합이 큰 학생 3명, 이유 없는 학생은 빼기", () => {
    const picks = pickBriefing([
      input({ studentId: "a", newDrafts: 1 }),
      input({ studentId: "b", verdict: "근접", pendingCorrections: 1 }),
      input({ studentId: "c" }),
      input({ studentId: "d", verdict: "미충족" }),
      input({ studentId: "e", absences: [abs("2026-10-05"), abs("2026-10-06"), abs("2026-10-07")] }),
    ]);
    expect(picks.map((p) => p.studentId)).toEqual(["b", "d", "e"]);
    expect(picks[0].score).toBe(6);
    expect(briefingLine(picks, { near: 1, pendingFix: 1 })).toBe("먼저 볼 학생 3명 · 최저 근접 1명 · 정정 요청 1건");
    expect(briefingLine([], { near: 0, pendingFix: 0 })).toBe("먼저 볼 학생이 없어요");
  });
});

describe("봉사 누적", () => {
  const rows = [
    { studentId: "a", hours: 4, status: "confirmed", createdAt: "2026-10-01T00:00:00Z" },
    { studentId: "a", hours: 6, status: "confirmed", createdAt: "2026-10-02T00:00:00Z" },
    { studentId: "b", hours: 2, status: "confirmed", createdAt: "2026-10-02T00:00:00Z" },
    { studentId: "b", hours: 3, status: "sent", createdAt: "2026-10-01T00:00:00Z" },
    { studentId: "d", hours: 8, status: "confirmed", createdAt: "2026-10-02T00:00:00Z" },
  ];
  it("확인된 시간만 더하고 대기 건수를 센다", () => {
    expect(serviceTotals(["a", "b", "c"], rows)).toEqual([
      { studentId: "a", confirmed: 10, waiting: 0, records: 2 },
      { studentId: "b", confirmed: 2, waiting: 1, records: 2 },
      { studentId: "c", confirmed: 0, waiting: 0, records: 0 },
    ]);
  });
  it("0시간·평균 절반 미만·오래 기다린 확인서를 찾는다", () => {
    const t = serviceTotals(["a", "b", "c", "d"], rows);
    const c = serviceCheck(t, rows, "2026-10-16");
    expect(c.avg).toBe(5);
    expect(c.zero).toEqual(["c"]);
    expect(c.low).toEqual(["b"]);
    expect(c.stale).toBe(1);
    expect(c.text).toBe("평균 5시간 · 기록 없는 학생 1명 · 평균 절반 미만 1명 · 7일 넘게 확인 대기 1건");
  });
  it("빠진 학생이 없으면 그렇게 말한다", () => {
    const t = serviceTotals(["a"], rows);
    expect(serviceCheck(t, rows.slice(0, 2), "2026-10-03").text).toBe("평균 10시간 · 빠진 학생이 없어요");
  });
});
