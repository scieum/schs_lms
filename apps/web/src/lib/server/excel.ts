import "server-only";
import ExcelJS from "exceljs";
import { readTemplate, TEMPLATE_ERROR, TEMPLATE_MAX_ROWS, TEMPLATES, type TemplateKind } from "@/lib/domain/excel-template";

// 엑셀 양식 (Figma N25): 모든 엑셀 받기는 같은 모양의 양식을 내려주고, 그 양식만 읽는다.
// 규칙(제목 검사·줄 자르기)은 lib/domain/excel-template.ts. 여기는 파일 만들기·열기만.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB

/** 양식 파일: 1행 제목(파란 바탕·굵게·틀 고정) + "작성 방법" 시트. 본문은 비워 둔다(예시는 작성 방법 시트에) */
export async function buildTemplate(kind: TemplateKind): Promise<ArrayBuffer> {
  const t = TEMPLATES[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고등학교 학생관리시스템";
  const ws = wb.addWorksheet("양식", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = t.columns.map((h, i) => ({ header: h, key: h, width: Math.max(8, Math.round(t.widths[i] / 6)) }));
  const head = ws.getRow(1);
  head.height = 20;
  t.columns.forEach((_, i) => {
    const c = head.getCell(i + 1);
    c.font = { bold: true, color: { argb: "FF26348C" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFE3FF" } };
    c.alignment = { horizontal: "left", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: "FF8B95A1" } } };
  });
  // 모든 칸을 글자로 (학번 앞 0·반 번호가 날짜로 바뀌지 않게)
  t.columns.forEach((_, i) => { ws.getColumn(i + 1).numFmt = "@"; });

  const guide = wb.addWorksheet("작성 방법");
  guide.getColumn(1).width = 56;
  guide.addRow(["1행 제목은 바꾸지 마세요. 제목이 다르면 읽지 않아요"]);
  t.guide.forEach((g) => guide.addRow([g]));
  guide.addRow([]);
  guide.addRow(["예시 (양식 시트에 이렇게 적어요)"]).font = { bold: true };
  guide.addRow([...t.columns]).font = { bold: true, color: { argb: "FF26348C" } };
  t.examples.forEach((r) => guide.addRow([...r]));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** 양식 내려받기 응답 */
export async function templateResponse(kind: TemplateKind): Promise<Response> {
  const buf = await buildTemplate(kind);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind}_template.xlsx"; filename*=UTF-8''${encodeURIComponent(TEMPLATES[kind].file)}`,
      "Cache-Control": "no-store",
    },
  });
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    return "";
  }
  return String(v);
}

export type TemplateRead = { body: { line: number; cells: string[] }[] } | { error: string };

/**
 * 올린 파일을 양식으로 읽는다: .xlsx · 첫 시트 · 1행 제목이 양식과 같을 때만.
 * 그 밖의 파일(.xls·CSV·나이스 출석부·제목을 바꾼 파일)은 모두 TEMPLATE_ERROR.
 */
export async function readTemplateFile(f: unknown, kind: TemplateKind): Promise<TemplateRead> {
  if (!(f instanceof File) || f.size === 0) return { error: "양식 파일을 골라 주세요" };
  if (f.size > MAX_UPLOAD_BYTES) return { error: "2MB까지 올릴 수 있어요" };
  if (!/\.xlsx$/i.test(f.name)) return { error: TEMPLATE_ERROR };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await f.arrayBuffer());
  } catch {
    return { error: TEMPLATE_ERROR };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: TEMPLATE_ERROR };
  const width = TEMPLATES[kind].columns.length;
  const rows: string[][] = [];
  // 오른쪽 빈 칸 한 칸까지 읽어 제목 뒤에 다른 열이 붙었는지도 본다
  for (let r = 1; r <= Math.min(ws.rowCount, TEMPLATE_MAX_ROWS + 1); r++) {
    const row = ws.getRow(r);
    const n = r === 1 ? Math.max(width, row.cellCount) : width;
    rows.push(Array.from({ length: n }, (_, i) => cellText(row.getCell(i + 1).value)));
  }
  if (ws.rowCount > TEMPLATE_MAX_ROWS + 1) return { error: `한 번에 ${TEMPLATE_MAX_ROWS}줄까지 올릴 수 있어요` };
  const body = readTemplate(rows, kind);
  return body ? { body } : { error: TEMPLATE_ERROR };
}
