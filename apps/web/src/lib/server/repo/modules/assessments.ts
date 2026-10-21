import "server-only";
import type { Assessment } from "@/lib/domain/assessment";
import { check, db, isUuid } from "../supabase";

// 수행평가 (Figma N59): 교사 · 과목(분반)마다 등록. 학생 자료 요약은 record_memos(세특:<과목>#수행:<id>)에 쌓인다. 표 0033.
// 적용 전 DB면 읽기는 빈 목록, 쓰기는 안내 문구로 실패.

export type AssessmentInput = Pick<Assessment, "courseId" | "section" | "title" | "date" | "description">;

export interface AssessmentsRepo {
  listAssessments(filter: { courseId?: string; teacherId?: string }): Promise<Assessment[]>;
  createAssessment(teacherId: string, input: AssessmentInput): Promise<Assessment>;
  updateAssessment(id: string, input: Pick<Assessment, "title" | "date" | "description">): Promise<void>;
  deleteAssessment(id: string): Promise<void>;
}

const g = globalThis as unknown as { __schsassess?: Assessment[] };
const mem = () => (g.__schsassess ??= []);

export const demoAssessments: AssessmentsRepo = {
  async listAssessments(f) { return mem().filter((a) => (!f.courseId || a.courseId === f.courseId) && (!f.teacherId || a.teacherId === f.teacherId)).map((a) => ({ ...a })); },
  async createAssessment(teacherId, input) { const a: Assessment = { id: crypto.randomUUID(), teacherId, ...input, createdAt: new Date().toISOString() }; mem().push(a); return { ...a }; },
  async updateAssessment(id, input) { const a = mem().find((x) => x.id === id); if (a) Object.assign(a, input); },
  async deleteAssessment(id) { g.__schsassess = mem().filter((x) => x.id !== id); },
};

const NEED33 = "수행평가를 저장하려면 DB 업데이트(0033)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /course_assessments/.test(e.message);
type Row = { id: string; course_id: string; section: string | null; teacher_id: string; title: string; date: string; description: string; created_at: string };
const toA = (r: Row): Assessment => ({ id: r.id, courseId: r.course_id, section: r.section, teacherId: r.teacher_id, title: r.title, date: r.date, description: r.description ?? "", createdAt: r.created_at });

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
    const res = await db().from("course_assessments").insert({ course_id: input.courseId, section: input.section, teacher_id: teacherId, title: input.title, date: input.date, description: input.description }).select("*").single();
    if (missing(res.error)) throw new Error(NEED33);
    return toA(check(res) as Row);
  },
  async updateAssessment(id, input) {
    const res = await db().from("course_assessments").update(input).eq("id", id);
    if (missing(res.error)) throw new Error(NEED33);
    check(res);
  },
  async deleteAssessment(id) {
    const res = await db().from("course_assessments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (missing(res.error)) throw new Error(NEED33);
    check(res);
  },
};
