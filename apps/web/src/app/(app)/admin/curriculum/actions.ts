"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSubjectGroup, matchSubject, schoolYear, subjectsOf, type CourseType } from "@/lib/domain/curriculum";
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
