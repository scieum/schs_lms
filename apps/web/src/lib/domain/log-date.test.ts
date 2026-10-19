import { describe, expect, it } from "vitest";
import { chipDate, chipOf, shortMd } from "./log-date";
import { isFileScope, PIECE_SOURCES, pieceScopeOf } from "./merge";

describe("누가기록 날짜 칩 (N32)", () => {
  it("오늘 · 어제 · 고른 날짜", () => {
    expect(chipDate("today", "2026-10-19", "")).toBe("2026-10-19");
    expect(chipDate("yesterday", "2026-10-01", "")).toBe("2026-09-30");
    expect(chipDate("pick", "2026-10-19", "2026-10-02")).toBe("2026-10-02");
    expect(chipDate("pick", "2026-10-19", "")).toBe("2026-10-19");
  });
  it("고른 날짜가 오늘·어제면 그 칩", () => {
    expect(chipOf("2026-10-19", "2026-10-19")).toBe("today");
    expect(chipOf("2026-10-18", "2026-10-19")).toBe("yesterday");
    expect(chipOf("2026-10-02", "2026-10-19")).toBe("pick");
  });
  it("짧은 날짜", () => {
    expect(shortMd("2026-10-19")).toBe("10.19");
    expect(shortMd("2026-09-05")).toBe("09.05");
    expect(shortMd("x")).toBe("");
  });
});

describe("자료 요약 조각 (N32)", () => {
  it("메모는 #조각, 자료 요약은 #자료 범위", () => {
    expect(pieceScopeOf("세특:c-1")).toBe("세특:c-1#조각");
    expect(pieceScopeOf("세특:c-1", "file")).toBe("세특:c-1#자료");
    expect(pieceScopeOf("행발", "memo")).toBe("행발#조각");
    expect(isFileScope("세특:c-1#자료")).toBe(true);
    expect(isFileScope("세특:c-1#조각")).toBe(false);
    expect(PIECE_SOURCES).toContain("자료 요약");
  });
});
