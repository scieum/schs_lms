"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin } from "@/lib/domain/policy";
import { isSubjectGroup, schoolYear, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import { suggestMyCourses } from "@/lib/server/ai/teacher-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type SubjectsState = { error?: string; saved?: boolean };

const Payload = z.object({
  teacherId: z.string().min(1),
  groups: z.array(z.string()).max(10),
  courses: z.array(z.object({
    courseId: z.string(),
    classes: z.array(z.number().int().min(1).max(20)).max(20),
    mode: z.enum(["fixed", "moving"]).optional().default("fixed"),
    sections: z.array(z.string().trim().min(1).max(20)).max(12).optional().default([]),
  })).max(40),
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
    // 고른 교과에 속하고 편제표에 있는 과목만. 고정반은 반을, 이동반은 분반을 하나 이상 고른 것만 저장
    if (!c || !groups.includes(c.group)) continue;
    if (r.mode === "moving") {
      const sections = [...new Set(r.sections)];
      if (!sections.length) continue;
      rows.push({ teacherId: data.teacherId, courseId: c.id, classes: [], mode: "moving", sections });
    } else {
      if (r.classes.length === 0) continue;
      rows.push({ teacherId: data.teacherId, courseId: c.id, classes: [...new Set(r.classes)].sort((a, b) => a - b), mode: "fixed", sections: [] });
    }
  }

  // 공동교육과정 수업(N54) 배정은 이 폼에 없으니 그대로 둔다
  const joint = new Set((await repo.listCourses(schoolYear(), { joint: true })).filter((c) => c.joint).map((c) => c.id));
  rows.push(...(await repo.listTeacherCourses(data.teacherId)).filter((a) => joint.has(a.courseId)));

  await repo.setTeacherGroups(data.teacherId, groups);
  try {
    await repo.setTeacherCourses(data.teacherId, rows);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  await repo.audit(v.accountId, "subjects.assign", `${groups.join("·") || "교과 없음"} / 과목 ${rows.length}개`);
  revalidatePath("/teacher/subjects");
  revalidatePath("/teacher/setuk");
  revalidatePath("/admin/curriculum");
  return { saved: true };
}

export type CourseAdvice = { ok: true; groups: SubjectGroup[]; courseIds: string[]; reason: string; label: "AI" | "자동"; notice?: string } | { ok: false; error: string };

/** "내 교과로 추천": 부서(교과) + 편제표 → 교과·과목 후보. 저장하지 않는다 (학생 정보 없음) */
export async function adviseCourses(input: { teacherId: string; groups: string[] }): Promise<CourseAdvice> {
  const v = await requireCan("subjects.assign");
  if (input.teacherId !== v.accountId && !isAdmin(v)) return { ok: false, error: "다른 선생님 과목은 관리자만 정할 수 있어요" };
  const t = await repo.getTeacher(input.teacherId);
  if (!t) return { ok: false, error: "선생님을 찾지 못했어요" };
  const courses = await repo.listCourses(schoolYear());
  if (!courses.length) return { ok: false, error: "편제표에 과목이 없어요" };
  const r = await suggestMyCourses(t.dept, input.groups.filter(isSubjectGroup), courses);
  if (r.label === "AI") await repo.audit(v.accountId, "subjects.ai.suggest", t.dept ?? null);
  if (!r.data.groups.length) return { ok: false, error: r.data.reason };
  return { ok: true, ...r.data, label: r.label, notice: r.error ? `AI 대신 부서 이름으로 골랐어요 (${r.error})` : undefined };
}
