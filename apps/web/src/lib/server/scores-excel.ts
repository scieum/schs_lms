import "server-only";
import ExcelJS from "exceljs";
import { SCORE_TEMPLATE_COLUMNS } from "@/lib/domain/scores";

// 성적 양식·성적 파일 읽기·내려받기 엑셀. (학생 등록 엑셀은 excel.ts)

export const SCORE_MAX_BYTES = 2 * 1024 * 1024;
export const SCORE_MAX_ROWS = 200;

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF536DFE" } };

function styleHead(ws: ExcelJS.Worksheet) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEAD_FILL;
  head.alignment = { horizontal: "center" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

const buf = async (wb: ExcelJS.Workbook) => (await wb.xlsx.writeBuffer()) as ArrayBuffer;

/** 성적 양식: 번호·이름은 우리 반 명단으로 미리 채운다 */
export async function buildScoreTemplate(roster: { number: number; name: string }[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고등학교 학생관리시스템";
  const ws = wb.addWorksheet("성적");
  ws.columns = SCORE_TEMPLATE_COLUMNS.map((h, i) => ({ header: h, key: h, width: i === 1 ? 12 : 9 }));
  for (const r of roster) ws.addRow([r.number, r.name]);
  styleHead(ws);
  ws.getCell("G1").note = "탐구1 = 통합사회 (공통과목)";
  ws.getCell("H1").note = "탐구2 = 통합과학 (공통과목)";
  const last = Math.max(roster.length + 1, 40);
  for (let r = 2; r <= last; r++) {
    for (const c of ["C", "D", "E", "F", "G", "H"]) {
      ws.getCell(`${c}${r}`).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [1, 9], showErrorMessage: true, error: "등급은 1~9예요" };
    }
  }
  const guide = wb.addWorksheet("작성 방법");
  [["1행 제목은 바꾸지 마세요"], ["등급만 1~9 숫자로 (결시는 비워 두기)"], ["탐구1·탐구2는 공통과목(통합사회·통합과학) 등급"], ["번호와 이름이 명단과 하나라도 다르면 반영되지 않아요"]].forEach((r) => guide.addRow(r));
  guide.getColumn(1).width = 50;
  return buf(wb);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    return "";
  }
  return String(v);
}

/** 첫 시트를 글자 표로 읽는다. 1행은 제목, 빈 행은 건너뛴다 */
export async function readScoreSheet(data: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾지 못했어요");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col - 1] = cellText(c.value).trim()));
  for (let i = 0; i < headers.length; i++) headers[i] ??= "";
  const width = headers.length;
  const rows: string[][] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value).trim());
    if (cells.every((x) => !x)) continue;
    rows.push(cells);
    if (rows.length > SCORE_MAX_ROWS) throw new Error(`한 번에 ${SCORE_MAX_ROWS}행까지 올릴 수 있어요`);
  }
  return { headers, rows };
}

/** 표 하나짜리 엑셀 (오류 행·판정 결과·출석 내보내기) */
export async function buildTable(sheet: string, headers: string[], rows: (string | number | null)[][], widths?: number[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고등학교 학생관리시스템";
  const ws = wb.addWorksheet(sheet);
  ws.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: widths?.[i] ?? 12 }));
  for (const r of rows) ws.addRow(r.map((x) => x ?? ""));
  styleHead(ws);
  return buf(wb);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function xlsxResponse(data: ArrayBuffer, asciiName: string, koreanName: string): Response {
  return new Response(data, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(koreanName)}`,
      "Cache-Control": "no-store",
    },
  });
}
