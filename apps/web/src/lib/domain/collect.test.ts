import { describe, expect, it } from "vitest";
import { dayLabel, pieceKinds, piecesByDay, recentPieces, sortStudents, todayCount } from "./collect";

const names: Record<string, string> = { a: "학생A", b: "학생B", c: "학생C" };
const nameOf = (id: string) => names[id];

describe("최근 조각 (N52 a)", () => {
  it("같은 날 같은 글은 한 줄 · '학생A 외 n명'", () => {
    const r = recentPieces([
      { studentId: "a", date: "2026-10-20", content: "[빗면 실험] 각도를 바꿔 잼." },
      { studentId: "b", date: "2026-10-20", content: "[빗면 실험] 각도를 바꿔 잼." },
      { studentId: "c", date: "2026-10-20", content: "[빗면 실험] 각도를 바꿔 잼." },
    ], nameOf);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ activity: "빗면 실험", text: "각도를 바꿔 잼.", who: "학생A 외 2명", n: 3, students: ["a", "b", "c"] });
  });
  it("새 것부터 · limit 줄까지 · 한 명이면 이름만", () => {
    const r = recentPieces([
      { studentId: "a", date: "2026-10-16", content: "발표함." },
      { studentId: "b", date: "2026-10-20", content: "질문함." },
      { studentId: "c", date: "2026-10-18", content: "토론함." },
    ], nameOf, 2);
    expect(r.map((x) => x.text)).toEqual(["질문함.", "토론함."]);
    expect(r[0].who).toBe("학생B");
    expect(r[0].activity).toBe("");
  });
  it("오늘 줄 수", () => {
    const r = recentPieces([{ studentId: "a", date: "2026-10-20", content: "x함." }, { studentId: "a", date: "2026-10-19", content: "y함." }], nameOf);
    expect(todayCount(r, "2026-10-20")).toBe(1);
  });
});

describe("학생별 조각 정렬", () => {
  const list = [
    { id: "a", no: "20301", name: "A", count: 3 },
    { id: "b", no: "20302", name: "B", count: 0 },
    { id: "c", no: "20303", name: "C", count: 3 },
  ];
  it("적은 순 (같으면 번호 순)", () => {
    expect(sortStudents(list, "few").map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
  it("번호 순", () => {
    expect(sortStudents(list, "no").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("최근 조각 — 지우기용 id (2026-10-22)", () => {
  it("여러 학생에게 한 번에 남긴 같은 조각은 한 줄 · 기록 id 는 모두", () => {
    const r = recentPieces([{ id: "m1", studentId: "a", date: "2026-10-22", content: "[실험] 측정함" }, { id: "m2", studentId: "b", date: "2026-10-22", content: "[실험] 측정함" }], () => "학생");
    expect(r).toHaveLength(1);
    expect(r[0].ids).toEqual(["m1", "m2"]);
  });
});

describe("학생별 조각 창 (N77)", () => {
  const ps = [
    { id: "memo-1", source: "메모", date: "2026-10-14", text: "a" },
    { id: "memo-2", source: "자료 요약", date: "2026-10-21", text: "b" },
    { id: "memo-3", source: "메모", date: "2026-10-26", text: "c" },
    { id: "memo-4", source: "메모", date: null, text: "d" },
    { id: "memo-5", source: "공통 활동", date: "2026-10-14", text: "e" },
  ];
  it("종류는 있는 것만 많은 순", () => {
    expect(pieceKinds(ps)).toEqual([{ source: "메모", n: 3 }, { source: "자료 요약", n: 1 }, { source: "공통 활동", n: 1 }]);
  });
  it("날짜별로 새 날짜부터, 날짜 없는 조각은 맨 뒤", () => {
    expect(piecesByDay(ps, null).map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ["2026-10-26", ["memo-3"]], ["2026-10-21", ["memo-2"]], ["2026-10-14", ["memo-1", "memo-5"]], [null, ["memo-4"]],
    ]);
  });
  it("종류를 고르면 그 종류만", () => {
    expect(piecesByDay(ps, "자료 요약").map((g) => g.items.length)).toEqual([1]);
  });
  it("날짜 이름표", () => {
    expect(dayLabel("2026-10-26")).toBe("10.26 (월)");
    expect(dayLabel(null)).toBe("날짜 없음");
  });
});
