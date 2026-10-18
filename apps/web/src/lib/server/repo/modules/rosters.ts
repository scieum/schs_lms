import "server-only";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";

// 이동반 분반 명단: 교사·과목·분반마다 학생 목록 (명단 양식으로 채움).
// 표는 0013_course_rosters.sql + 0016(section 열). 적용 전 DB면 읽기는 빈 목록, 저장은 안내 문구로 실패한다.

export interface CourseRoster { teacherId: string; courseId: string; section: string; studentIds: string[]; updatedAt: string }

export interface RostersRepo {
  listCourseRosters(teacherId: string): Promise<CourseRoster[]>;
  /** 한 과목의 분반 명단 전부 */
  getCourseRosters(teacherId: string, courseId: string): Promise<CourseRoster[]>;
  /** 빈 목록이면 그 분반 명단을 지운다 */
  setCourseRoster(teacherId: string, courseId: string, section: string, studentIds: string[]): Promise<void>;
}

const g = globalThis as unknown as { __schsrosters?: CourseRoster[] };
// 데모: 이서연 선생님 물리학(이동반) — 1분반 = 2학년 1·2반 학생, 2분반 = 2학년 3반 학생
const rs = () => {
  const st = store();
  if (!g.__schsrosters) {
    const ids = (cls: number[]) => [...st.students.values()].filter((x) => x.grade === 2 && cls.includes(x.classNo)).map((x) => x.id);
    const at = new Date().toISOString();
    g.__schsrosters = [
      { teacherId: "t-subject", courseId: "c-4", section: "1분반", studentIds: ids([1, 2]), updatedAt: at },
      { teacherId: "t-subject", courseId: "c-4", section: "2분반", studentIds: ids([3]), updatedAt: at },
    ];
  }
  return g.__schsrosters;
};

export const demoRosters: RostersRepo = {
  async listCourseRosters(teacherId) {
    return rs().filter((r) => r.teacherId === teacherId).map((r) => ({ ...r, studentIds: [...r.studentIds] }));
  },
  async getCourseRosters(teacherId, courseId) {
    return rs().filter((x) => x.teacherId === teacherId && x.courseId === courseId).map((r) => ({ ...r, studentIds: [...r.studentIds] }));
  },
  async setCourseRoster(teacherId, courseId, section, studentIds) {
    g.__schsrosters = rs().filter((x) => !(x.teacherId === teacherId && x.courseId === courseId && x.section === section));
    if (studentIds.length) g.__schsrosters.push({ teacherId, courseId, section, studentIds: [...studentIds], updatedAt: new Date().toISOString() });
  },
};

type Row = { teacher_id: string; course_id: string; section?: string | null; student_ids: string[]; updated_at: string };
const toRoster = (r: Row): CourseRoster => ({ teacherId: r.teacher_id, courseId: r.course_id, section: r.section ?? "", studentIds: r.student_ids ?? [], updatedAt: r.updated_at });
const NEED16 = "분반 명단을 저장하려면 DB 업데이트(0013·0016)가 필요해요. 관리자에게 알려 주세요";
const missingTable = (e: { message: string } | null) => !!e && /course_rosters/.test(e.message);

export const supabaseRosters: RostersRepo = {
  async listCourseRosters(teacherId) {
    if (!isUuid(teacherId)) return [];
    const res = await db().from("course_rosters").select("*").eq("teacher_id", teacherId);
    if (missingTable(res.error)) return [];
    return (check(res) as Row[]).map(toRoster);
  },
  async getCourseRosters(teacherId, courseId) {
    if (!isUuid(teacherId) || !isUuid(courseId)) return [];
    const res = await db().from("course_rosters").select("*").eq("teacher_id", teacherId).eq("course_id", courseId);
    if (missingTable(res.error)) return [];
    return (check(res) as Row[]).map(toRoster);
  },
  async setCourseRoster(teacherId, courseId, section, studentIds) {
    const res = studentIds.length
      ? await db().from("course_rosters").upsert(
          { teacher_id: teacherId, course_id: courseId, section, student_ids: studentIds.filter(isUuid), updated_at: new Date().toISOString() },
          { onConflict: "teacher_id,course_id,section" },
        )
      : await db().from("course_rosters").delete().eq("teacher_id", teacherId).eq("course_id", courseId).eq("section", section);
    if (missingTable(res.error) || (res.error && /section|constraint/.test(res.error.message))) throw new Error(NEED16);
    check(res);
  },
};
