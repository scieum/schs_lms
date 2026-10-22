import ExcelJS from "exceljs";
import { md } from "@/lib/domain/program";
import { programRows, requireProgram } from "../../_lib/data";

// 학생별 현황 엑셀 (교사 본인·관리자만). 파일 이름에는 이름·학번을 넣지 않는다
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { program: p } = await requireProgram(id);
  const { rows } = await programRows(p);

  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고 쌤기부";
  const ws = wb.addWorksheet("학생별 현황");
  ws.columns = [
    { header: "학년", key: "grade", width: 6 }, { header: "반", key: "cls", width: 6 }, { header: "번호", key: "no", width: 6 },
    { header: "이름", key: "name", width: 10 }, { header: "근거 자료", key: "ev", width: 12 }, { header: "제출일", key: "at", width: 10 },
    { header: "초안 상태", key: "st", width: 12 }, { header: "분량", key: "len", width: 10 }, { header: "미제출 사유", key: "why", width: 20 },
    { header: "초안 (마지막 버전)", key: "draft", width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      grade: r.student.grade, cls: r.student.classNo, no: r.student.number, name: r.student.name, ev: r.evidenceLabel,
      at: r.response?.submittedAt ? md(r.response.submittedAt.slice(0, 10)) : "", st: r.hasEvidence ? r.review : "미제출",
      len: r.length ?? "", why: r.missingReason ?? "", draft: r.latest && r.latest.status !== "rejected" ? r.latest.content : "",
    });
  }
  ws.getColumn("draft").alignment = { wrapText: true, vertical: "top" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="program.xlsx"; filename*=UTF-8''${encodeURIComponent(`${p.title}_학생별현황.xlsx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
