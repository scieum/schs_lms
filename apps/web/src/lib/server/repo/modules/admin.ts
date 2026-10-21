import "server-only";
import { signupRoles } from "@/lib/domain/accounts";
import { schoolYear } from "@/lib/domain/curriculum";
import { seats, type Offering, type OfferingRound } from "@/lib/domain/offering";
import type { Account, AuditEntry, Teacher, TeacherRole } from "@/lib/domain/types";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";

// 교사 가입·계정 관리·감사 로그 조회·과목 신청(개설·신청).
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.

/** 계정 관리 화면 한 줄 */
export interface AccountSummary {
  id: string;
  kind: Account["kind"];
  name: string;
  loginId: string;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  teacher: Teacher | null;
  student: { pseudonymId: string; grade: number; classNo: number; number: number } | null;
}

export interface NewTeacher {
  name: string;
  passwordHash: string;
  roles: TeacherRole[];
  dept: string | null;
  homeroom: { grade: number; classNo: number } | null;
}

export type NewOffering = Omit<Offering, "id" | "sections">;

export interface AdminRepo {
  /** 교사 수 (가입 화면의 "첫 가입자" 표시용) */
  adminCountTeachers(): Promise<number>;
  /** 교사 가입: 교사가 0명이면 관리자로. 이름이 겹치면 "duplicate_name" 오류 */
  adminRegisterTeacher(name: string, passwordHash: string): Promise<{ id: string; roles: TeacherRole[] }>;
  /** 관리자가 교사 한 명 추가 (첫 로그인 때 비밀번호 변경). 이름이 겹치면 "duplicate_name" 오류 */
  adminCreateTeacher(t: NewTeacher): Promise<string>;
  adminUpdateTeacher(id: string, patch: { roles: TeacherRole[]; homeroom: Teacher["homeroom"]; dept: string | null }): Promise<void>;
  adminListAccounts(): Promise<AccountSummary[]>;
  /** 로그인 성공 시각 기록 */
  adminTouchLogin(id: string): Promise<void>;
  /** 이 시각 이후 감사 로그 (최신 순, 최대 limit) */
  adminListAuditSince(sinceIso: string, limit: number): Promise<AuditEntry[]>;

  offeringRound(year: number, grade: number): Promise<OfferingRound | null>;
  offeringGetRound(id: string): Promise<OfferingRound | null>;
  /** 같은 학년도·학기·학년이 이미 있으면 실패 */
  offeringCreateRound(r: Omit<OfferingRound, "id">): Promise<OfferingRound>;
  offeringUpdateRound(id: string, patch: { deadline: string; maxCredits: number }): Promise<void>;
  offeringList(roundId: string): Promise<Offering[]>;
  /** 같은 묶음에 같은 과목이 있으면 실패 */
  offeringCreate(o: NewOffering): Promise<Offering>;
  offeringArchive(id: string): Promise<void>;
  /** 과목마다 반을 하나 더 연다 */
  offeringAddSections(ids: string[]): Promise<void>;
  /** 과목별 신청 수 */
  offeringCounts(roundId: string): Promise<Record<string, number>>;
  /** 신청한 학생 수 */
  offeringApplicants(roundId: string): Promise<number>;
  offeringChoicesOf(roundId: string, studentId: string): Promise<string[]>;
  /** 신청을 통째로 바꾼다. 새로 담은 과목에 자리가 없으면 "full:<과목>" 오류 */
  offeringApply(roundId: string, studentId: string, offeringIds: string[]): Promise<void>;
}

// ── 데모 ──────────────────────────────────────────────

interface AdminStore {
  lastLogin: Map<string, string>;
  rounds: OfferingRound[];
  offerings: (Offering & { active: boolean })[];
  choices: { roundId: string; studentId: string; offeringId: string }[];
  /** 데모 명단 밖 학생들의 신청 수 (예시) */
  extra: Record<string, number>;
}

const g = globalThis as unknown as { __schsadmin?: AdminStore };

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3600000;
const D = 24 * H;

