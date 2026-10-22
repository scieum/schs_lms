import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { buildTemplate } = await import("./excel");

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
});
