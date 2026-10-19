import { describe, expect, it } from "vitest";
import { copyCells, exportFileName, exportRows, exportSummary, parseCols, parseCopyCols, sheetName, type ExportRecord } from "./records-export";

const students = [
  { id: "a", no: "20101", name: "학생A", level: "B" },
  { id: "b", no: "20102", name: "학생B", level: null },
  { id: "c", no: "20103", name: "학생C" },
];
const original = "빛의 굴절 실험에서 입사각을 바꾸며 굴절각을 측정함.";
const records = new Map<string, ExportRecord>([
  ["a", { content: "빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정함.", status: "confirmed", createdAt: "2026-10-18T03:00:00Z", aiOriginalId: "o1", editRatio: 23 }],
  ["b", { content: "전류와 자기장 실험에서 코일을 감아 봄.", status: "draft", createdAt: "2026-10-19T03:00:00Z", aiOriginalId: "o2" }],
]);
const originals = new Map([["o1", original], ["o2", "전류와 자기장 실험에서 코일을 감아 봄."]]);

describe("엑셀로 받기 · 학생 한 줄 (N42 ②)", () => {
  it("전체: 빈 글 학생도 한 줄 · 상태 · 확정일 · 원안", () => {
    const rows = exportRows(students, records, originals, { area: "세특", who: "all", maxBytes: 1500 });
    expect(rows.map((r) => r.상태)).toEqual(["확정", "임시", "빈 글"]);
    expect(rows[0].확정일).toBe("2026-10-18");
    expect(rows[1].확정일).toBe("");
    expect(rows[0]["AI 원안"]).toBe(original);
    expect(rows[2]["AI 원안"]).toBe("");
    expect(rows[2].바이트).toBe(0);
  });
  it("수정 %: 확정이면 저장된 값, 임시면 그때 계산, 원안 없으면 빈칸", () => {
    const rows = exportRows(students, records, originals, { area: "세특", who: "all", maxBytes: 1500 });
    expect(rows[0]["수정 %"]).toBe(23);
    expect(rows[1]["수정 %"]).toBe(0);
    expect(rows[2]["수정 %"]).toBeNull();
  });
  it("학생 칩: 확정만 · 임시만", () => {
    expect(exportRows(students, records, originals, { area: "세특", who: "confirmed", maxBytes: 1500 }).map((r) => r.이름)).toEqual(["학생A"]);
    expect(exportRows(students, records, originals, { area: "세특", who: "draft", maxBytes: 1500 }).map((r) => r.이름)).toEqual(["학생B"]);
  });
  it("한도 넘음 표시", () => {
    const rows = exportRows(students, records, originals, { area: "세특", who: "all", maxBytes: 30 });
    expect(rows[0].over).toBe(true);
  });
  it("요약: 숫자 · 평균 · 수정 적음", () => {
    const s = exportSummary(exportRows(students, records, originals, { area: "세특", who: "all", maxBytes: 1500 }), 10);
    expect(s).toMatchObject({ students: 3, confirmed: 1, draft: 1, empty: 1, withOriginal: 2, avgEdit: 12, lowEdit: 1, over: 0 });
    expect(s.avgBytes).toBeGreaterThan(0);
  });
  it("열: 학번 · 이름은 늘, 순서 고정, 모르는 열 버림, 성취수준은 세특만", () => {
    expect(parseCols("최종 글,이름,모름")).toEqual(["학번", "이름", "최종 글"]);
    expect(parseCols(null)).toContain("AI 원안");
    expect(parseCols("성취수준", false)).toEqual(["학번", "이름"]);
    expect(parseCopyCols(["바이트", "학번", "x"])).toEqual(["학번", "바이트"]);
  });
  it("시트용 복사 칸: 글 = 최종 글 · 바이트는 숫자(빈 글이면 빈칸)", () => {
    const rows = exportRows(students, records, originals, { area: "세특", who: "all", maxBytes: 1500 });
    expect(copyCells(rows[0], ["학번", "이름", "글", "바이트"])).toEqual(["20101", "학생A", rows[0]["최종 글"], rows[0].바이트]);
    expect(copyCells(rows[2], ["글", "바이트"])).toEqual(["", ""]);
  });
  it("파일 이름 · 시트 이름", () => {
    expect(exportFileName({ kind: "setuk", subject: "물리학", section: "1분반", year: 2026, semester: 2 })).toBe("세특_물리학_1분반_2026-2.xlsx");
    expect(exportFileName({ kind: "record", area: "행발", grade: 2, classNo: 3, year: 2026 })).toBe("행발_2-3_2026.xlsx");
    expect(exportFileName({ kind: "record", area: "동아리", club: "과학 탐구반", year: 2026 })).toBe("동아리_과학_탐구반_2026.xlsx");
    expect(sheetName("물리학 [1분반]/2")).toBe("물리학  1분반  2");
    expect(sheetName("가".repeat(40))).toHaveLength(31);
  });
});
