"use server";
import { revalidatePath } from "next/cache";
import { withActivity } from "@/lib/domain/activity-name";
import { assessScope, checkAssessment, type AssessmentKind } from "@/lib/domain/assessment";
import { checkPicks, checkRubric, gradeTotal, parseRubric, GRADE_LIMITS, RUBRIC_SCALES, type AssessmentGrade, type GradePick, type Rubric, type RubricScale } from "@/lib/domain/rubric";
import { sectionAllowed, studentsInCourse } from "@/lib/domain/setuk";
import { normalizeSubjectName } from "@/lib/domain/curriculum";
import { readAssessPlan, type PlanItem } from "@/lib/server/ai/assess-plan";
import { readEvidence } from "@/lib/server/ai/read-evidence";
import { draftRubric, gradeAnswer, importRubric, transcribeAnswer } from "@/lib/server/ai/rubric";
import { subjectStandardList } from "@/lib/server/standards";
import { libraryEntries } from "@/lib/server/assess-library";
import { libraryDescription, libraryLine, libraryRubric, libraryTitle } from "@/lib/domain/assess-library";
import { readUpload } from "@/lib/server/hwpx";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";
import type { EvidenceFile } from "@/lib/server/ai/read-evidence";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 수행평가 (Figma N59): 등록 · 고치기 · 지우기 · 학생 자료 읽기. 루브릭 채점(N72): 루브릭 만들기 · 답안 채점 제안 · 확정.
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

