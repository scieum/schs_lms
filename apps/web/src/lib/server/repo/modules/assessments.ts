import "server-only";
import { assessScope, type Assessment } from "@/lib/domain/assessment";
import { withActivity } from "@/lib/domain/activity-name";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";
import { demoWriting } from "./writing";

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
// 데모: 이서연 선생님 화학(3반) "반응 속도 실험 보고서" — 앞 번호 두 명은 자료 요약이 이미 들어가 있다
const mem = () => {
  if (!g.__schsassess) {
    const a: Assessment = { id: "as-demo-1", courseId: "c-5", section: null, teacherId: "t-subject", title: "반응 속도 실험 보고서", date: "2026-10-14", description: "농도 · 온도에 따른 반응 속도 비교 실험 — 가설 · 변인 통제 · 오차 분석을 평가", createdAt: new Date().toISOString() };
    g.__schsassess = [a];
    const kids = [...store().students.values()].filter((x) => x.grade === 2 && x.classNo === 3).sort((x, y) => x.number - y.number).slice(0, 2);
    const notes = [
      "농도를 세 단계로 바꾸며 기체 발생 시간을 재고, 온도는 수조로 고정해 변인을 통제함. 그래프 기울기로 농도와 반응 속도의 비례 관계를 설명하고, 초시계 반응 시간을 오차 원인으로 짚어 센서 측정을 대안으로 제안함.",
      "온도를 바꾼 조에서 10℃ 오를 때 반응 시간이 절반 가까이 줄어든 결과를 활성화 에너지와 충돌 횟수로 해석함. 반복 측정 평균을 내고 편차가 큰 회차를 따로 표시해 신뢰도를 따짐.",
    ];
    kids.forEach((k, i) => void demoWriting.addRecordMemo({ scope: assessScope(a.courseId, a.id), studentId: k.id, authorId: "t-subject", content: withActivity(a.title, notes[i]) }));
  }
  return g.__schsassess;
};

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