function seedAdmin(): AdminStore {
  const now = new Date();
  // 최근 접속 예시 (한지민·최지우는 90일 넘게 접속 없음)
  const lastLogin = new Map<string, string>([
    ["t-admin", ago(60000)], ["t-subject", ago(3 * H)], ["t-homeroom", ago(4 * H)],
    ["s-2", ago(D)], ["s-3", ago(2 * D)], ["s-4", ago(92 * D)], ["s-5", ago(120 * D)],
    ["s-6", ago(5 * H)], ["s-7", ago(3 * D)], ["s-8", ago(6 * D)],
  ]);

  const y = schoolYear(now);
  let deadline = `${y}-10-30`;
  if (new Date(`${deadline}T15:00:00Z`).getTime() < now.getTime()) deadline = new Date(now.getTime() + 14 * D).toISOString().slice(0, 10);
  const round: OfferingRound = { id: "round-2-2", year: y, semester: 2, grade: 2, deadline, maxCredits: 16 };

  const O: [string, string, string, number, number, number][] = [
    // id, 과목, 분야, 학점, 한 반 정원, 목표 신청 수(Figma 예시)
    ["of-1", "미적분Ⅱ", "수학", 4, 30, 34],
    ["of-2", "생명과학Ⅱ", "과학", 4, 30, 31],
    ["of-3", "미술 창작", "예술", 2, 25, 17],
    ["of-4", "정보", "기술", 2, 25, 20],
    ["of-5", "생활과 윤리", "사회", 2, 30, 10],
    ["of-6", "기하", "수학", 4, 30, 29],
    ["of-7", "물리학Ⅱ", "과학", 4, 30, 18],
  ];
  const offerings = O.map(([id, subject, field, credits, capacity]) => ({ id, roundId: round.id, subject, field, credits, capacity, sections: 1, courseId: null, active: true }));
  // 데모 2학년 학생 몇 명의 신청 (김민준 s-1은 아직 신청 전)
  const picks: [string, string[]][] = [
    ["s-2", ["of-2", "of-7", "of-5"]], ["s-3", ["of-1", "of-7", "of-4"]], ["s-4", ["of-3", "of-5", "of-4"]],
    ["s-5", ["of-1", "of-6"]], ["s-6", ["of-2", "of-3"]], ["s-7", ["of-1", "of-2"]], ["s-8", ["of-6", "of-7"]],
    ["s-9", ["of-3", "of-5"]], ["s-10", ["of-1", "of-6", "of-4"]], ["s-11", ["of-7", "of-4"]],
  ];
  const choices = picks.flatMap(([studentId, ids]) => ids.map((offeringId) => ({ roundId: round.id, studentId, offeringId })));
  const extra: Record<string, number> = {};
  for (const [id, , , , , target] of O) extra[id] = Math.max(0, target - choices.filter((c) => c.offeringId === id).length);

  // 감사 로그 예시 (공용 데모 저장소에 한 번만 넣는다). 대상에는 이름 대신 가명ID·건수만.
  const s = store();
  const at = (daysAgo: number, hh: number, mm: number) => {
    const k = new Date(now.getTime() + 9 * H - daysAgo * D);
    return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), hh - 9, mm)).toISOString();
  };
  const samples: Omit<AuditEntry, "id">[] = [
    { actorId: "t-admin", action: "account.create", target: "교사 4개", at: at(0, 9, 12) },
    { actorId: "t-admin", action: "audit.export", target: "1주", at: at(0, 8, 40) },
    { actorId: "t-subject", action: "draft.confirm", target: "12건", at: at(0, 8, 5) },
    { actorId: "t-homeroom", action: "record.view", target: "학생 기록 38건", at: at(1, 22, 10) },
    { actorId: "t-subject", action: "draft.reject", target: "1건", at: at(1, 16, 30) },
    { actorId: "t-admin", action: "offering.create", target: "2-2 미적분Ⅱ", at: at(3, 10, 2) },
  ].filter((e) => new Date(e.at).getTime() <= now.getTime());
  // 공유용 깨끗한 데모 (2026-10-22): 과목 개설만 두고 학생 신청 · 감사 로그 · 접속 기록 예시는 넣지 않는다
  void s; void samples; void choices; void extra; void lastLogin;
  return { lastLogin: new Map(), rounds: [round], offerings, choices: [], extra: {} };
}

function ast(): AdminStore {
  if (!g.__schsadmin) g.__schsadmin = seedAdmin();
  return g.__schsadmin;
}

function demoCountFor(roundId: string): Record<string, number> {
  const a = ast();
  const out: Record<string, number> = {};
  for (const o of a.offerings) if (o.roundId === roundId && o.active) out[o.id] = a.extra[o.id] ?? 0;
  for (const c of a.choices) if (c.roundId === roundId && c.offeringId in out) out[c.offeringId]++;
  return out;
}

function strip(row: Offering & { active: boolean }): Offering {
  const { active, ...o } = row;
  void active;
  return o;
}