export async function saveAssessment(input: { id?: string; courseId: string; section?: string | null; title: string; date: string; description?: string; kind?: AssessmentKind; rubric?: Rubric | null }): Promise<AssessResult> {
  const data = { title: String(input.title ?? "").trim(), date: String(input.date ?? ""), description: String(input.description ?? "").trim() };
  const bad = checkAssessment(data);
  if (bad) return { ok: false, error: bad };
  // 루브릭 (N72): 화면에서 온 값을 모양대로 다시 읽고 검사한다
  const rubric = input.kind === "rubric" ? parseRubric(input.rubric) : null;
  if (input.kind === "rubric") {
    const rb = rubric ? checkRubric(rubric) : "평가 기준을 하나 이상 넣어 주세요";
    if (rb) return { ok: false, error: rb };
  }
  try {
    if (input.id) {
      const m = await myAssessment(input.id);
      if (!m) return { ok: false, error: "내가 등록한 수행평가만 고칠 수 있어요" };
      await repo.updateAssessment(m.a.id, m.a.kind === "rubric" && rubric ? { ...data, rubric } : data);
      done();
      return { ok: true, id: m.a.id };
    }
    const c = await myCourse(String(input.courseId), input.section ?? null);
    if (!c) return { ok: false, error: "내 담당 과목에만 등록할 수 있어요" };
    const a = await repo.createAssessment(c.v.accountId, { courseId: c.course.id, section: input.section ?? null, ...data, kind: rubric ? "rubric" : "summary", rubric });
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

/** 수행평가 계획서 → AI 가 뽑은 수행평가 목록 (저장하지 않음, 등록 창에 채움). form: courseId · section · file */
export async function readAssessPlanFile(form: FormData): Promise<{ ok: true; items: PlanItem[] } | { ok: false; error: string }> {
  const c = await myCourse(String(form.get("courseId") ?? ""), (form.get("section") as string) || null);
  if (!c) return { ok: false, error: "내 담당 과목에만 쓸 수 있어요" };
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) return { ok: false, error: "파일을 골라 주세요" };
  const up = await readUpload(f);
  if (typeof up === "string") return { ok: false, error: up };
  const r = await readAssessPlan(up, { subject: c.course.subject, year: c.course.year });
  await repo.audit(c.v.accountId, "assessment.plan", `${c.course.subject} ${f.name}`);
  return r.ok ? { ok: true, items: r.data } : r;
}

export type LibraryAssessment = PlanItem & { key: string; who: string; where: string; tag: string; rubric: Rubric | null };

/** 학교 평가계획서 라이브러리 (N78): 이 과목 수행평가 — 이름 · 내용 · 루브릭 · 성취기준을 등록 창에 채운다 (AI 없음, 저장 안 함) */
export async function libraryAssessments(courseId: string, section: string | null): Promise<LibraryAssessment[]> {
  const c = await myCourse(String(courseId), section);
  if (!c) return [];
  const known = subjectStandardList(c.course.subject)?.items ?? [];
  return libraryEntries(c.course).map((e) => {
    const rubric = libraryRubric(e, known);
    return {
      key: e.key, title: libraryTitle(e), date: null, description: libraryDescription(e), rubric,
      who: `${e.grade}학년 ${e.semester}학기 평가계획서 · ${e.subject}`, where: libraryLine(e),
      tag: rubric ? `루브릭 ${rubric.criteria.length}기준` : "자료 요약",
    };
  });
}

export type SharedAssessment = PlanItem & { id: string; who: string; where: string; mine: boolean; rubric?: Rubric | null };

/** 같은 과목 수행평가 가져오기 (클리포처럼): 올해 같은 이름 과목에 등록된 수행평가 — 다른 선생님 것 + 내 다른 반 것 */
export async function listSameSubjectAssessments(courseId: string, section: string | null): Promise<SharedAssessment[]> {
  const c = await myCourse(String(courseId), section);
  if (!c) return [];
  const key = normalizeSubjectName(c.course.subject);
  const [courses, teachers] = await Promise.all([repo.listCourses(c.course.year, { joint: true }), repo.listTeachers()]);
  const same = courses.filter((x) => normalizeSubjectName(x.subject) === key);
  const lists = await Promise.all(same.map((x) => repo.listAssessments({ courseId: x.id })));
  const seen = new Set<string>();
  return lists.flat()
    .filter((a) => !(a.courseId === c.course.id && (a.section ?? null) === (section ?? null) && a.teacherId === c.v.accountId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((a) => { const k = `${a.title}|${a.description}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((a) => {
      const course = same.find((x) => x.id === a.courseId)!;
      const mine = a.teacherId === c.v.accountId;
      const name = teachers.find((t) => t.id === a.teacherId)?.name;
      return { id: a.id, title: a.title, date: a.date, description: a.description, mine, rubric: a.rubric,
        who: mine ? "내 수업" : name ? `${name} 선생님` : "다른 선생님",
        where: `${course.subject}${a.section ? ` · ${a.section}` : ""}` };
    })
    .slice(0, 30);
}

// ---------- 루브릭 채점 (Figma N72) ----------

export type StandardItem = { code: string; text: string; unit: string };

/** 이 과목의 성취기준 (2022 개정, 루브릭 등록 창에서 고른다). 데이터에 없는 과목이면 빈 목록 */
export async function courseStandards(courseId: string, section: string | null): Promise<{ subject: string | null; items: StandardItem[] }> {
  const c = await myCourse(String(courseId), section);
  if (!c) return { subject: null, items: [] };
  const list = subjectStandardList(c.course.subject);
  return { subject: list?.name ?? null, items: list?.items ?? [] };
}

/** 성취기준 · 내용 → 루브릭 초안 (저장 안 함, 등록 창 표에 채움) */
export async function draftRubricAction(input: { courseId: string; section: string | null; title: string; description: string; standards: string[]; scale: RubricScale; total: number }): Promise<{ ok: true; rubric: Rubric } | { ok: false; error: string }> {
  const c = await myCourse(String(input.courseId), input.section ?? null);
  if (!c) return { ok: false, error: "내 담당 과목에만 쓸 수 있어요" };
  if (!String(input.title ?? "").trim()) return { ok: false, error: "수행평가 이름을 먼저 적어 주세요" };
  const scale = RUBRIC_SCALES.includes(input.scale) ? input.scale : "상중하";
  const all = subjectStandardList(c.course.subject)?.items ?? [];
  const standards = all.filter((s) => (input.standards ?? []).includes(s.code)).slice(0, 6);
  const total = Math.min(200, Math.max(4, Math.round(Number(input.total) || 20)));
  const r = await draftRubric({ subject: c.course.subject, title: String(input.title).trim(), description: String(input.description ?? ""), standards, scale, total });
  await repo.audit(c.v.accountId, "assessment.rubric_draft", `${c.course.subject} ${String(input.title).slice(0, 40)}`);
  return r.ok ? { ok: true, rubric: r.data } : r;
}

export type RubricImport = { ok: true; rubric: Rubric } | { ok: false; error: string };

/** 교사가 만든 루브릭 파일 → 등록 창 표 (저장 안 함). form: courseId · section · title · file 또는 text(큰 PDF를 쪽마다 옮긴 글) */
export async function importRubricAction(form: FormData): Promise<RubricImport> {
  const c = await myCourse(String(form.get("courseId") ?? ""), (form.get("section") as string) || null);
  if (!c) return { ok: false, error: "내 담당 과목에만 쓸 수 있어요" };
  const text = form.get("text");
  const file = typeof text === "string" ? null : await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  if (typeof text === "string" && text.trim().length < 5) return { ok: false, error: "파일에서 글을 찾지 못했어요" };
  const known = subjectStandardList(c.course.subject)?.items ?? [];
  try {
    const r = await importRubric({ ...(file ? { file } : { text: String(text).slice(0, 40000) }), subject: c.course.subject, title: String(form.get("title") ?? "").trim(), known });
    await repo.audit(c.v.accountId, "assessment.rubric_import", `${c.course.subject} ${String(form.get("title") ?? "").slice(0, 40)}`);
    return r.ok ? { ok: true, rubric: r.data } : r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "루브릭을 읽지 못했어요" };
  }
}

/** 큰 루브릭 PDF: 쪽 묶음 하나 → 글 (저장 안 함). 다 모으면 importRubricAction 에 text 로 */
export async function readRubricPart(form: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const c = await myCourse(String(form.get("courseId") ?? ""), (form.get("section") as string) || null);
  if (!c) return { ok: false, error: "내 담당 과목에만 쓸 수 있어요" };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await transcribeAnswer(file, [], "루브릭");
  return r.ok ? { ok: true, text: r.data } : r;
}

/** 내 루브릭 수행평가 · 이 분반 학생 */
async function rubricTarget(assessmentId: string, studentId: string) {
  const m = await myAssessment(String(assessmentId));
  if (!m || m.a.kind !== "rubric" || !m.a.rubric) return null;
  const c = await myCourse(m.a.courseId, m.a.section);
  if (!c) return null;
  const [student, roster, all] = await Promise.all([repo.getStudent(String(studentId)), repo.getCourseRosters(c.v.accountId, c.course.id), repo.listStudents({ external: true })]);
  if (!student || !studentsInCourse([student], c.course, c.assignment, roster, m.a.section).length) return null;
  const standards = (subjectStandardList(c.course.subject)?.items ?? []).filter((s) => m.a.rubric!.standards.includes(s.code));
  return { v: c.v, a: m.a, rubric: m.a.rubric, course: c.course, student, people: peopleAround(student, all), standards };
}
type RubricTarget = NonNullable<Awaited<ReturnType<typeof rubricTarget>>>;

export type GradeResult = { ok: true; grade: AssessmentGrade } | { ok: false; error: string };

async function saveSuggestion(t: RubricTarget, source: { file?: EvidenceFile; text?: string }): Promise<GradeResult> {
  const r = await gradeAnswer({ ...source, rubric: t.rubric, subject: t.course.subject, title: t.a.title, description: t.a.description, standards: t.standards, people: t.people });
  await repo.audit(t.v.accountId, "assessment.grade_ai", `${t.course.subject} ${t.a.title} ${t.student.pseudonymId}`);
  if (!r.ok) return r;
  const grade = await repo.addGrade({ assessmentId: t.a.id, studentId: t.student.id, teacherId: t.v.accountId, picks: r.data.picks, total: gradeTotal(t.rubric, r.data.picks), status: "ai", reading: r.data.reading, piece: r.data.piece });
  revalidatePath("/teacher/setuk/assessments");
  return { ok: true, grade };
}

const NO_TARGET = "내 루브릭 수행평가 · 이 분반 학생만 채점할 수 있어요";

/** 답안 한 파일 → AI 채점 제안 (저장: 판정 "ai" 한 줄, 답안 파일은 저장 안 함). form: assessmentId · studentId · file */
export async function gradeAssessmentFile(form: FormData): Promise<GradeResult> {
  const t = await rubricTarget(String(form.get("assessmentId") ?? ""), String(form.get("studentId") ?? ""));
  if (!t) return { ok: false, error: NO_TARGET };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  try { return await saveSuggestion(t, { file }); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "채점하지 못했어요" }; }
}

/** 큰 PDF: 쪽 하나 → 답안 글 (저장 안 함). 다 모으면 gradeAssessmentText 로 */
export async function readAnswerPart(form: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const t = await rubricTarget(String(form.get("assessmentId") ?? ""), String(form.get("studentId") ?? ""));
  if (!t) return { ok: false, error: NO_TARGET };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await transcribeAnswer(file, t.people);
  return r.ok ? { ok: true, text: r.data } : r;
}

export async function gradeAssessmentText(input: { assessmentId: string; studentId: string; text: string }): Promise<GradeResult> {
  const t = await rubricTarget(input.assessmentId, input.studentId);
  if (!t) return { ok: false, error: NO_TARGET };
  const text = String(input.text ?? "").slice(0, 40000);
  if (text.trim().length < 5) return { ok: false, error: "답안에서 글을 찾지 못했어요" };
  try { return await saveSuggestion(t, { text }); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "채점하지 못했어요" }; }
}

/** 확정: 고른 수준으로 판정 "confirmed" 한 줄 + 조각 글을 수행평가 조각으로 (둘 다 추가만, C4). AI 없이 직접 골라도 된다 */
export async function confirmGrade(input: { assessmentId: string; studentId: string; picks: GradePick[]; piece: string; reading?: string }): Promise<GradeResult> {
  const t = await rubricTarget(input.assessmentId, input.studentId);
  if (!t) return { ok: false, error: "내 루브릭 수행평가 · 이 분반 학생만 확정할 수 있어요" };
  const ok = checkPicks(t.rubric, Array.isArray(input.picks) ? input.picks : []);
  if (!ok.ok) return ok;
  const piece = String(input.piece ?? "").trim().slice(0, GRADE_LIMITS.piece);
  try {
    const grade = await repo.addGrade({
      assessmentId: t.a.id, studentId: t.student.id, teacherId: t.v.accountId, picks: ok.picks, total: gradeTotal(t.rubric, ok.picks), status: "confirmed",
      reading: String(input.reading ?? "").slice(0, GRADE_LIMITS.reading), piece,
    });
    if (piece.length >= 5) await repo.addRecordMemo({ scope: assessScope(t.course.id, t.a.id), studentId: t.student.id, authorId: t.v.accountId, content: withActivity(t.a.title, piece) });
    await repo.audit(t.v.accountId, "assessment.grade_confirm", `${t.course.subject} ${t.a.title} ${t.student.pseudonymId} ${grade.total}`);
    done();
    return { ok: true, grade };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "확정하지 못했어요" };
  }
}
