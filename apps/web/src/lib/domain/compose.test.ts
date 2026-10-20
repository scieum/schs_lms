import { describe, expect, it } from "vitest";
import {
  applyOrder, decodePick, encodePick, filterPieces, homeroomTab, inPeriod, mainLabel, moveId, pickedSummary, pickedVisible, pickKey,
  sourceChips, studentPos, studentStep, withQuery, writeRedirect,
} from "./compose";
import type { MergePiece } from "./merge";

// 글 짓기 (Figma N52) 순수 규칙

const P = (id: string, source: MergePiece["source"], date: string | null, text = "가나다"): MergePiece => ({ id, source, date, text });

describe("학생 넘기기", () => {
  const ids = ["a", "b", "c"];
  it("자리 n / m", () => {
    expect(studentPos(ids, "b")).toEqual({ index: 2, total: 3 });
    expect(studentPos(ids, "x")).toEqual({ index: 0, total: 3 });
  });
  it("이전 · 다음은 끝에서 멈춘다", () => {
    expect(studentStep(ids, "b", 1)).toBe("c");
    expect(studentStep(ids, "b", -1)).toBe("a");
    expect(studentStep(ids, "a", -1)).toBeNull();
    expect(studentStep(ids, "c", 1)).toBeNull();
    expect(studentStep(ids, "x", 1)).toBeNull();
  });
});

describe("출처 칩", () => {
  const pieces = [P("1", "메모", "2026-10-14"), P("2", "차시", "2026-10-08"), P("3", "공통 활동", "2026-09-24"), P("4", "메모", "2026-09-10"), P("5", "메모", "2026-09-03")];
  it("세특: 전체 5 · 메모 3 · 차시 1 · 공통 활동 1 (0은 숨김)", () => {
    expect(sourceChips(pieces, "setuk")).toEqual([{ key: "전체", n: 5 }, { key: "메모", n: 3 }, { key: "차시", n: 1 }, { key: "공통 활동", n: 1 }]);
  });
  it("담임: 누가기록이 먼저", () => {
    const h = [P("1", "메모", null), P("2", "누가기록", "2026-10-16")];
    expect(sourceChips(h, "homeroom").map((c) => c.key)).toEqual(["전체", "누가기록", "메모"]);
  });
  it("순서 목록에 없는 출처도 뒤에 붙는다", () => {
    expect(sourceChips([P("1", "본문", null)], "setuk").map((c) => c.key)).toEqual(["전체", "본문"]);
  });
});

describe("기간 · 거르기", () => {
  const today = "2026-10-20";
  it("이번 달 · 학기", () => {
    expect(inPeriod("2026-10-01", "이번 달", today)).toBe(true);
    expect(inPeriod("2026-09-30", "이번 달", today)).toBe(false);
    expect(inPeriod("2026-05-02", "1학기", today)).toBe(true);
    expect(inPeriod("2026-05-02", "2학기", today)).toBe(false);
    expect(inPeriod("2026-09-02", "2학기", today)).toBe(true);
    expect(inPeriod("2025-10-02", "2학기", today)).toBe(false);
    expect(inPeriod(null, "이번 달", today)).toBe(true);
  });
  it("2월은 지난 학년도 2학기", () => {
    expect(inPeriod("2027-02-10", "2학기", "2026-12-01")).toBe(true);
    expect(inPeriod("2026-02-10", "2학기", "2026-10-01")).toBe(false);
  });
  it("출처 + 기간", () => {
    const ps = [P("1", "메모", "2026-10-14"), P("2", "차시", "2026-10-08"), P("3", "메모", "2026-05-01")];
    expect(filterPieces(ps, { source: "메모", period: "전체", today }).map((p) => p.id)).toEqual(["1", "3"]);
    expect(filterPieces(ps, { source: "전체", period: "2학기", today }).map((p) => p.id)).toEqual(["1", "2"]);
    expect(filterPieces(ps, { source: "메모", period: "1학기", today }).map((p) => p.id)).toEqual(["3"]);
  });
});

describe("고른 조각", () => {
  it("보이는 것 중 고른 것만 · 바닥 줄", () => {
    const ps = [P("1", "메모", null, "가나"), P("2", "메모", null, " 다라마 ")];
    const picked = pickedVisible(ps, new Set(["2", "9"]));
    expect(picked.map((p) => p.id)).toEqual(["2"]);
    expect(pickedSummary(picked)).toEqual({ count: 1, chars: 3 });
  });
  it("주 버튼 글", () => {
    expect(mainLabel(4, "new", false)).toBe("고른 조각 4개로 글 쓰기");
    expect(mainLabel(4, "new", true)).toBe("고른 조각 4개로 다시 쓰기");
    expect(mainLabel(3, "append", true)).toBe("고른 조각 3개로 이어 쓰기");
    expect(mainLabel(0, "new", false)).toBe("고른 조각 0개로 글 쓰기");
  });
});

describe("고른 조각 기억", () => {
  it("키는 id 만", () => {
    expect(pickKey("setuk", "st-1")).toBe("schs.compose.setuk.st-1");
  });
  it("없어진 조각은 버리고 깨진 값은 전부 고름", () => {
    const raw = encodePick({ excluded: ["a", "gone"], order: ["b", "a", "gone"] });
    expect(decodePick(raw, ["a", "b", "c"])).toEqual({ excluded: ["a"], order: ["b", "a"] });
    expect(decodePick("{깨짐", ["a"])).toEqual({ excluded: [], order: [] });
    expect(decodePick(null, ["a"])).toEqual({ excluded: [], order: [] });
  });
  it("순서 · 위아래", () => {
    const ps = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(applyOrder(ps, ["c"]).map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(applyOrder(ps, []).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

describe("담임 탭 · 옛 주소", () => {
  it("탭 고르기 (모르면 행발)", () => {
    expect(homeroomTab("career").area).toBe("진로");
    expect(homeroomTab(undefined).key).toBe("behavior");
  });
  it("/teacher/write?area= → 글 짓기 (쿼리 그대로)", () => {
    expect(writeRedirect({ area: "동아리", club: "c1", student: "s1" })).toBe("/teacher/club/compose?club=c1&student=s1");
    expect(writeRedirect({ area: "자율·자치", student: "s1", check: "1" })).toBe("/homeroom/compose?tab=autonomy&student=s1&check=1");
    expect(writeRedirect({ area: "진로" })).toBe("/homeroom/compose?tab=career");
    expect(writeRedirect({ area: "행발" })).toBe("/homeroom/compose?tab=behavior");
    expect(writeRedirect({})).toBeNull();
  });
  it("쿼리 붙이기", () => {
    expect(withQuery("/teacher/setuk/compose", { course: "c1", check: "1" })).toBe("/teacher/setuk/compose?course=c1&check=1");
    expect(withQuery("/homeroom/compose", {})).toBe("/homeroom/compose");
  });
});
