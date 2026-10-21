import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Course, SubjectGroup, TeacherCourse } from "@/lib/domain/curriculum";
import type { ActivityLog, Club, ServiceRecord } from "@/lib/domain/activity";
import type { SetukRecord } from "@/lib/domain/setuk";
import type { Account, Student, Teacher } from "@/lib/domain/types";
import { env } from "../env";
import { externalNo } from "@/lib/domain/joint-curriculum";
import type { NewServiceRecord, NewStudent, Repo } from "./types";
import { insertWithProv, provFrom, type ProvRow } from "./modules/provenance";

// Supabase 저장소. service role 키로 서버에서만 접근한다.
// 모든 테이블은 RLS가 켜져 있고 정책이 없어서, 브라우저(anon) 접근은 전부 막힌다.

let client: SupabaseClient | null = null;
export function db() {
  client ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
  return client;
}

type AccountRow = { id: string; kind: Account["kind"]; login_id: string; password_hash: string; must_change_password: boolean; failed_count: number; locked_until: string | null };
type StudentRow = { id: string; pseudonym_id: string; student_no: string; grade: number; class_no: number; number: number; name: string; gender: Student["gender"]; track: number; career_goal: string | null; school?: string | null };
type TeacherRow = { id: string; name: string; roles: Teacher["roles"]; homeroom_grade: number | null; homeroom_class: number | null; dept: string | null };

const toAccount = (r: AccountRow): Account => ({ id: r.id, kind: r.kind, loginId: r.login_id, passwordHash: r.password_hash, mustChangePassword: r.must_change_password, failedCount: r.failed_count, lockedUntil: r.locked_until });
// 다른 학교 학생(N54)은 DB 학번 칸이 "joint:<id>" 라 화면에는 "학교 학년반번호"로 바꿔 보낸다
const toStudent = (r: StudentRow): Student => ({
  id: r.id, pseudonymId: r.pseudonym_id, studentNo: r.school ? externalNo({ school: r.school, grade: r.grade, classNo: r.class_no, number: r.number }) : r.student_no,
  grade: r.grade, classNo: r.class_no, number: r.number, name: r.name, gender: r.gender, track: r.track, careerGoal: r.career_goal, ...(r.school ? { school: r.school } : {}),
});
const toTeacher = (r: TeacherRow): Teacher => ({ id: r.id, name: r.name, roles: r.roles, homeroom: r.homeroom_grade && r.homeroom_class ? { grade: r.homeroom_grade, classNo: r.homeroom_class } : null, dept: r.dept });

// 다른 환경(데모)에서 만든 세션 쿠키처럼 UUID가 아닌 id는 조회하지 않고 "없음"으로 본다
export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

type CourseRow = { id: string; year: number; grade: number; semester: 1 | 2; subject: string; subject_group: SubjectGroup; course_type: Course["type"]; credits: number; joint?: Course["joint"]; owner_id?: string | null };
type TeacherCourseRow = { teacher_id: string; course_id: string; classes: number[]; mode?: string | null; sections?: string[] | null };
type SetukRow = { id: string; course_id: string; student_id: string; author_id: string; content: string; unit: SetukRecord["unit"]; max_len: number; status: SetukRecord["status"]; created_at: string } & ProvRow;

const toCourse = (r: CourseRow): Course => ({ id: r.id, year: r.year, grade: r.grade, semester: r.semester, subject: r.subject, group: r.subject_group, type: r.course_type, credits: r.credits, ...(r.joint ? { joint: r.joint, ownerId: r.owner_id ?? null } : {}) });
const toTeacherCourse = (r: TeacherCourseRow): TeacherCourse => ({
  teacherId: r.teacher_id, courseId: r.course_id, classes: r.classes ?? [],
  mode: r.mode === "moving" ? "moving" : "fixed", sections: r.sections ?? [],
});
const toSetuk = (r: SetukRow): SetukRecord => ({ id: r.id, courseId: r.course_id, studentId: r.student_id, authorId: r.author_id, content: r.content, unit: r.unit, max: r.max_len, status: r.status, createdAt: r.created_at, ...provFrom(r) });

