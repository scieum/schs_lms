import ExcelJS from "exceljs";
import { can } from "@/lib/domain/policy";
import { AREA_TAB, ISSUE_KEYS, ISSUE_LABEL, readArea, reportFileName, type Counts } from "@/lib/domain/record-report";
import { kstToday } from "@/lib/domain/retention";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";
import { loadReport } from "../load";

// 학생부 점검 보고서 엑셀 (Figma N39 ②): 시트 "요약" · "반별" · "과목·분반" · "선생님별" — 숫자만 (학생 이름·학번·글 없음).
// N25 엑셀 양식처럼 1행 제목(파란 바탕·굵게·틀 고정). 감사 로그에는 record_report.export {grade, area, rows}만.
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || !can(v, "report.view")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const sp = new URL(req.url).searchParams;
  const area = readArea(sp.get("area"));
  const d = await loadReport(sp.get("grade") ?? undefined, area);

  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고 쌤기부";
  const sheet = (name: string, head: string[], rows: (string | number)[][], widths: number[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = head.map((h, i) => ({ header: h, key: `c${i}`, width: widths[i] ?? 10 }));
    const r1 = ws.getRow(1);
    r1.height = 20;
    head.forEach((_, i) => {
      const c = r1.getCell(i + 1);
      c.font = { bold: true, color: { argb: "FF26348C" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFE3FF" } };
      c.alignment = { horizontal: "left", vertical: "middle" };
      c.border = { bottom: { style: "medium", color: { argb: "FF8B95A1" } } };
    });
    rows.forEach((r) => ws.addRow(r));
  };
  const counts = (c: Counts) => [c.empty, c.writing, c.confirmed, c.progress, ...ISSUE_KEYS.map((k) => c[k])];
  const countHead = ["미작성", "작성 중", "확정", "진행률(%)", ...ISSUE_KEYS.map((k) => ISSUE_LABEL[k].head)];
  const s = d.summary;

  sheet("요약", ["항목", "값"], [
    ["학년도·학기", `${d.year}학년도 ${d.semester}학기`], ["학년", `${d.grade}학년`], ["영역", AREA_TAB[area]], ["기준", kstToday()],
    ["전체 기록(건)", s.total], ["확정(건)", s.confirmed], ["작성 중(건)", s.writing], ["미작성(건)", s.empty], ["진행률(%)", s.progress],
    ["확인 필요(건)", s.check], ...ISSUE_KEYS.map((k) => [`${ISSUE_LABEL[k].chip}(건)`, s[k]] as [string, number]),
  ], [22, 22]);
  sheet("반별", ["반", "담임", "학생", ...countHead], d.classes.map((c) => [c.key, c.homeroom ?? "", c.students, ...counts(c.counts)]), [8, 10, 8, 8, 8, 8, 10, 10, 10, 8, 10, 10]);
  const setuk = d.perArea.find((x) => x.area === "세특");
  sheet("과목·분반", ["과목·분반", "선생님", "학생", ...countHead], (setuk?.groups ?? []).map((g) => [g.label, d.teacherName(g.teacherId), g.students, ...counts(g.counts)]), [24, 10, 8, 8, 8, 8, 10, 10, 10, 8, 10, 10]);
  sheet("선생님별", ["선생님", "맡은 것", "기록", "확정", "진행률(%)", "확인 필요", "마지막 작성"], d.teachers.map((t) => [t.name, t.scopes.join(" · "), t.records, t.confirmed, t.progress, t.check, t.last ? t.last.slice(0, 10) : ""]), [10, 40, 8, 8, 10, 10, 12]);

  await repo.audit(v.accountId, "record_report.export", JSON.stringify({ grade: d.grade, area: d.areaParam, rows: s.total }));
  const buf = await wb.xlsx.writeBuffer();
  const file = reportFileName(d.grade, kstToday());
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="record_report.xlsx"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
}
