import { describe, expect, it } from "vitest";
import { dropNeisDuplicates, eventStatus, mergeDays, nextMealDay, parseDish, parseMeals, parseSchedule } from "./school-info";

const meals = {
  mealServiceDietInfo: [
    { head: [{ list_total_count: 2 }] },
    { row: [
      { MLSV_YMD: "20261019", MMEAL_SC_NM: "중식", DDISH_NM: "친환경찹쌀밥 <br/>참치김치찌개 (5.9)<br/>바베큐족발 (5.6.10.13)<br/>바나나 ", CAL_INFO: "810.6 Kcal" },
      { MLSV_YMD: "20261016", MMEAL_SC_NM: "석식", DDISH_NM: "카레라이스 (1.2.5.6)" },
    ] },
  ],
};

describe("나이스 급식·학사일정", () => {
  it("메뉴 이름과 알레르기 번호를 나눔", () => {
    expect(parseDish("바베큐족발 (5.6.10.13)")).toEqual({ name: "바베큐족발", allergens: [5, 6, 10, 13] });
    expect(parseDish("바나나 ")).toEqual({ name: "바나나", allergens: [] });
    const m = parseMeals(meals);
    expect(m.map((x) => x.date)).toEqual(["2026-10-16", "2026-10-19"]);
    expect(m[1].dishes.map((d) => d.name)).toEqual(["친환경찹쌀밥", "참치김치찌개", "바베큐족발", "바나나"]);
  });
  it("오늘 급식이 없으면 다음 급식일 (주말 → 월요일)", () => {
    const m = parseMeals(meals);
    expect(nextMealDay(m, "2026-10-17")?.date).toBe("2026-10-19");
    expect(nextMealDay(m, "2026-10-20")).toBeNull();
  });
  it("학사일정: 대상 학년, 휴업일, 토요휴업일 빼기", () => {
    const s = parseSchedule({ SchoolSchedule: [{ head: [] }, { row: [
      { AA_YMD: "20261009", EVENT_NM: "한글날", SBTR_DD_SC_NM: "공휴일", ONE_GRADE_EVENT_YN: "Y", TW_GRADE_EVENT_YN: "Y", THREE_GRADE_EVENT_YN: "Y" },
      { AA_YMD: "20261010", EVENT_NM: "토요휴업일", SBTR_DD_SC_NM: "휴업일" },
      { AA_YMD: "20261021", EVENT_NM: "2학년 진로 체험", SBTR_DD_SC_NM: "해당없음", ONE_GRADE_EVENT_YN: "N", TW_GRADE_EVENT_YN: "Y", THREE_GRADE_EVENT_YN: "N" },
    ] }] });
    expect(s).toEqual([
      { date: "2026-10-09", endDate: "2026-10-09", name: "한글날", grades: [1, 2, 3], holiday: true },
      { date: "2026-10-21", endDate: "2026-10-21", name: "2학년 진로 체험", grades: [2], holiday: false },
    ]);
  });
});

describe("학사일정 기간·상태", () => {
  const ev = (date: string, name: string, endDate = date) => ({ date, endDate, name, grades: [1, 2, 3], holiday: false });
  it("이어진 같은 이름 일정은 기간 하나로", () => {
    const m = mergeDays([ev("2026-10-12", "2학기 1회고사"), ev("2026-10-13", "2학기 1회고사"), ev("2026-10-14", "2학기 1회고사"), ev("2026-10-20", "2학기 1회고사"), ev("2026-10-20", "전국연합")]);
    expect(m.map((e) => `${e.name} ${e.date}~${e.endDate}`)).toEqual(["2학기 1회고사 2026-10-12~2026-10-14", "2학기 1회고사 2026-10-20~2026-10-20", "전국연합 2026-10-20~2026-10-20"]);
  });
  it("오늘 기준 상태", () => {
    expect(eventStatus(ev("2026-10-16", "독서 주간", "2026-10-22"), "2026-10-17")).toBe("진행 중");
    expect(eventStatus(ev("2026-10-20", "a"), "2026-10-17")).toBe("시작 전");
    expect(eventStatus(ev("2026-10-12", "a", "2026-10-14"), "2026-10-17")).toBe("완료");
    expect(eventStatus({ date: "2026-10-09", endDate: "2026-10-09", holiday: true }, "2026-10-17")).toBe("휴업일");
  });
});

describe("나이스·직접 일정 겹침", () => {
  const ev = (date: string, name: string, holiday = false, endDate = date) => ({ date, endDate, name, grades: [], holiday });
  it("같은 날 같은 이름·둘 다 휴업일이면 나이스 쪽을 뺀다", () => {
    const neis = [ev("2026-10-09", "한글날", true), ev("2026-10-20", "전국연합학력평가"), ev("2026-10-12", "2학기 1회고사", false, "2026-10-14")];
    const custom = [ev("2026-10-09", "한글날", true), ev("2026-10-12", "2학기 1회고사", false, "2026-10-16")];
    expect(dropNeisDuplicates(neis, custom).map((e) => e.name)).toEqual(["전국연합학력평가"]);
  });
});