type ClubRow = { id: string; year: number; name: string; advisor_id: string };
type LogRow = { id: string; area: ActivityLog["area"]; student_id: string; author_id: string; club_id: string | null; date: string; content: string; created_at: string; common_activity_id?: string | null; lesson_item_id?: string | null };
type ServiceRow = {
  id: string; student_id: string; uploader_id: string; date: string; end_date?: string | null; hours: number | string; organization: string; activity: string;
  file_path: string | null; file_name: string; mime: string; status: ServiceRecord["status"]; confirmed_by: string | null; confirmed_at: string | null; created_at: string;
  purged_at?: string | null;
};
const toClub = (r: ClubRow): Club => ({ id: r.id, year: r.year, name: r.name, advisorId: r.advisor_id });
const toLog = (r: LogRow): ActivityLog => ({ id: r.id, area: r.area, studentId: r.student_id, authorId: r.author_id, clubId: r.club_id, date: r.date, content: r.content, createdAt: r.created_at, commonActivityId: r.common_activity_id ?? null, lessonItemId: r.lesson_item_id ?? null });
const toService = (r: ServiceRow): ServiceRecord => ({
  id: r.id, studentId: r.student_id, uploaderId: r.uploader_id, date: r.date, endDate: r.end_date ?? r.date, hours: Number(r.hours), organization: r.organization, activity: r.activity,
  filePath: r.file_path ?? "", fileName: r.file_name, mime: r.mime, status: r.status, confirmedBy: r.confirmed_by, confirmedAt: r.confirmed_at, createdAt: r.created_at,
  purgedAt: r.purged_at ?? null,
});
const BUCKET = "service-docs";

export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const IN_CHUNK = 150;
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * id 가 많은 .in() 조회: 학년 전체(400명)처럼 많으면 요청 주소가 너무 길어져 실패한다 (2026-10-17 실제 DB에서 발생)
 * → 150개씩 나눠 동시에 묻고 합친다. 나눠 물었으면 sort 로 원래 순서를 다시 맞춘다
 */
export async function selectIn<R>(ids: string[], run: (part: string[]) => Res, sort?: (a: R, b: R) => number): Promise<R[]> {
  if (ids.length <= IN_CHUNK) return (check(await run(ids)) as R[]) ?? [];
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) parts.push(ids.slice(i, i + IN_CHUNK));
  const out = (await Promise.all(parts.map(async (p) => (check(await run(p)) as R[]) ?? []))).flat();
  return sort ? out.sort(sort) : out;
}


