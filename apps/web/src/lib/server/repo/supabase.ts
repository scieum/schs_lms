import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Account, Student, Teacher } from "@/lib/domain/types";
import { env } from "../env";
import type { NewStudent, Repo } from "./types";

// Supabase 저장소. service role 키로 서버에서만 접근한다.
// 모든 테이블은 RLS가 켜져 있고 정책이 없어서, 브라우저(anon) 접근은 전부 막힌다.

let client: SupabaseClient | null = null;
function db() {
  client ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
  return client;
}

type AccountRow = { id: string; kind: Account["kind"]; login_id: string; password_hash: string; must_change_password: boolean; failed_count: number; locked_until: string | null };
type StudentRow = { id: string; pseudonym_id: string; student_no: string; grade: number; class_no: number; number: number; name: string; birth_date: string; career_goal: string | null };
type TeacherRow = { id: string; name: string; roles: Teacher["roles"]; homeroom_grade: number | null; homeroom_class: number | null; dept: string | null };

const toAccount = (r: AccountRow): Account => ({ id: r.id, kind: r.kind, loginId: r.login_id, passwordHash: r.password_hash, mustChangePassword: r.must_change_password, failedCount: r.failed_count, lockedUntil: r.locked_until });
const toStudent = (r: StudentRow): Student => ({ id: r.id, pseudonymId: r.pseudonym_id, studentNo: r.student_no, grade: r.grade, classNo: r.class_no, number: r.number, name: r.name, birthDate: r.birth_date, careerGoal: r.career_goal });
const toTeacher = (r: TeacherRow): Teacher => ({ id: r.id, name: r.name, roles: r.roles, homeroom: r.homeroom_grade && r.homeroom_class ? { grade: r.homeroom_grade, classNo: r.homeroom_class } : null, dept: r.dept });

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const supabaseRepo: Repo = {
  async findAccountByLogin(kind, loginId) {
    const r = check(await db().from("accounts").select("*").eq("kind", kind).eq("login_id", loginId).maybeSingle());
    return r ? toAccount(r as AccountRow) : null;
  },
  async getAccount(id) {
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
    const r = check(await db().from("teachers").select("*").eq("id", id).maybeSingle());
    return r ? toTeacher(r as TeacherRow) : null;
  },
  async getStudent(id) {
    const r = check(await db().from("students").select("*").eq("id", id).maybeSingle());
    return r ? toStudent(r as StudentRow) : null;
  },
  async listStudents() {
    const r = check(await db().from("students").select("*").order("student_no"));
    return (r as StudentRow[]).map(toStudent);
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
      number: r.number, name: r.name, birth_date: r.birthDate, password_hash: r.passwordHash,
    }));
    const r = check(await db().rpc("register_students", { rows: payload }));
    return (r as StudentRow[]).map(toStudent);
  },
  async audit(actorId, action, target) {
    check(await db().from("audit_logs").insert({ actor_id: actorId, action, target }));
  },
  async listAudit(limit) {
    const r = check(await db().from("audit_logs").select("*").order("at", { ascending: false }).limit(limit));
    return (r as { id: string; actor_id: string | null; action: string; target: string | null; at: string }[]).map((x) => ({ id: x.id, actorId: x.actor_id, action: x.action, target: x.target, at: x.at }));
  },
};
