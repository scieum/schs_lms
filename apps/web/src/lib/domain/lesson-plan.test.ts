import { describe, expect, it } from "vitest";
import { readTemplate, TEMPLATES } from "./excel-template";
import {
  currentLesson, doneItems, lessonBackground, lessonKindOf, lessonMd, lessonScope, lessonsFromAi, lessonsFromTemplate, lessonsFromText,
  isLessonScope, nearToday, needDate, normalizeLessons, parseLessonDate, pickAllWithout, scrubPeople, type LessonItem,
} from "./lesson-plan";

describe("차시 날짜 읽기", () => {
  it("여러 꼴 → YYYY-MM-DD", () => {
    expect(parseLessonDate("2026-03-04", 2026)).toBe("2026-03-04");
    expect(parseLessonDate("2026. 3. 4.", 2026)).toBe("2026-03-04");
    expect(parseLessonDate("10.14", 2026)).toBe("2026-10-14");
    expect(parseLessonDate("3/4(화)", 2026)).toBe("2026-03-04");
    expect(parseLessonDate("10월 14일", 2026)).toBe("2026-10-14");
  });
  it("1·2월은 다음 해 (학년도)", () => {
    expect(parseLessonDate("2.5", 2026)).toBe("2027-02-05");
  });
  it("못 읽으면 null (확인 필요)", () => {
    expect(parseLessonDate("", 2026)).toBeNull();
    expect(parseLessonDate("미정", 2026)).toBeNull();
    expect(parseLessonDate("13.40", 2026)).toBeNull();
    expect(parseLessonDate("2.30", 2026)).toBeNull();
  });
});

describe("수업 계획 엑셀 양식", () => {
  it("양식 제목이 같아야 읽는다 (N25 규칙)", () => {
    expect(TEMPLATES.lesson.columns).toEqual(["차시", "날짜", "활동명", "활동 내용"]);
    expect(readTemplate([["차시", "날짜", "활동명"]], "lesson")).toBeNull();
    const body = readTemplate([["차시", "날짜", "활동명", "활동 내용"], ["1", "2026-03-04", "운동 법칙 탐구", "일상 사례"], ["", "", "", ""], ["5", "10.14", "빗면 실험", "경사각"], ["6", "", "", "내용만"]], "lesson")!;
    const { items, skipped } = lessonsFromTemplate(body, 2026);
    expect(items.map((i) => [i.no, i.date, i.title])).toEqual([[1, "2026-03-04", "운동 법칙 탐구"], [5, "2026-10-14", "빗면 실험"]]);
    expect(skipped).toEqual([5]);
  });
  it("번호가 없거나 겹치면 순서대로 · 활동명 40자", () => {
    const out = normalizeLessons([{ no: 0, date: null, title: "가", detail: "" }, { no: 0, date: null, title: "나", detail: "" }, { no: 2, date: "bad", title: "다".repeat(50), detail: "" }]);
    expect(out.map((i) => i.no)).toEqual([1, 2, 3]);
    expect(out[2].title.length).toBe(40);
    expect(out[2].date).toBeNull();
    expect(needDate(out)).toBe(3);
  });
});

describe("운영계획서 규칙 읽기 (AI 없음)", () => {
  it("HWPX 표 줄 · '5차시' 줄", () => {
    const text = ["2026 물리학Ⅰ 수업 운영계획", "차시 | 날짜 | 활동명 | 활동 내용", "1 | 03.04 | 운동 법칙 탐구 | 뉴턴 운동 법칙을 일상 사례로", "2 | 미정 | 힘과 가속도 | 수레 실험", "5차시 10.14 빗면 실험: 경사각을 바꾸며 가속도 측정"].join("\n");
    const items = lessonsFromText(text, 2026);
    expect(items.map((i) => [i.no, i.date, i.title])).toEqual([[1, "2026-03-04", "운동 법칙 탐구"], [2, null, "힘과 가속도"], [5, "2026-10-14", "빗면 실험"]]);
    expect(items[2].detail).toBe("경사각을 바꾸며 가속도 측정");
  });
  it("AI 결과 다듬기: 날짜 다시 읽기", () => {
    const items = lessonsFromAi([{ no: 1, date: "3.4", title: "운동 법칙", detail: "x" }, { no: null, date: null, title: "", detail: "" }, { no: 3, date: "모름", title: "토론", detail: "" }], 2026);
    expect(items).toEqual([{ no: 1, date: "2026-03-04", title: "운동 법칙", detail: "x" }, { no: 3, date: null, title: "토론", detail: "" }]);
  });
  it("학생 이름 · 학번은 AI에 보내기 전에 가린다", () => {
    const r = scrubPeople("모둠장 한지민(20111)이 발표. 20260304 수업", [{ name: "한지민", studentNo: "20111" }]);
    expect(r.text).toBe("모둠장 학생(학번)이 발표. 20260304 수업");
    expect(r.removed).toBe(2);
  });
});

const item = (id: string, no: number, date: string | null, title = `활동${no}`, detail = ""): LessonItem => ({ id, planId: "p", no, date, title, detail, position: no });

describe("차시 칩 순서", () => {
  const items = [item("a", 3, "2026-09-12"), item("b", 4, "2026-10-02"), item("c", 5, "2026-10-14"), item("d", 6, "2026-10-21"), item("e", 7, null)];
  it("오늘에 가까운 차시부터, 날짜 없는 차시는 뒤", () => {
    expect(nearToday(items, "2026-10-15").map((i) => i.id)).toEqual(["c", "d", "b", "a", "e"]);
  });
  it("오늘 차시 = 오늘 · 아니면 지난 마지막", () => {
    expect(currentLesson(items, "2026-10-14")?.id).toBe("c");
    expect(currentLesson(items, "2026-10-19")?.id).toBe("c");
    expect(currentLesson(items, "2026-03-01")?.id).toBe("a");
    expect(lessonMd("2026-10-14")).toBe("10.14");
  });
});

describe("여러 학생에게 · 남김", () => {
  const marks = [{ itemId: "c", studentId: "s2" }, { itemId: "c", studentId: "s3" }, { itemId: "b", studentId: "s1" }];
  it("전체 고르기는 이 차시 메모가 없는 학생만", () => {
    expect(pickAllWithout(["s1", "s2", "s3", "s4"], marks, "c")).toEqual(["s1", "s4"]);
  });
  it("학생이 남긴 차시", () => {
    expect(doneItems(marks, "s1")).toEqual(["b"]);
  });
  it("범위 · 메모 범위", () => {
    expect(lessonKindOf("세특:c-4:1분반")).toBe("offering");
    expect(lessonKindOf("동아리:club-1")).toBe("club");
    expect(lessonKindOf("진로:2-3")).toBe("homeroom");
    expect(lessonKindOf("행발:2-3")).toBeNull();
    expect(isLessonScope(lessonScope("세특:c-4"))).toBe(true);
  });
});

describe("② AI로 쓰기 배경", () => {
  it("고른 메모의 활동명과 같은 차시 내용만", () => {
    const items = [item("a", 5, "2026-10-14", "빗면 실험", "경사각을 바꾸며 가속도 측정"), item("b", 6, null, "운동량 보존", "충돌 수레"), item("c", 7, null, "토론", "")];
    expect(lessonBackground(items, ["[빗면 실험] 마찰을 원인으로 짚음", "[토론] 의견 냄", "[다른 활동] x"])).toEqual(["5차시(10.14) 빗면 실험: 경사각을 바꾸며 가속도 측정"]);
  });
});