export const supabaseRepo: Repo = {
  async findAccountByLogin(kind, loginId) {
    const r = check(await db().from("accounts").select("*").eq("kind", kind).eq("login_id", loginId).maybeSingle());
    return r ? toAccount(r as AccountRow) : null;
  },
  async getAccount(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("accounts").select("*").eq("id", id).maybeSingle());
    return r ? toAccount(r as AccountRow) : null;
  },
  async updateAccount(id, p) {
    const row: Partial<AccountRow> = {};
    if (p.passwordHash !== undefined) row.password_hash = p.passwordHash;
    if (p.mustChangePassword !== undefined) row.must_change_password = p.mustChangePassword;
    if (p.failedCount !== undefined) row.failed_count = p.failedCount;
    if (p.lockedUntil !== undefined) row.locked_until = p.lockedUntil;
    check(await db().from("accounts").update(row).eq("id", id));
  },
  async getTeacher(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("teachers").select("*").eq("id", id).maybeSingle());
    return r ? toTeacher(r as TeacherRow) : null;
  },
  async getStudent(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("students").select("*").eq("id", id).maybeSingle());
    return r ? toStudent(r as StudentRow) : null;
  },
  async listStudents(opts) {
    let res = opts?.external
      ? await db().from("students").select("*").order("student_no")
      : await db().from("students").select("*").is("school", null).order("student_no");
    // 0028 전 DB: school 칸이 없으면 모두 본교 학생
    if (res.error && /school/.test(res.error.message)) res = await db().from("students").select("*").order("student_no");
    return (check(res) as StudentRow[]).map(toStudent).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  },
  async createExternalStudents(rows) {
    if (!rows.length) return [];
    const ids = rows.map(() => crypto.randomUUID());
    // 로그인 못 하는 계정: 비밀번호 칸은 bcrypt 해시가 아니고 잠금 기한이 끝없다
    check(await db().from("accounts").insert(ids.map((id) => ({ id, kind: "student", login_id: `joint:${id}`, password_hash: "!", must_change_password: false, locked_until: "9999-12-31T00:00:00Z" }))));
    const res = await db().from("students").insert(rows.map((r, i) => ({
      id: ids[i], pseudonym_id: r.pseudonymId, student_no: `joint:${ids[i]}`, grade: r.grade, class_no: r.classNo, number: r.number, name: r.name.trim(), school: r.school.trim(),
    }))).select("*");
    if (res.error && /school/.test(res.error.message)) throw new Error("다른 학교 학생을 넣으려면 DB 업데이트(0028)가 필요해요. 관리자에게 알려 주세요");
    return (check(res) as StudentRow[]).map(toStudent);
  },
  async updateExternalStudent(id, r) {
    if (!isUuid(id)) return;
    check(await db().from("students").update({ grade: r.grade, class_no: r.classNo, number: r.number, name: r.name.trim(), school: r.school.trim() }).eq("id", id).not("school", "is", null));
  },
  async existingStudentNos() {
    const r = check(await db().from("students").select("student_no"));
    return new Set((r as { student_no: string }[]).map((x) => x.student_no));
  },
  async existingPseudonymIds() {
    const r = check(await db().from("students").select("pseudonym_id"));
    return (r as { pseudonym_id: string }[]).map((x) => x.pseudonym_id);
  },
  async createStudents(rows: NewStudent[]) {
    // 계정과 학생 정보를 한 트랜잭션으로 만든다 (DB 함수 register_students)
    const payload = rows.map((r) => ({
      pseudonym_id: r.pseudonymId, student_no: r.studentNo, grade: r.grade, class_no: r.classNo,
      number: r.number, name: r.name, gender: r.gender, track: r.track, password_hash: r.passwordHash,
    }));
    const r = check(await db().rpc("register_students", { rows: payload }));
    return (r as StudentRow[]).map(toStudent);
  },
  async listTeachers() {
    const r = check(await db().from("teachers").select("*").order("name"));
    return (r as TeacherRow[]).map(toTeacher);
  },
  async listCourses(year, opts) {
    const r = check(await db().from("school_courses").select("*").eq("year", year).eq("active", true).order("grade").order("semester").order("subject"));
    return (r as CourseRow[]).map(toCourse).filter((c) => opts?.joint || !c.joint);
  },
  async getCourse(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("school_courses").select("*").eq("id", id).eq("active", true).maybeSingle());
    return r ? toCourse(r as CourseRow) : null;
  },
  async createCourse(c) {
    const res = await db().from("school_courses").insert({
      year: c.year, grade: c.grade, semester: c.semester, subject: c.subject, subject_group: c.group, course_type: c.type, credits: c.credits,
      ...(c.joint ? { joint: c.joint, owner_id: c.ownerId } : {}),
    }).select("*").single();
    if (res.error && /joint|owner_id/.test(res.error.message)) throw new Error("공동교육과정 수업을 만들려면 DB 업데이트(0028)가 필요해요. 관리자에게 알려 주세요");
    if (res.error?.code === "23505") throw new Error("이미 같은 학기에 있는 과목이에요");
    return toCourse(check(res) as CourseRow);
  },
  async archiveCourse(id) {
    if (!isUuid(id)) return;
    check(await db().from("school_courses").update({ active: false }).eq("id", id));
  },
  async updateCourse(id, patch) {
    if (!isUuid(id)) return;
    const res = await db().from("school_courses").update({ subject: patch.subject, grade: patch.grade, semester: patch.semester, joint: patch.joint }).eq("id", id).eq("active", true);
    if (res.error?.code === "23505") throw new Error("같은 학기에 같은 이름의 공동교육과정 수업이 있어요");
    check(res);
  },
  async getTeacherGroups(teacherId) {
    if (!isUuid(teacherId)) return [];
    const r = check(await db().from("teacher_groups").select("groups").eq("teacher_id", teacherId).maybeSingle());
    return ((r as { groups: SubjectGroup[] } | null)?.groups ?? []);
  },
  async setTeacherGroups(teacherId, groups) {
    check(await db().from("teacher_groups").upsert({ teacher_id: teacherId, groups }));
  },
  async listTeacherCourses(teacherId) {
    if (!isUuid(teacherId)) return [];
    const r = check(await db().from("teacher_courses").select("*").eq("teacher_id", teacherId));
    return (r as TeacherCourseRow[]).map(toTeacherCourse);
  },
  async listAllTeacherCourses() {
    const r = check(await db().from("teacher_courses").select("*"));
    return (r as TeacherCourseRow[]).map(toTeacherCourse);
  },
  async setTeacherCourses(teacherId, rows) {
    // 지우고 다시 넣는다 (배정은 기록이 아니라 설정이라 C4 대상 아님). 실패하면 그대로 오류
    check(await db().from("teacher_courses").delete().eq("teacher_id", teacherId));
    if (!rows.length) return;
    const full = rows.map((r) => ({ teacher_id: teacherId, course_id: r.courseId, classes: r.classes, mode: r.mode ?? "fixed", sections: r.sections ?? [] }));
    const res = await db().from("teacher_courses").insert(full);
    // 0016(mode·sections) 적용 전 DB: 고정반만 저장할 수 있다
    if (res.error && /mode|sections/.test(res.error.message)) {
      if (rows.some((r) => r.mode === "moving")) throw new Error("이동반을 저장하려면 DB 업데이트(0016)가 필요해요. 관리자에게 알려 주세요");
      check(await db().from("teacher_courses").insert(rows.map((r) => ({ teacher_id: teacherId, course_id: r.courseId, classes: r.classes }))));
      return;
    }
    check(res);
  },
  async listSetuk(courseId) {
    if (!isUuid(courseId)) return [];
    const r = check(await db().from("setuk_records").select("*").eq("course_id", courseId).order("created_at"));
    return (r as SetukRow[]).map(toSetuk);
  },
  async listSetukForStudent(studentId, courseIds) {
    const ids = courseIds.filter(isUuid);
    if (!isUuid(studentId) || !ids.length) return [];
    const rows = await selectIn(ids, (part) => db().from("setuk_records").select("*").eq("student_id", studentId).in("course_id", part).order("created_at"));
    return (rows as SetukRow[]).map(toSetuk);
  },
  async addSetuk(x) {
    const r = await insertWithProv<SetukRow>("setuk_records", {
      course_id: x.courseId, student_id: x.studentId, author_id: x.authorId, content: x.content, unit: x.unit, max_len: x.max, status: x.status,
    }, x);
    return toSetuk(r);
  },
  async listClubs(year) {
    const r = check(await db().from("clubs").select("*").eq("year", year).eq("active", true).order("name"));
    return (r as ClubRow[]).map(toClub);
  },
  async getClub(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("clubs").select("*").eq("id", id).eq("active", true).maybeSingle());
    return r ? toClub(r as ClubRow) : null;
  },
  async createClub(c) {
    const res = await db().from("clubs").insert({ year: c.year, name: c.name, advisor_id: c.advisorId }).select("*").single();
    if (res.error?.code === "23505") throw new Error("이미 같은 이름의 동아리가 있어요");
    return toClub(check(res) as ClubRow);
  },
  async listClubMembers(clubId) {
    if (!isUuid(clubId)) return [];
    const r = check(await db().from("club_members").select("student_id").eq("club_id", clubId));
    return (r as { student_id: string }[]).map((x) => x.student_id);
  },
  async setClubMembers(clubId, ids) {
    check(await db().from("club_members").delete().eq("club_id", clubId));
    const uniq = [...new Set(ids)];
    if (uniq.length) check(await db().from("club_members").insert(uniq.map((student_id) => ({ club_id: clubId, student_id }))));
  },
  async listActivityLogs(area, studentIds) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const r = await selectIn<LogRow>(ids, (part) => db().from("activity_logs").select("*").eq("area", area).in("student_id", part).order("date", { ascending: false }).order("created_at", { ascending: false }),
      (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    return r.map(toLog);
  },
  async addActivityLogs(rows) {
    if (!rows.length) return 0;
    check(await db().from("activity_logs").insert(rows.map((x) => ({ area: x.area, student_id: x.studentId, author_id: x.authorId, club_id: x.clubId, date: x.date, content: x.content, ...(x.commonActivityId ? { common_activity_id: x.commonActivityId } : {}) }))));
    return rows.length;
  },
  async addServiceRecord(x: NewServiceRecord, file) {
    const filePath = `${x.studentId}/${crypto.randomUUID()}`;
    const up = await db().storage.from(BUCKET).upload(filePath, file, { contentType: x.mime, upsert: false });
    if (up.error) throw new Error(up.error.message);
    const row = {
      student_id: x.studentId, uploader_id: x.uploaderId, date: x.date, end_date: x.endDate, hours: x.hours, organization: x.organization, activity: x.activity,
      file_path: filePath, file_name: x.fileName, mime: x.mime,
    };
    let res = await db().from("service_records").insert(row).select("*").single();
    // 0012(end_date) 적용 전 DB: 당일 봉사는 그 열 없이 저장한다
    if (res.error && /end_date/.test(res.error.message) && x.endDate === x.date) {
      const { end_date: _skip, ...rest } = row;
      void _skip;
      res = await db().from("service_records").insert(rest).select("*").single();
    }
    if (res.error) {
      await db().storage.from(BUCKET).remove([filePath]);
      if (/end_date/.test(res.error.message)) throw new Error("기간 봉사를 저장하려면 DB 업데이트(0012)가 필요해요. 관리자에게 알려 주세요");
      if (/hours/.test(res.error.message)) throw new Error("24시간이 넘는 기간 봉사를 저장하려면 DB 업데이트(0012)가 필요해요");
    }
    return toService(check(res) as ServiceRow);
  },
  async listServiceRecords({ studentIds, uploaderId }) {
    const base = () => {
      let q = db().from("service_records").select("*").order("created_at", { ascending: false });
      if (uploaderId) q = q.eq("uploader_id", uploaderId);
      return q;
    };
    if (studentIds) {
      const ids = studentIds.filter(isUuid);
      if (!ids.length) return [];
      return (await selectIn<ServiceRow>(ids, (part) => base().in("student_id", part), (a, b) => b.created_at.localeCompare(a.created_at))).map(toService);
    }
    return (check(await base()) as ServiceRow[]).map(toService);
  },
  async getServiceRecord(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("service_records").select("*").eq("id", id).maybeSingle());
    return r ? toService(r as ServiceRow) : null;
  },
  async getServiceFile(r) {
    if (!r.filePath || r.purgedAt) return null;
    const res = await db().storage.from(BUCKET).download(r.filePath);
    if (res.error || !res.data) return null;
    return new Uint8Array(await res.data.arrayBuffer());
  },
  async confirmService(id, by) {
    if (!isUuid(id)) return;
    check(await db().from("service_records").update({ status: "confirmed", confirmed_by: by, confirmed_at: new Date().toISOString() }).eq("id", id).eq("status", "sent"));
  },
  async updateServiceActivity(id, activity) {
    if (!isUuid(id)) return false;
    const res = await db().from("service_records").update({ activity }).eq("id", id).eq("status", "sent").select("id");
    return !!check(res)?.length;
  },
  async purgeServiceFiles(ids) {
    const list = ids.filter(isUuid);
    let n = 0;
    for (let i = 0; i < list.length; i += 100) {
      const part = list.slice(i, i + 100);
      const rows = check(await db().from("service_records").select("id, file_path").in("id", part).is("purged_at", null)) as { id: string; file_path: string | null }[];
      const paths = rows.map((r) => r.file_path).filter((x): x is string => !!x);
      if (paths.length) {
        const rm = await db().storage.from(BUCKET).remove(paths);
        if (rm.error) throw new Error(`봉사 확인서 파일을 지우지 못했어요 (${rm.error.message})`);
      }
      if (rows.length) check(await db().from("service_records").update({ file_path: null, purged_at: new Date().toISOString() }).in("id", rows.map((r) => r.id)));
      n += paths.length;
    }
    return n;
  },
  async audit(actorId, action, target) {
    check(await db().from("audit_logs").insert({ actor_id: actorId, action, target }));
  },
  async listAudit(limit) {
    const r = check(await db().from("audit_logs").select("*").order("at", { ascending: false }).limit(limit));
    return (r as { id: string; actor_id: string | null; action: string; target: string | null; at: string }[]).map((x) => ({ id: x.id, actorId: x.actor_id, action: x.action, target: x.target, at: x.at }));
  },
};
