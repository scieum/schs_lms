import "server-only";
import ExcelJS from "exceljs";
import { matchHeaders, TEMPLATE_COLUMNS, type Field, type HeaderMatch } from "@/lib/domain/roster";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_ROWS = 600;

/** 학생 등록 양식 (학생등록_양식.xlsx) */
export async function buildTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고등학교 학생관리시스템";
  const ws = wb.addWorksheet("학생 등록");
  ws.columns = TEMPLATE_COLUMNS.map((h) => ({ header: h, key: h, width: 10 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF536DFE" } };
  head.alignment = { horizontal: "center" };
  ws.getCell("E1").note = "남 또는 여";
  ws.getCell("F1").note = "비우면 1 (속초고는 1로 통일)";
  // 학년 1~3, 성별 남/여만 입력되도록
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    ws.getCell(`A${r}`).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [1, 3], showErrorMessage: true, error: "학년은 1~3이에요" };
    ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"남,여"'], showErrorMessage: true, error: "남 또는 여" };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const guide = wb.addWorksheet("작성 방법");
  [
    ["1행 제목은 바꾸지 마세요"],
    ["학년 1~3, 반·번호는 숫자만"],
    ["성별은 남·여, 계열은 비우면 1"],
    ["학번은 학년·반·번호로 자동으로 만들어져요 (예: 20312)"],
  ].forEach((r) => guide.addRow(r));
  guide.getColumn(1).width = 50;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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

export interface ParsedSheet {
  header: HeaderMatch;
  rows: Record<Field, string>[];
}

/** 첫 시트의 1행을 제목으로 보고 학생 행을 읽는다. 빈 행은 건너뛴다. */
export async function parseRoster(buf: ArrayBuffer): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾지 못했어요");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col - 1] = cellText(c.value)));
  const header = matchHeaders(headers);
  const rows: Record<Field, string>[] = [];
  if (header.missing.length) return { header, rows };
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (f: Field) => cellText(row.getCell(header.map[f]! + 1).value).trim();
    const rec = {
      grade: get("grade"), classNo: get("classNo"), number: get("number"), name: get("name"), gender: get("gender"),
      track: header.map.track === undefined ? "" : get("track"), // 계열 열이 없으면 1
    };
    if (Object.values(rec).every((x) => !x)) continue;
    rows.push(rec);
    if (rows.length > MAX_ROWS) throw new Error(`한 번에 ${MAX_ROWS}명까지 올릴 수 있어요`);
  }
  return { header, rows };
}
