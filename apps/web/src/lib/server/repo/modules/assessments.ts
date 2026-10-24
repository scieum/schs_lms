import "server-only";
import type { Assessment } from "@/lib/domain/assessment";
import { parseRubric, type AssessmentGrade, type GradePick, type Rubric } from "@/lib/domain/rubric";
import { check, db, isUuid } from "../supabase";

// 수행평가 (Figma N59): 교사 · 과목(분반)마다 등록. 학생 자료 요약은 record_memos(세특:<과목>#수행:<id>)에 쌓인다. 표 0033.
// 루브릭 채점 (N72): 종류 · 루브릭 열(0039)과 판정 표 assessment_grades(추가만). 적용 전 DB면 읽기는 예전처럼, 쓰기는 안내 문구로 실패.

export type AssessmentInput = Pick<Assessment, "courseId" | "section" | "title" | "date" | "description" | "kind" | "rubric">;
export type GradeInput = Pick<AssessmentGrade, "assessmentId" | "studentId" | "teacherId" | "picks" | "total" | "status" | "reading" | "piece">;

export interface AssessmentsRepo {
  listAssessments(filter: { courseId?: string; teacherId?: string }): Promise<Assessment[]>;
  createAssessment(teacherId: string, input: AssessmentInput): Promise<Assessment>;
  /** rubric 은 루브릭 수행평가를 고칠 때만 준다 */
  updateAssessment(id: string, input: Pick<Assessment, "title" | "date" | "description"> & { rubric?: Rubric }): Promise<void>;
  deleteAssessment(id: string): Promise<void>;
  listGrades(assessmentId: string): Promise<AssessmentGrade[]>;
  addGrade(input: GradeInput): Promise<AssessmentGrade>;
}

const g = globalThis as unknown as { __schsassess?: Assessment[]; __schsgrades?: AssessmentGrade[] };
const mem = () => (g.__schsassess ??= []);
const grades = () => (g.__schsgrades ??= []);

export const demoAssessments: AssessmentsRepo = {
  async listAssessments(f) { return mem().filter((a) => (!f.courseId || a.courseId === f.courseId) && (!f.teacherId || a.teacherId === f.teacherId)).map((a) => structuredClone(a)); },
  async createAssessment(teacherId, input) { const a: Assessment = { id: crypto.randomUUID(), teacherId, ...input, createdAt: new Date().toISOString() }; mem().push(a); return structuredClone(a); },
  async updateAssessment(id, input) { const a = mem().find((x) => x.id === id); if (a) Object.assign(a, { ...input, rubric: input.rubric ?? a.rubric }); },
  async deleteAssessment(id) { g.__schsassess = mem().filter((x) => x.id !== id); },
  async listGrades(assessmentId) { return grades().filter((x) => x.assessmentId === assessmentId).map((x) => structuredClone(x)); },
  async addGrade(input) { const x: AssessmentGrade = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() }; grades().push(x); return structuredClone(x); },
};

const NEED33 = "수행평가를 저장하려면 DB 업데이트(0033)가 필요해요. 관리자에게 알려 주세요";
const NEED39 = "루브릭 채점을 쓰려면 DB 업데이트(0039)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /course_assessments/.test(e.message);
const missing39 = (e: { message: string } | null) => !!e && /assessment_grades|rubric|\bkind\b/.test(e.message);
type Row = { id: string; course_id: string; section: string | null; teacher_id: string; title: string; date: string; description: string; kind?: string | null; rubric?: unknown; created_at: string };
const toA = (r: Row): Assessment => {
  const rubric = r.kind === "rubric" ? parseRubric(r.rubric) : null;
  return { id: r.id, courseId: r.course_id, section: r.section, teacherId: r.teacher_id, title: r.title, date: r.date, description: r.description ?? "", kind: rubric ? "rubric" : "summary", rubric, createdAt: r.created_at };
};
type GradeRow = { id: string; assessment_id: string; student_id: string; teacher_id: string; picks: unknown; total: number; status: string; reading: string; piece: string; created_at: string };
const toGrade = (r: GradeRow): AssessmentGrade => ({
  id: r.id, assessmentId: r.assessment_id, studentId: r.student_id, teacherId: r.teacher_id,
  picks: (Array.isArray(r.picks) ? r.picks : []) as GradePick[], total: r.total, status: r.status === "confirmed" ? "confirmed" : "ai",
  reading: r.reading ?? "", piece: r.piece ?? "", createdAt: r.created_at,
});

export const supabaseAssessments: AssessmentsRepo = {
  async listAssessments(f) {
    let q = db().from("course_assessments").select("*").is("deleted_at", null);
    if (f.courseId) { if (!isUuid(f.courseId)) return []; q = q.eq("course_id", f.courseId); }
    if (f.teacherId) { if (!isUuid(f.teacherId)) return []; q = q.eq("teacher_id", f.teacherId); }
    const res = await q;
    if (missing(res.error)) return [];
    return (check(res) as Row[]).map(toA);
  },
  async createAssessment(teacherId, input) {
    const row: Record<string, unknown> = { course_id: input.courseId, section: input.section, teacher_id: teacherId, title: input.title, date: input.date, description: input.description };
    // 자료 요약은 0039 전 DB에서도 그대로 저장되게 kind · rubric 열을 넣지 않는다
    const res = await db().from("course_assessments").insert(input.kind === "rubric" ? { ...row, kind: "rubric", rubric: input.rubric } : row).select("*").single();
    if (missing(res.error)) throw new Error(NEED33);
    if (input.kind === "rubric" && missing39(res.error)) throw new Error(NEED39);
    return toA(check(res) as Row);
  },
  async updateAssessment(id, input) {
    const { rubric, ...rest } = input;
    const res = await db().from("course_assessments").update(rubric ? { ...rest, rubric } : rest).eq("id", id);
    if (missing(res.error)) throw new Error(NEED33);
    if (rubric && missing39(res.error)) throw new Error(NEED39);
    check(res);
  },
  async deleteAssessment(id) {
    const res = await db().from("course_assessments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (missing(res.error)) throw new Error(NEED33);
    check(res);
  },
  async listGrades(assessmentId) {
    if (!isUuid(assessmentId)) return [];
    const res = await db().from("assessment_grades").select("*").eq("assessment_id", assessmentId).order("created_at");
    if (missing39(res.error)) return [];
    return (check(res) as GradeRow[]).map(toGrade);
  },
  async addGrade(input) {
    const res = await db().from("assessment_grades").insert({
      assessment_id: input.assessmentId, student_id: input.studentId, teacher_id: input.teacherId,
      picks: input.picks, total: input.total, status: input.status, reading: input.reading, piece: input.piece,
    }).select("*").single();
    if (missing39(res.error)) throw new Error(NEED39);
    return toGrade(check(res) as GradeRow);
  },
};
