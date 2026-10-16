import { describe, expect, it } from "vitest";
import { nextMealDay, parseDish, parseMeals, parseSchedule } from "./school-info";

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
      { date: "2026-10-09", name: "한글날", grades: [1, 2, 3], holiday: true },
      { date: "2026-10-21", name: "2학년 진로 체험", grades: [2], holiday: false },
    ]);
  });
});
