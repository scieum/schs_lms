import { describe, expect, it } from "vitest";
import { defaultItems, inTerm, itemsFor, parseItems, parseTerm, reportAiLines, reportStatus, reportTiles, termRange, type StudentReport } from "./report";

const base: StudentReport = { id: "s", name: "학생A", classLine: "2학년 3반 1번 · 20301", setuk: [], record: [], behavior: null, logs: [], programs: [], service: [], counsel: [] };

describe("학생 리포트 (N55)", () => {
  it("범위마다 넣을 수 있는 것 · 상담은 처음에 꺼짐", () => {
    expect(itemsFor("course")).toEqual(["setuk", "logs", "ai"]);
    expect(itemsFor("club")).toEqual(["record", "logs", "ai"]);
    expect(defaultItems("homeroom")).not.toContain("counsel");
    expect(itemsFor("homeroom")).toContain("counsel");
  });
  it("주소의 items 는 그 범위에서 쓸 수 있는 것만", () => {
    expect(parseItems("setuk,counsel,behavior", "course")).toEqual(["setuk"]);
    expect(parseItems(undefined, "club")).toEqual(["record", "logs", "ai"]);
    expect(parseItems("", "homeroom")).toEqual([]);
  });
  it("학기 날짜 범위 (2학기는 다음 해 2월 말까지)", () => {
    expect(termRange(2026, 1)).toEqual(["2026-03-01", "2026-08-31"]);
    expect(termRange(2026, 2)).toEqual(["2026-09-01", "2027-02-28"]);
    expect(termRange(2027, "year")).toEqual(["2027-03-01", "2028-02-29"]);
    expect(inTerm("2026-10-21T09:00:00Z", termRange(2026, 2))).toBe(true);
    expect(inTerm("2026-08-31", termRange(2026, 2))).toBe(false);
    expect(parseTerm(undefined, 2)).toBe(2);
    expect(parseTerm("year", 1)).toBe("year");
  });
  it("상태: 확정 · 임시 · 비어 있음", () => {
    expect(reportStatus({ content: "글", status: "confirmed" })).toBe("확정");
    expect(reportStatus({ content: "글", status: "draft" })).toBe("임시");
    expect(reportStatus({ content: "  ", status: "confirmed" })).toBe("비어 있음");
    expect(reportStatus(undefined)).toBe("비어 있음");
  });
  it("숫자 칸은 켠 항목만", () => {
    const r: StudentReport = { ...base, setuk: [{ label: "물리학", status: "확정", text: "a" }], behavior: { label: "행발", status: "임시", text: "b" }, logs: [{ date: "2026-10-01", tag: "진로", text: "c" }], service: [{ date: "2026-10-02", activity: "정화", hours: 4 }, { date: "2026-10-03", activity: "정리", hours: 2 }] };
    expect(reportTiles(r, ["setuk", "behavior", "logs", "service"])).toEqual([
      { label: "누가기록", value: "1" }, { label: "확정한 글", value: "1 / 2" }, { label: "봉사", value: "6시간" },
    ]);
    expect(reportTiles(r, ["setuk"])).toEqual([{ label: "확정한 글", value: "1 / 1" }]);
  });
  it("AI 에 보낼 글: 이름 · 학번 없이 켠 항목만", () => {
    const r: StudentReport = { ...base, setuk: [{ label: "물리학", status: "확정", text: "실험" }], counsel: [{ date: "2026-10-01", tag: "진로", text: "비밀" }] };
    const lines = reportAiLines(r, ["setuk", "counsel"]);
    expect(lines).toEqual(["[세특 물리학] 실험"]);
    expect(lines.join()).not.toContain("학생A");
  });
});