export const demoAdmin: AdminRepo = {
  async adminCountTeachers() {
    return store().teachers.size;
  },
  async adminRegisterTeacher(name, passwordHash) {
    const s = store();
    for (const a of s.accounts.values()) if (a.kind === "teacher" && a.loginId === name) throw new Error("duplicate_name");
    const { roles, dept } = signupRoles(s.teachers.size);
    const id = crypto.randomUUID();
    s.accounts.set(id, { id, kind: "teacher", loginId: name, passwordHash, mustChangePassword: false, failedCount: 0, lockedUntil: null });
    s.teachers.set(id, { id, name, roles, homeroom: null, dept });
    ast().lastLogin.set(id, new Date().toISOString());
    return { id, roles };
  },
  async adminCreateTeacher(t) {
    const s = store();
    for (const a of s.accounts.values()) if (a.kind === "teacher" && a.loginId === t.name) throw new Error("duplicate_name");
    const id = crypto.randomUUID();
    s.accounts.set(id, { id, kind: "teacher", loginId: t.name, passwordHash: t.passwordHash, mustChangePassword: true, failedCount: 0, lockedUntil: null });
    s.teachers.set(id, { id, name: t.name, roles: t.roles, homeroom: t.homeroom, dept: t.dept });
    return id;
  },
  async adminUpdateTeacher(id, patch) {
    const t = store().teachers.get(id);
    if (t) store().teachers.set(id, { ...t, ...patch });
  },
  async adminListAccounts() {
    const s = store();
    const last = ast().lastLogin;
    // 공동교육과정 다른 학교 학생(N54) 계정은 로그인 못 하는 자리라 계정 관리에 안 보인다
    return [...s.accounts.values()].filter((a) => !a.loginId.startsWith("joint:")).map((a) => {
      const t = a.kind === "teacher" ? s.teachers.get(a.id) ?? null : null;
      const st = a.kind === "student" ? s.students.get(a.id) ?? null : null;
      return {
        id: a.id, kind: a.kind, name: t?.name ?? st?.name ?? a.loginId, loginId: a.loginId,
        mustChangePassword: a.mustChangePassword, lockedUntil: a.lockedUntil, lastLoginAt: last.get(a.id) ?? null,
        teacher: t, student: st ? { pseudonymId: st.pseudonymId, grade: st.grade, classNo: st.classNo, number: st.number } : null,
      };
    });
  },
  async adminTouchLogin(id) {
    ast().lastLogin.set(id, new Date().toISOString());
  },
  async adminListAuditSince(sinceIso, limit) {
    ast();
    return store().audit.filter((e) => e.at >= sinceIso).slice(0, limit);
  },

  async offeringRound(year, grade) {
    const list = ast().rounds.filter((r) => r.year === year && r.grade === grade).sort((a, b) => b.semester - a.semester);
    return list[0] ? { ...list[0] } : null;
  },
  async offeringGetRound(id) {
    const r = ast().rounds.find((x) => x.id === id);
    return r ? { ...r } : null;
  },
  async offeringCreateRound(r) {
    const a = ast();
    if (a.rounds.some((x) => x.year === r.year && x.semester === r.semester && x.grade === r.grade)) throw new Error("이미 열린 신청이에요");
    const row = { ...r, id: crypto.randomUUID() };
    a.rounds.push(row);
    return { ...row };
  },
  async offeringUpdateRound(id, patch) {
    const r = ast().rounds.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  },
  async offeringList(roundId) {
    return ast().offerings.filter((o) => o.roundId === roundId && o.active).map(strip);
  },
  async offeringCreate(o) {
    const a = ast();
    if (a.offerings.some((x) => x.active && x.roundId === o.roundId && x.subject === o.subject)) throw new Error("이미 연 과목이에요");
    const row = { ...o, id: crypto.randomUUID(), sections: 1, active: true };
    a.offerings.push(row);
    return strip(row);
  },
  async offeringArchive(id) {
    const a = ast();
    const o = a.offerings.find((x) => x.id === id);
    if (!o) return;
    o.active = false;
    a.choices = a.choices.filter((c) => c.offeringId !== id);
  },
  async offeringAddSections(ids) {
    for (const o of ast().offerings) if (ids.includes(o.id) && o.active) o.sections += 1;
  },
  async offeringCounts(roundId) {
    return demoCountFor(roundId);
  },
  async offeringApplicants(roundId) {
    return new Set(ast().choices.filter((c) => c.roundId === roundId).map((c) => c.studentId)).size;
  },
  async offeringChoicesOf(roundId, studentId) {
    return ast().choices.filter((c) => c.roundId === roundId && c.studentId === studentId).map((c) => c.offeringId);
  },
  async offeringApply(roundId, studentId, offeringIds) {
    const a = ast();
    const counts = demoCountFor(roundId);
    const mine = new Set(a.choices.filter((c) => c.roundId === roundId && c.studentId === studentId).map((c) => c.offeringId));
    for (const id of offeringIds) {
      const o = a.offerings.find((x) => x.id === id && x.active && x.roundId === roundId);
      if (!o) throw new Error("없는 과목이 있어요");
      if (!mine.has(id) && (counts[id] ?? 0) >= seats(o)) throw new Error(`full:${o.subject}`);
    }
    a.choices = [
      ...a.choices.filter((c) => !(c.roundId === roundId && c.studentId === studentId)),
      ...offeringIds.map((offeringId) => ({ roundId, studentId, offeringId })),
    ];
  },
};

