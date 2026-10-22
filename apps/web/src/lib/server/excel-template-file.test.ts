import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { buildTemplate, readTemplateFile } = await import("./excel");

const open = async (kind: "list" | "register") => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplate(kind));
  return wb.getWorksheet("양식")!;
};
const noteText = (n: unknown) => (typeof n === "string" ? n : JSON.stringify(n));

describe("명단 양식 파일 — 학과 메모 · 드롭다운 (2026-10-22)", () => {
  it("명단: 학과 제목 칸에 '일반학과' 메모, 학과 · 학년 칸은 드롭다운", async () => {
    const ws = await open("list");
    expect(ws.getRow(1).values).toEqual([undefined, "연번", "학년", "학과", "반", "번호", "성명"]);
    expect(noteText(ws.getCell("C1").note)).toContain("일반학과");
    expect(ws.getCell("C2").dataValidation).toMatchObject({ type: "list", formulae: ['"일반학과"'] });
    expect(ws.getCell("B600").dataValidation).toMatchObject({ type: "list", formulae: ['"1,2,3"'] });
    expect(ws.getCell("F2").dataValidation).toBeUndefined();
  });
  it("학생 등록: 성별도 드롭다운 (남 · 여)", async () => {
    const ws = await open("register");
    expect(ws.getCell("G2").dataValidation).toMatchObject({ type: "list", formulae: ['"남,여"'] });
    expect(noteText(ws.getCell("C1").note)).toContain("일반학과");
  });
  it("칸 서식은 일반(텍스트 아님) · 수식으로 채운 칸은 계산 결과로 읽는다", async () => {
    const ws = await open("list");
    for (const c of ["A2", "B2", "D2", "F2"]) expect(ws.getCell(c).numFmt ?? "General").not.toBe("@");
    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("양식");
    sh.addRow(["연번", "학년", "학과", "반", "번호", "성명"]);
    sh.addRow([1, { formula: "1+1", result: 2 }, "일반학과", 1, { formula: "A2+2", result: 3 }, "김민준"]);
    const file = new File([await wb.xlsx.writeBuffer()], "명단.xlsx");
    const r = await readTemplateFile(file, "list");
    expect("body" in r && r.body[0].cells).toEqual(["20103", "2", "1", "3", "김민준"]);
  });
});
