"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSubjectGroup, matchSubject, schoolYear, subjectsOf, type CourseType } from "@/lib/domain/curriculum";
import { parseCourseLines, prepareCourseImport, type ImportRow } from "@/lib/domain/curriculum-import";
import { readCurriculum } from "@/lib/server/ai/admin-ai";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type CourseFormState = { error?: string; added?: string };

const Schema = z.object({
  grade: z.coerce.number().int().min(1).max(3),
  semester: z.coerce.number().int().min(1).max(2),
  group: z.string().refine(isSubjectGroup, "교과를 골라 주세요"),
  subject: z.string().trim().min(1, "과목을 골라 주세요").max(30),
  custom: z.enum(["0", "1"]),
  credits: z.coerce.number().int().min(1, "학점은 1~10").max(10, "학점은 1~10"),
});

/** 편제표에 과목 추가. 2022 개정 과목이 아니면 '직접 입력'(2015 개정·학교 지정 과목)으로 넣는다 */
export async function addCourse(_: CourseFormState, form: FormData): Promise<CourseFormState> {
  const v = await requireCan("curriculum.manage");
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { grade, semester, custom, credits } = p.data;
  let group = p.data.group;
  if (!isSubjectGroup(group)) return { error: "교과를 골라 주세요" };

  let subject = p.data.subject;
  let type: CourseType | null = null;
  if (custom === "0") {
    const s = subjectsOf(group).find((x) => x.name === subject);
    if (!s) return { error: "이 교과에 없는 과목이에요" };
    type = s.type;
  } else {
    // 직접 입력했는데 2022 개정 과목과 같으면 그 과목으로 맞춘다
    const m = matchSubject(subject);
    if (m) { subject = m.name; type = m.type; group = m.group; }
    if (subject.length < 2) return { error: "과목 이름을 2자 이상 써 주세요" };
  }

  try {
    await repo.createCourse({ year: schoolYear(), grade, semester: semester as 1 | 2, subject, group, type, credits });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "추가하지 못했어요" };
  }
  await repo.audit(v.accountId, "course.add", `${grade}-${semester} ${subject}`);
  revalidatePath("/admin/curriculum");
  return { added: `${grade}학년 ${semester}학기 ${subject}` };
}

export async function archiveCourse(form: FormData) {
  const v = await requireCan("curriculum.manage");
  const id = String(form.get("id") ?? "");
  const c = await repo.getCourse(id);
  if (!c) return;
  await repo.archiveCourse(id);
  await repo.audit(v.accountId, "course.archive", `${c.grade}-${c.semester} ${c.subject}`);
  revalidatePath("/admin/curriculum");
}

// ---------------------------------------------------------------- 편제표 파일 → 과목 일괄 추가

export type ImportPreview = { ok: true; rows: ImportRow[]; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

/** 편제표 읽기: 이미지·PDF 는 AI 가 과목 목록을 뽑고, 붙여넣은 글은 규칙으로 읽는다. 저장하지 않는다 */
export async function readCurriculumAction(form: FormData): Promise<ImportPreview> {
  const v = await requireCan("curriculum.manage");
  const existing = await repo.listCourses(schoolYear());
  const text = String(form.get("text") ?? "").slice(0, 20000);
  const f = form.get("file");
  if (f instanceof File && f.size > 0) {
    if (!FILE_TYPES.includes(f.type)) return { ok: false, error: "PDF, JPG, PNG 파일만 읽을 수 있어요" };
    if (f.size > MAX_BYTES) return { ok: false, error: "20MB까지 읽을 수 있어요" };
    if (!aiEnabled()) return { ok: false, error: "AI가 꺼져 있어요. 표를 글로 붙여 넣거나 한 과목씩 추가해 주세요" };
    const r = await readCurriculum(new Uint8Array(await f.arrayBuffer()), f.type);
    await repo.audit(v.accountId, "course.ai.read", `${r.ok ? r.data.length : 0}과목`);
    if (!r.ok) return { ok: false, error: `${r.error} · 글로 붙여 넣어도 돼요` };
    if (!r.data.length) return { ok: false, error: "편제표에서 과목을 찾지 못했어요" };
    return { ok: true, rows: prepareCourseImport(r.data.slice(0, 120), existing), label: "AI" };
  }
  const rows = parseCourseLines(text);
  if (!rows.length) return { ok: false, error: "읽을 줄이 없어요. 예: 2 1 물리학Ⅰ 4" };
  return { ok: true, rows: prepareCourseImport(rows.slice(0, 120), existing), label: "자동" };
}

const BulkSchema = z.array(z.object({
  grade: z.number().int(),
  semester: z.number().int(),
  subject: z.string().max(40),
  credits: z.number().int(),
  group: z.string().nullable(),
})).max(120);

export type BulkCourseState = { error?: string; done?: string; failed?: string[] };

/** 확인 후 추가: 고른 과목을 서버에서 다시 맞추고 검사한 뒤 편제표에 넣는다 */
export async function addCoursesBulk(_: BulkCourseState, form: FormData): Promise<BulkCourseState> {
  const v = await requireCan("curriculum.manage");
  let input: z.infer<typeof BulkSchema>;
  try {
    input = BulkSchema.parse(JSON.parse(String(form.get("rows") ?? "[]")));
  } catch {
    return { error: "편제표를 다시 읽어 주세요" };
  }
  if (!input.length) return { error: "추가할 과목을 골라 주세요" };
  const year = schoolYear();
  const rows = prepareCourseImport(input, await repo.listCourses(year));
  const failed = rows.filter((r) => r.error).map((r) => `${r.grade}-${r.semester} ${r.subject}: ${r.error}`);
  let made = 0;
  for (const r of rows.filter((x) => !x.error)) {
    try {
      await repo.createCourse({ year, grade: r.grade, semester: r.semester, subject: r.subject, group: r.group, type: r.type, credits: r.credits });
      made++;
    } catch (e) {
      failed.push(`${r.grade}-${r.semester} ${r.subject}: ${e instanceof Error ? e.message : "추가하지 못했어요"}`);
    }
  }
  if (made) await repo.audit(v.accountId, "course.add", `편제표 읽기 ${made}과목`);
  revalidatePath("/admin/curriculum");
  return { done: made ? `${made}과목을 추가했어요` : undefined, failed, error: made ? undefined : "추가한 과목이 없어요" };
}
