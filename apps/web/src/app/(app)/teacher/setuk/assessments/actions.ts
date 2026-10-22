"use server";
import { revalidatePath } from "next/cache";
import { withActivity } from "@/lib/domain/activity-name";
import { assessScope, checkAssessment } from "@/lib/domain/assessment";
import { sectionAllowed, studentsInCourse } from "@/lib/domain/setuk";
import { readEvidence } from "@/lib/server/ai/read-evidence";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 수행평가 (Figma N59): 등록 · 고치기 · 지우기 · 학생 자료 읽기.
// 학생 자료는 한 명씩이든 합본을 브라우저에서 나눈 조각이든 한 파일씩 들어오고, AI가 읽은 요약만 조각으로 남긴다(파일은 저장 안 함, C4 추가만).

export type AssessResult = { ok: true; id: string } | { ok: false; error: string };
export type ReadResult = { ok: true; text: string; label: "AI" | "자동" } | { ok: false; error: string };

/** 내 담당 과목(분반)인지 */
async function myCourse(courseId: string, section: string | null) {
  const v = await requireCan("setuk.write");
  const [course, mine] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId)]);
  const a = mine.find((x) => x.courseId === courseId);
  if (!course || !a) return null;
  if (!sectionAllowed(a, section)) return null;
  return { v, course, assignment: a };
}

async function myAssessment(id: string) {
  const v = await requireCan("setuk.write");
  const a = (await repo.listAssessments({ teacherId: v.accountId })).find((x) => x.id === id);
  return a ? { v, a } : null;
}

const done = () => { revalidatePath("/teacher/setuk/assessments"); revalidatePath("/teacher/setuk/compose"); };

export async function saveAssessment(input: { id?: string; courseId: string; section?: string | null; title: string; date: string; description?: string }): Promise<AssessResult> {
  const data = { title: String(input.title ?? "").trim(), date: String(input.date ?? ""), description: String(input.description ?? "").trim() };
  const bad = checkAssessment(data);
  if (bad) return { ok: false, error: bad };
  try {
    if (input.id) {
      const m = await myAssessment(input.id);
      if (!m) return { ok: false, error: "내가 등록한 수행평가만 고칠 수 있어요" };
      await repo.updateAssessment(m.a.id, data);
      done();
      return { ok: true, id: m.a.id };
    }
    const c = await myCourse(String(input.courseId), input.section ?? null);
    if (!c) return { ok: false, error: "내 담당 과목에만 등록할 수 있어요" };
    const a = await repo.createAssessment(c.v.accountId, { courseId: c.course.id, section: input.section ?? null, ...data });
    await repo.audit(c.v.accountId, "assessment.create", `${c.course.subject} ${a.title}`);
    done();
    return { ok: true, id: a.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

/** 지우기: 수행평가만 내린다. 이미 남긴 자료 요약 조각은 그대로 (C4) */
export async function deleteAssessment(id: string): Promise<AssessResult> {
  const m = await myAssessment(String(id));
  if (!m) return { ok: false, error: "내가 등록한 수행평가만 지울 수 있어요" };
  try { await repo.deleteAssessment(m.a.id); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "지우지 못했어요" }; }
  await repo.audit(m.v.accountId, "assessment.delete", m.a.title);
  done();
  return { ok: true, id: m.a.id };
}

/** 학생 자료 한 파일 → AI 요약 → "수행평가" 조각. form: assessmentId · studentId · file */
export async function readAssessmentFile(form: FormData): Promise<ReadResult> {
  const m = await myAssessment(String(form.get("assessmentId") ?? ""));
  if (!m) return { ok: false, error: "내가 등록한 수행평가가 아니에요" };
  const c = await myCourse(m.a.courseId, m.a.section);
  if (!c) return { ok: false, error: "내 담당 과목이 아니에요" };
  const [student, roster, all] = await Promise.all([repo.getStudent(String(form.get("studentId") ?? "")), repo.getCourseRosters(c.v.accountId, c.course.id), repo.listStudents({ external: true })]);
  if (!student || !studentsInCourse([student], c.course, c.assignment, roster, m.a.section).length) return { ok: false, error: "이 분반 학생만 올릴 수 있어요" };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, {
    mode: "log", kind: `${c.course.subject} 수행평가 「${m.a.title}」`,
    context: m.a.description ? `평가 내용 · 기준: ${m.a.description}` : null,
    people: peopleAround(student, all),
  });
  await repo.audit(c.v.accountId, "assessment.read", `${c.course.subject} ${m.a.title} ${student.pseudonymId}`);
  if (!r.ok) return r;
  if (!r.text.trim()) return { ok: false, error: "자료에서 읽을 내용을 찾지 못했어요" };
  await repo.addRecordMemo({ scope: assessScope(c.course.id, m.a.id), studentId: student.id, authorId: c.v.accountId, content: withActivity(m.a.title, r.text) });
  done();
  return { ok: true, text: r.text, label: r.label };
}
