import "server-only";
import ExcelJS from "exceljs";

// 학생 명단 파일(엑셀·CSV·나이스 "엑셀 저장" HTML 표)을 행×칸 표로 읽는다.
// 학생 찾기는 lib/domain/class-roster.ts (readRosterTable → matchRoster) 에서 한다.

export const ROSTER_FILE_MAX_BYTES = 3 * 1024 * 1024;

/** 표 또는 오류 문장 */
export async function fileRows(f: File): Promise<string[][] | string> {
  if (f.size > ROSTER_FILE_MAX_BYTES) return "3MB 이하 파일만 올릴 수 있어요";
  const bytes = new Uint8Array(await f.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 600)).trimStart().toLowerCase();
  // 나이스 "엑셀 저장"은 HTML 표인 .xls 인 경우가 많다
  if (head.startsWith("<") || /<table/.test(head)) {
    const html = new TextDecoder().decode(bytes);
    return [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((tr) =>
      [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()));
  }
  if (/\.csv$/i.test(f.name) || f.type === "text/csv" || f.type === "text/plain") {
    const text = new TextDecoder(/euc-kr|ks_c/i.test(head) ? "euc-kr" : "utf-8").decode(bytes);
    return text.split(/\r?\n/).map((l) => l.split(/,|\t/));
  }
  if (/\.xlsx$/i.test(f.name)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    } catch {
      return "엑셀 파일을 열지 못했어요. 나이스에서 다시 받아 주세요";
    }
    const ws = wb.worksheets[0];
    if (!ws) return "빈 엑셀이에요";
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = c.text ?? ""; });
      rows.push(cells.map((x) => x ?? ""));
    });
    return rows;
  }
  if (/\.xls$/i.test(f.name)) return "이 .xls 파일은 읽지 못했어요. 엑셀에서 .xlsx 로 저장하거나, 나이스 명단을 복사해 붙여 넣어 주세요";
  return "엑셀(.xlsx·.xls)·CSV 파일만 읽을 수 있어요";
}

/** 명단 양식 (학생명단_양식.xlsx): 학번만, 또는 학년·반·번호만 채워도 된다 */
export async function buildListTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고등학교 학생관리시스템";
  const ws = wb.addWorksheet("학생 명단");
  ws.columns = ["학번", "학년", "반", "번호", "이름"].map((h) => ({ header: h, key: h, width: h === "이름" ? 12 : 8 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF536DFE" } };
  head.alignment = { horizontal: "center" };
  ws.getCell("A1").note = "5자리 (예: 20312). 비우면 학년·반·번호로 찾아요";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const guide = wb.addWorksheet("작성 방법");
  [
    ["1행 제목은 바꾸지 마세요"],
    ["학번 또는 학년·반·번호 중 하나만 있어도 돼요"],
    ["이름이 등록된 이름과 다르면 그 줄은 못 찾음으로 나와요"],
    ["나이스에서 받은 명단 파일을 그대로 올려도 돼요"],
  ].forEach((r) => guide.addRow(r));
  guide.getColumn(1).width = 50;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
