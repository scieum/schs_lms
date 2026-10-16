import "server-only";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";

// 이동반 명단: 교사·과목마다 학생 목록. 비어 있으면 예전처럼 "반" 기준으로 학생을 정한다.
// 표는 0013_course_rosters.sql. 적용 전 DB면 읽기는 빈 목록, 저장은 안내 문구로 실패한다.

export interface CourseRoster { teacherId: string; courseId: string; studentIds: string[]; updatedAt: string }

export interface RostersRepo {
  listCourseRosters(teacherId: string): Promise<CourseRoster[]>;
  getCourseRoster(teacherId: string, courseId: string): Promise<CourseRoster | null>;
  /** 빈 목록이면 지운다 (반 기준으로 돌아감) */
  setCourseRoster(teacherId: string, courseId: string, studentIds: string[]): Promise<void>;
}

const g = globalThis as unknown as { __schsrosters?: CourseRoster[] };
const rs = () => {
  store();
  return (g.__schsrosters ??= []);
};

export const demoRosters: RostersRepo = {
  async listCourseRosters(teacherId) {
    return rs().filter((r) => r.teacherId === teacherId).map((r) => ({ ...r, studentIds: [...r.studentIds] }));
  },
  async getCourseRoster(teacherId, courseId) {
    const r = rs().find((x) => x.teacherId === teacherId && x.courseId === courseId);
    return r ? { ...r, studentIds: [...r.studentIds] } : null;
  },
  async setCourseRoster(teacherId, courseId, studentIds) {
    g.__schsrosters = rs().filter((x) => !(x.teacherId === teacherId && x.courseId === courseId));
    if (studentIds.length) g.__schsrosters.push({ teacherId, courseId, studentIds: [...studentIds], updatedAt: new Date().toISOString() });
  },
};

type Row = { teacher_id: string; course_id: string; student_ids: string[]; updated_at: string };
const toRoster = (r: Row): CourseRoster => ({ teacherId: r.teacher_id, courseId: r.course_id, studentIds: r.student_ids ?? [], updatedAt: r.updated_at });
const missingTable = (e: { message: string } | null) => !!e && /course_rosters/.test(e.message);

export const supabaseRosters: RostersRepo = {
  async listCourseRosters(teacherId) {
    if (!isUuid(teacherId)) return [];
    const res = await db().from("course_rosters").select("*").eq("teacher_id", teacherId);
    if (missingTable(res.error)) return [];
    return (check(res) as Row[]).map(toRoster);
  },
  async getCourseRoster(teacherId, courseId) {
    if (!isUuid(teacherId) || !isUuid(courseId)) return null;
    const res = await db().from("course_rosters").select("*").eq("teacher_id", teacherId).eq("course_id", courseId).maybeSingle();
    if (missingTable(res.error)) return null;
    const r = check(res);
    return r ? toRoster(r as Row) : null;
  },
  async setCourseRoster(teacherId, courseId, studentIds) {
    const res = studentIds.length
      ? await db().from("course_rosters").upsert({ teacher_id: teacherId, course_id: courseId, student_ids: studentIds.filter(isUuid), updated_at: new Date().toISOString() })
      : await db().from("course_rosters").delete().eq("teacher_id", teacherId).eq("course_id", courseId);
    if (missingTable(res.error)) throw new Error("이동반 명단을 저장하려면 DB 업데이트(0013)가 필요해요. 관리자에게 알려 주세요");
    check(res);
  },
};
