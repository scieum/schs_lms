"use server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { matchRoster, readRosterTable, splitPasted } from "@/lib/domain/class-roster";
import { isAdmin } from "@/lib/domain/policy";
import { makeStudentNo } from "@/lib/domain/roster";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 이동반 명단: 나이스에서 받은 명단 파일(엑셀·CSV) 또는 복사한 표를 읽어 학생과 맞춘 뒤, 교사가 확인하고 저장한다.

const MAX_BYTES = 3 * 1024 * 1024;

/** 내 것만, 관리자는 다른 교사 것도 */
async function who(teacherId: string) {
  const v = await requireCan("subjects.assign");
  if (teacherId !== v.accountId && !isAdmin(v)) return null;
  return v;
}

async function fileRows(f: File): Promise<string[][] | string> {
  if (f.size > MAX_BYTES) return "3MB 이하 파일만 올릴 수 있어요";
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

export type RosterPreview = {
  error?: string;
  courseId?: string;
  matched?: { id: string; label: string }[];
  unmatched?: string[];
  duplicates?: number;
  n?: number;
};

/** 명단 읽기 (저장하지 않음) */
export async function previewRoster(prev: RosterPreview, form: FormData): Promise<RosterPreview> {
  const n = (prev.n ?? 0) + 1;
  const teacherId = String(form.get("teacherId") ?? "");
  const courseId = String(form.get("courseId") ?? "");
  const section = String(form.get("section") ?? "");
  if (!(await who(teacherId))) return { error: "내 과목만 바꿀 수 있어요", n };
  const course = await repo.getCourse(courseId);
  const a = (await repo.listTeacherCourses(teacherId)).find((x) => x.courseId === courseId);
  if (!course || !a) return { error: "맡은 과목을 먼저 저장해 주세요", n };
  if (a.mode !== "moving" || !a.sections?.includes(section)) return { error: "이동반 분반을 먼저 저장해 주세요", n };

  const pasted = String(form.get("pasted") ?? "").trim();
  const f = form.get("file");
  let rows: string[][];
  if (f instanceof File && f.size > 0) {
    const r = await fileRows(f);
    if (typeof r === "string") return { error: r, courseId, n };
    rows = r;
  } else if (pasted) {
    rows = splitPasted(pasted);
  } else {
    return { error: "명단 파일을 고르거나 나이스 명단을 붙여 넣어 주세요", courseId, n };
  }
  const lines = readRosterTable(rows);
  if (!lines.length) return { error: "명단에서 학번이나 이름을 찾지 못했어요. 학번·성명 열이 있는지 확인해 주세요", courseId, n };
  const r = matchRoster(lines, await repo.listStudents(), course.grade);
  return {
    courseId, n, duplicates: r.duplicates,
    matched: r.matched.map((s) => ({ id: s.id, label: `${makeStudentNo(s.grade, s.classNo, s.number)} ${s.name}` })),
    unmatched: r.unmatched.map((l) => [l.studentNo, l.name].filter(Boolean).join(" ") || l.raw).slice(0, 50),
  };
}

export type RosterSave = { error?: string; done?: string; n?: number };

/** 확인한 명단 저장. 빈 목록이면 반 기준으로 되돌린다 */
export async function saveRoster(prev: RosterSave, form: FormData): Promise<RosterSave> {
  const n = (prev.n ?? 0) + 1;
  const teacherId = String(form.get("teacherId") ?? "");
  const courseId = String(form.get("courseId") ?? "");
  const section = String(form.get("section") ?? "");
  const v = await who(teacherId);
  if (!v) return { error: "내 과목만 바꿀 수 있어요", n };
  const a = (await repo.listTeacherCourses(teacherId)).find((x) => x.courseId === courseId);
  if (!a || a.mode !== "moving" || !a.sections?.includes(section)) return { error: "이동반 분반이 아니에요", n };
  const known = new Set((await repo.listStudents()).map((s) => s.id));
  const ids = [...new Set(form.getAll("studentId").map(String))].filter((id) => known.has(id));
  try {
    await repo.setCourseRoster(teacherId, courseId, section, ids);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요", n };
  }
  await repo.audit(v.accountId, "subjects.roster", `${courseId} ${section} ${ids.length}명`);
  revalidatePath("/teacher/subjects");
  revalidatePath("/teacher/setuk");
  return { done: ids.length ? `${section} 명단 ${ids.length}명을 저장했어요` : `${section} 명단을 비웠어요`, n };
}
