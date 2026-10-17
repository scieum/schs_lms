import { describe, expect, it } from "vitest";
import { fromNotionPage, inferGrades, safeMemo } from "./notion-events";

describe("노션 학사일정 → 앱 일정", () => {
  it("이름에서 대상 학년", () => {
    expect(inferGrades("2학년 테마학습여행")).toEqual([2]);
    expect(inferGrades("2학기 2회고사(1,2학년)")).toEqual([1, 2]);
    expect(inferGrades("1,2학년 학력평가 및 3학년 모의평가")).toEqual([]);
    expect(inferGrades("학력평가(전학년)")).toEqual([]);
    expect(inferGrades("[창체/금] 진로: 1학년 오디세이 8차시 / 2학년 오디세이 7차시")).toEqual([]);
    expect(inferGrades("입학식")).toEqual([]);
  });
  it("비고에 계정 정보가 있으면 빼기", () => {
    expect(safeMemo("교사용 아이디 : 본인 성함/ 초기 비밀번호 : x")).toBeNull();
    expect(safeMemo("기준 미도달시 기초학력대상자로 선정")).toBe("기준 미도달시 기초학력대상자로 선정");
  });
  it("페이지 속성 변환 (휴일·부서·기간), 날짜 없으면 건너뜀", () => {
    const page = {
      id: "p1",
      properties: {
        내용: { type: "title", title: [{ plain_text: "추석연휴" }] },
        날짜: { type: "date", date: { start: "2026-09-24", end: "2026-09-25" } },
        상태: { type: "status", status: { name: "휴일" } },
        태그: { type: "select", select: { name: "교무부" } },
        비고: { type: "rich_text", rich_text: [] },
      },
    };
    expect(fromNotionPage(page)).toEqual({ notionId: "p1", title: "추석연휴", startDate: "2026-09-24", endDate: "2026-09-25", holiday: true, dept: "교무부", memo: null, grades: [] });
    expect(fromNotionPage({ id: "p2", properties: { 내용: { type: "title", title: [{ plain_text: "날짜 없음" }] }, 날짜: { type: "date", date: null } } })).toBeNull();
    expect(fromNotionPage({ ...page, in_trash: true })).toBeNull();
  });
});