// ── Supabase ─────────────────────────────────────────

type RoundRow = { id: string; year: number; semester: 1 | 2; grade: number; deadline: string; max_credits: number };
type OfferingRow = { id: string; round_id: string; subject: string; field: string; credits: number; capacity: number; sections: number; course_id: string | null };
const toRound = (r: RoundRow): OfferingRound => ({ id: r.id, year: r.year, semester: r.semester, grade: r.grade, deadline: r.deadline, maxCredits: r.max_credits });
const toOffering = (r: OfferingRow): Offering => ({ id: r.id, roundId: r.round_id, subject: r.subject, field: r.field, credits: r.credits, capacity: r.capacity, sections: r.sections, courseId: r.course_id });

/** PostgREST 는 한 번에 1000줄까지라 나눠 읽는다 */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await page(from, from + 999)) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

function rpcError(e: { message: string } | null) {
  if (!e) return;
  if (e.message.includes("duplicate_name")) throw new Error("duplicate_name");
  if (e.message.includes("unknown_offering")) throw new Error("없는 과목이 있어요");
  const full = e.message.match(/full:(.+)/);
  if (full) throw new Error(`full:${full[1]}`);
  throw new Error(e.message);
}

export const supabaseAdmin: AdminRepo = {
  async adminCountTeachers() {
    const r = await db().from("teachers").select("id", { count: "exact", head: true });
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  },
  async adminRegisterTeacher(name, passwordHash) {
    const r = await db().rpc("register_teacher", { p_name: name, p_password_hash: passwordHash });
    rpcError(r.error);
    const d = r.data as { id: string; roles: TeacherRole[] };
    return { id: d.id, roles: d.roles };
  },
  async adminCreateTeacher(t) {
    const r = await db().rpc("admin_create_teacher", {
      p_name: t.name, p_password_hash: t.passwordHash, p_roles: t.roles, p_dept: t.dept,
      p_homeroom_grade: t.homeroom?.grade ?? null, p_homeroom_class: t.homeroom?.classNo ?? null,
    });
    rpcError(r.error);
    return r.data as string;
  },
  async adminUpdateTeacher(id, patch) {
    if (!isUuid(id)) return;
    check(await db().from("teachers").update({
      roles: patch.roles, dept: patch.dept, homeroom_grade: patch.homeroom?.grade ?? null, homeroom_class: patch.homeroom?.classNo ?? null,
    }).eq("id", id));
  },
  async adminListAccounts() {
    type A = { id: string; kind: Account["kind"]; login_id: string; must_change_password: boolean; locked_until: string | null; last_login_at: string | null };
    type T = { id: string; name: string; roles: TeacherRole[]; homeroom_grade: number | null; homeroom_class: number | null; dept: string | null };
    type S = { id: string; pseudonym_id: string; grade: number; class_no: number; number: number; name: string };
    const [accounts, teachers, students] = await Promise.all([
      readAll<A>((f, t) => db().from("accounts").select("id, kind, login_id, must_change_password, locked_until, last_login_at").order("created_at").range(f, t)),
      readAll<T>((f, t) => db().from("teachers").select("id, name, roles, homeroom_grade, homeroom_class, dept").range(f, t)),
      readAll<S>((f, t) => db().from("students").select("id, pseudonym_id, grade, class_no, number, name").range(f, t)),
    ]);
    const tm = new Map(teachers.map((t) => [t.id, t]));
    const sm = new Map(students.map((s) => [s.id, s]));
    return accounts.filter((a) => !a.login_id.startsWith("joint:")).map((a) => {
      const t = tm.get(a.id);
      const s = sm.get(a.id);
      return {
        id: a.id, kind: a.kind, name: t?.name ?? s?.name ?? a.login_id, loginId: a.login_id,
        mustChangePassword: a.must_change_password, lockedUntil: a.locked_until, lastLoginAt: a.last_login_at,
        teacher: t ? { id: t.id, name: t.name, roles: t.roles, dept: t.dept, homeroom: t.homeroom_grade && t.homeroom_class ? { grade: t.homeroom_grade, classNo: t.homeroom_class } : null } : null,
        student: s ? { pseudonymId: s.pseudonym_id, grade: s.grade, classNo: s.class_no, number: s.number } : null,
      };
    });
  },
  async adminTouchLogin(id) {
    if (!isUuid(id)) return;
    check(await db().from("accounts").update({ last_login_at: new Date().toISOString() }).eq("id", id));
  },
  async adminListAuditSince(sinceIso, limit) {
    const r = check(await db().from("audit_logs").select("*").gte("at", sinceIso).order("at", { ascending: false }).limit(limit));
    return (r as { id: string; actor_id: string | null; action: string; target: string | null; at: string }[]).map((x) => ({ id: x.id, actorId: x.actor_id, action: x.action, target: x.target, at: x.at }));
  },

  async offeringRound(year, grade) {
    const r = check(await db().from("offering_rounds").select("*").eq("year", year).eq("grade", grade).order("semester", { ascending: false }).limit(1));
    const row = (r as RoundRow[])[0];
    return row ? toRound(row) : null;
  },
  async offeringGetRound(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("offering_rounds").select("*").eq("id", id).maybeSingle());
    return r ? toRound(r as RoundRow) : null;
  },
  async offeringCreateRound(r) {
    const res = await db().from("offering_rounds").insert({ year: r.year, semester: r.semester, grade: r.grade, deadline: r.deadline, max_credits: r.maxCredits }).select().single();
    if (res.error) throw new Error(res.error.code === "23505" ? "이미 열린 신청이에요" : res.error.message);
    return toRound(res.data as RoundRow);
  },
  async offeringUpdateRound(id, patch) {
    if (!isUuid(id)) return;
    check(await db().from("offering_rounds").update({ deadline: patch.deadline, max_credits: patch.maxCredits }).eq("id", id));
  },
  async offeringList(roundId) {
    if (!isUuid(roundId)) return [];
    const r = check(await db().from("offerings").select("*").eq("round_id", roundId).eq("active", true).order("created_at"));
    return (r as OfferingRow[]).map(toOffering);
  },
  async offeringCreate(o) {
    const res = await db().from("offerings").insert({
      round_id: o.roundId, subject: o.subject, field: o.field, credits: o.credits, capacity: o.capacity, course_id: o.courseId && isUuid(o.courseId) ? o.courseId : null,
    }).select().single();
    if (res.error) throw new Error(res.error.code === "23505" ? "이미 연 과목이에요" : res.error.message);
    return toOffering(res.data as OfferingRow);
  },
  async offeringArchive(id) {
    if (!isUuid(id)) return;
    check(await db().from("offerings").update({ active: false }).eq("id", id));
    check(await db().from("offering_choices").delete().eq("offering_id", id));
  },
  async offeringAddSections(ids) {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) return;
    const rows = check(await db().from("offerings").select("id, sections").in("id", valid)) as { id: string; sections: number }[];
    for (const r of rows) check(await db().from("offerings").update({ sections: r.sections + 1 }).eq("id", r.id));
  },
  async offeringCounts(roundId) {
    if (!isUuid(roundId)) return {};
    const rows = await readAll<{ offering_id: string }>((f, t) => db().from("offering_choices").select("offering_id").eq("round_id", roundId).range(f, t));
    const out: Record<string, number> = {};
    for (const r of rows) out[r.offering_id] = (out[r.offering_id] ?? 0) + 1;
    return out;
  },
  async offeringApplicants(roundId) {
    if (!isUuid(roundId)) return 0;
    const rows = await readAll<{ student_id: string }>((f, t) => db().from("offering_choices").select("student_id").eq("round_id", roundId).range(f, t));
    return new Set(rows.map((r) => r.student_id)).size;
  },
  async offeringChoicesOf(roundId, studentId) {
    if (!isUuid(roundId) || !isUuid(studentId)) return [];
    const r = check(await db().from("offering_choices").select("offering_id").eq("round_id", roundId).eq("student_id", studentId));
    return (r as { offering_id: string }[]).map((x) => x.offering_id);
  },
  async offeringApply(roundId, studentId, offeringIds) {
    if (!isUuid(roundId) || !isUuid(studentId) || !offeringIds.every(isUuid)) throw new Error("없는 과목이 있어요");
    const r = await db().rpc("apply_offerings", { p_round: roundId, p_student: studentId, p_offerings: offeringIds });
    rpcError(r.error);
  },
};
