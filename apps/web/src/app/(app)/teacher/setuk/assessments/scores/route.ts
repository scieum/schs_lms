import ExcelJS from "exceljs";
import { can } from "@/lib/domain/policy";
import { latestGrades, scoreSheet } from "@/lib/domain/rubric";
import { studentsInCourse } from "@/lib/domain/setuk";
import { styleHead } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import { xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer } from "@/lib/server/viewer";

// 점수 엑셀로 받기 (Figma N72): 내 루브릭 수행평가 하나 — 학생마다 기준별 수준 · 점수 · 합계 · 상태. ?a=<수행평가 id>
// 감사에는 수행평가 이름 · 학생 수만.
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.mustChangePassword || !can(v, "setuk.write")) return text("권한이 없어요", 403);
  const id = new URL(req.url).searchParams.get("a") ?? "";
  const a = (await repo.listAssessments({ teacherId: v.accountId })).find((x) => x.id === id);
  if (!a || a.kind !== "rubric" || !a.rubric) return text("내 루브릭 수행평가가 아니에요", 404);
  const [course, mine, roster, all, grades] = await Promise.all([
    repo.getCourse(a.courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, a.courseId), repo.listStudents({ external: true }), repo.listGrades(a.id),
  ]);
  const assignment = mine.find((x) => x.courseId === a.courseId);
  if (!course || !assignment) return text("내 담당 과목이 아니에요", 404);
  const students = studentsInCourse(all, course, assignment, roster, a.section).map((s) => ({ id: s.id, no: s.school ?? s.studentNo, name: s.name }));
  const { head, rows } = scoreSheet(a.rubric, students, latestGrades(grades));

  const wb = new ExcelJS.Workbook();
  wb.creator = "속초고 쌤기부";
  const ws = wb.addWorksheet("점수");
  styleHead(ws.addRow(head), head.length);
  for (const r of rows) ws.addRow(r);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c, i) => { c.width = i < 2 ? 10 : 14; });
  const data = await wb.xlsx.writeBuffer();
  await repo.audit(v.accountId, "assessment.scores_xlsx", `${course.subject} ${a.title} n=${rows.length}`);
  const name = `${course.subject}${a.section ? `_${a.section}` : ""}_${a.title}_점수.xlsx`.replace(/[\\/:*?"<>|\s]+/g, "_");
  return xlsxResponse(data as ArrayBuffer, "assessment_scores.xlsx", name);
}
