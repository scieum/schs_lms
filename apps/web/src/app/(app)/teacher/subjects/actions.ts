"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin } from "@/lib/domain/policy";
import { isSubjectGroup, schoolYear, type TeacherCourse } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type SubjectsState = { error?: string; saved?: boolean };

const Payload = z.object({
  teacherId: z.string().min(1),
  groups: z.array(z.string()).max(10),
  courses: z.array(z.object({ courseId: z.string(), classes: z.array(z.number().int().min(1).max(20)).max(20) })).max(40),
});

/** 내 교과와 담당 과목·반 저장. 관리자는 다른 교사 것도 정할 수 있다 */
export async function saveSubjects(_: SubjectsState, form: FormData): Promise<SubjectsState> {
  const v = await requireCan("subjects.assign");
  let data: z.infer<typeof Payload>;
  try {
    data = Payload.parse(JSON.parse(String(form.get("payload") ?? "")));
  } catch {
    return { error: "저장할 내용을 읽지 못했어요" };
  }
  if (data.teacherId !== v.accountId && !isAdmin(v)) return { error: "다른 선생님 과목은 관리자만 정할 수 있어요" };
  if (!(await repo.getTeacher(data.teacherId))) return { error: "선생님을 찾지 못했어요" };

  const groups = data.groups.filter(isSubjectGroup);
  const offered = new Map((await repo.listCourses(schoolYear())).map((c) => [c.id, c]));
  const rows: TeacherCourse[] = [];
  for (const r of data.courses) {
    const c = offered.get(r.courseId);
    // 고른 교과에 속하고 편제표에 있는 과목만, 반을 하나 이상 고른 것만 저장
    if (!c || !groups.includes(c.group) || r.classes.length === 0) continue;
    rows.push({ teacherId: data.teacherId, courseId: c.id, classes: [...new Set(r.classes)].sort((a, b) => a - b) });
  }

  await repo.setTeacherGroups(data.teacherId, groups);
  await repo.setTeacherCourses(data.teacherId, rows);
  await repo.audit(v.accountId, "subjects.assign", `${groups.join("·") || "교과 없음"} / 과목 ${rows.length}개`);
  revalidatePath("/teacher/subjects");
  revalidatePath("/teacher/setuk");
  revalidatePath("/admin/curriculum");
  return { saved: true };
}
