import "server-only";
import bcrypt from "bcryptjs";
import { schoolYear, type Course, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import type { ActivityLog, Club, ServiceRecord } from "@/lib/domain/activity";
import type { SetukRecord } from "@/lib/domain/setuk";
import type { Account, AuditEntry, Student, Teacher } from "@/lib/domain/types";
import { externalNo } from "@/lib/domain/joint-curriculum";
import type { NewServiceRecord, NewStudent, Repo } from "./types";

// 데모 저장소: 서버 메모리에만 있다. 서버를 다시 켜면 처음 상태로 돌아간다.
// 데모 비밀번호는 모두 demo1234 (김민준만 첫 로그인 상태라 인증코드 schs-2026)

export interface Store {
  accounts: Map<string, Account>;
  teachers: Map<string, Teacher>;
  students: Map<string, Student>;
  audit: AuditEntry[];
  courses: (Course & { active: boolean })[];
  teacherGroups: Map<string, SubjectGroup[]>;
  teacherCourses: TeacherCourse[];
  setuk: SetukRecord[];
  clubs: (Club & { active: boolean })[];
  clubMembers: Map<string, string[]>;
  logs: ActivityLog[];
  service: ServiceRecord[];
  files: Map<string, Uint8Array>;
}

const g = globalThis as unknown as { __schsDemo?: Store };

function seed(): Store {
  const demoHash = bcrypt.hashSync("demo1234", 10);
  const codeHash = bcrypt.hashSync("schs-2026", 10);
  const accounts = new Map<string, Account>();
  const teachers = new Map<string, Teacher>();
  const students = new Map<string, Student>();

  const T: [string, string, Teacher["roles"], Teacher["homeroom"], string | null][] = [
    ["t-admin", "정다은", ["admin", "subject"], null, "교육과정부"],
    ["t-subject", "이서연", ["subject", "program"], null, "과학과"],
    ["t-homeroom", "박지훈", ["homeroom", "subject"], { grade: 2, classNo: 3 }, "국어과"],
  ];
  for (const [id, name, roles, homeroom, dept] of T) {
    accounts.set(id, { id, kind: "teacher", loginId: name, passwordHash: demoHash, mustChangePassword: false, failedCount: 0, lockedUntil: null });
    teachers.set(id, { id, name, roles, homeroom, dept });
  }

  const S: [string, number, number, number, string, Student["gender"], boolean][] = [
    ["s-1", 2, 3, 12, "김민준", "남", true],
    ["s-2", 2, 3, 1, "강예린", "여", false],
    ["s-3", 2, 3, 7, "박서준", "남", false],
    ["s-4", 2, 1, 11, "한지민", "여", false],
    ["s-5", 2, 2, 3, "최지우", "여", false],
    // 2학년 3반 (박지훈 선생님 반) — Figma H1~H5 명단
    ["s-6", 2, 3, 15, "이수아", "여", false],
    ["s-7", 2, 3, 21, "정하은", "여", false],
    ["s-8", 2, 3, 2, "오승우", "남", false],
    ["s-9", 2, 3, 27, "최유진", "여", false],
    ["s-10", 2, 3, 30, "한도윤", "남", false],
    ["s-11", 2, 3, 18, "윤지호", "남", false],
    ["s-12", 2, 3, 9, "서예린", "여", false],
    ["s-13", 2, 3, 14, "문태오", "남", false],
    ["s-14", 2, 3, 5, "배준혁", "남", false],
    ["s-15", 2, 3, 16, "송유나", "여", false],
    // 3학년 (2026-10-22 추가, 지어낸 이름): 3학년 1반 · 2반
    ["s-16", 3, 1, 1, "강도현", "남", false],
    ["s-17", 3, 1, 2, "김서윤", "여", false],
    ["s-18", 3, 1, 3, "박지안", "여", false],
    ["s-19", 3, 1, 4, "이준서", "남", false],
    ["s-20", 3, 1, 5, "조하린", "여", false],
    ["s-21", 3, 1, 6, "한시우", "남", false],
    ["s-22", 3, 2, 1, "권민서", "여", false],
    ["s-23", 3, 2, 2, "남궁현", "남", false],
    ["s-24", 3, 2, 3, "류채원", "여", false],
    ["s-25", 3, 2, 4, "신우진", "남", false],
  ];
  S.forEach(([id, grade, classNo, number, name, gender, first], i) => {
    const studentNo = `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
    accounts.set(id, { id, kind: "student", loginId: studentNo, passwordHash: first ? codeHash : demoHash, mustChangePassword: first, failedCount: 0, lockedUntil: null });
    students.set(id, { id, pseudonymId: `S${String(i + 1).padStart(3, "0")}`, studentNo, grade, classNo, number, name, gender, track: 1, careerGoal: i === 0 ? "산업디자인" : null });
  });

  // 편제표 예시 (올해): 1학년 공통과목, 2학년 선택과목, 3학년 진로 선택
  const y = schoolYear();
  const C: [string, number, 1 | 2, string, SubjectGroup, Course["type"], number][] = [
    ["c-1", 1, 1, "통합과학1", "과학", "공통", 4],
    ["c-2", 1, 2, "통합과학2", "과학", "공통", 4],
    ["c-3", 1, 1, "공통국어1", "국어", "공통", 4],
    ["c-4", 2, 1, "물리학", "과학", "일반 선택", 4],
    ["c-5", 2, 1, "화학", "과학", "일반 선택", 4],
    ["c-6", 2, 2, "생명과학", "과학", "일반 선택", 4],
    ["c-7", 2, 1, "문학", "국어", "일반 선택", 4],
    ["c-8", 2, 1, "대수", "수학", "일반 선택", 4],
    // 3학년 (2015 개정 진로 선택)
    ["c-9", 3, 2, "물리학Ⅱ", "과학", "진로 선택", 4],
    ["c-10", 3, 2, "화학Ⅱ", "과학", "진로 선택", 4],
    ["c-11", 3, 2, "언어와 매체", "국어", "일반 선택", 4],
  ];
  const courses = C.map(([id, grade, semester, subject, group, type, credits]) => ({ id, year: y, grade, semester, subject, group, type, credits, active: true }));
  const teacherGroups = new Map<string, SubjectGroup[]>([["t-subject", ["과학"]], ["t-homeroom", ["국어"]]]);
  const teacherCourses: TeacherCourse[] = [
    { teacherId: "t-subject", courseId: "c-4", classes: [], mode: "moving", sections: ["1분반", "2분반"] },
    { teacherId: "t-subject", courseId: "c-5", classes: [3] },
    { teacherId: "t-homeroom", courseId: "c-7", classes: [3] },
    { teacherId: "t-subject", courseId: "c-10", classes: [1, 2] },
    // 1학년 2학기 통합과학2 — 평가계획서 라이브러리(N78)를 데모에서 볼 수 있게
    { teacherId: "t-subject", courseId: "c-2", classes: [1] },
  ];
  // 공유용 깨끗한 데모 (2026-10-22): 학생 · 교사 · 편제표 · 수업 배정 · 동아리 명단만. 기록(세특 · 누가기록 · 봉사 · 프로그램 …)은 비워 둔다
  const setuk: SetukRecord[] = [];

  // 동아리 예시: 이서연 선생님의 과학탐구반 (2학년 3명)
  const clubs = [{ id: "club-1", year: y, name: "과학탐구반", advisorId: "t-subject", active: true }];
  const clubMembers = new Map<string, string[]>([["club-1", ["s-2", "s-3", "s-4"]]]);
  const logs: ActivityLog[] = [];

  return { accounts, teachers, students, audit: [], courses, teacherGroups, teacherCourses, setuk, clubs, clubMembers, logs, service: [], files: new Map() };
}

/** 모듈(modules/*)도 같은 데모 데이터(계정·학생·교사)를 읽고 쓸 때 쓴다 */
export function store(): Store {
  if (!g.__schsDemo) g.__schsDemo = seed();
  return g.__schsDemo;
}

export const demoRepo: Repo = {
  async findAccountByLogin(kind, loginId) {
    for (const a of store().accounts.values()) if (a.kind === kind && a.loginId === loginId) return { ...a };
    return null;
  },
  async getAccount(id) {
    const a = store().accounts.get(id);
    return a ? { ...a } : null;
  },
  async updateAccount(id, patch) {
    const a = store().accounts.get(id);
    if (a) store().accounts.set(id, { ...a, ...patch });
  },
  async getTeacher(id) {
    return store().teachers.get(id) ?? null;
  },
  async getStudent(id) {
    return store().students.get(id) ?? null;
  },
  async listStudents(opts) {
    return [...store().students.values()].filter((x) => opts?.external || !x.school).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  },
  async createExternalStudents(rows) {
    const s = store();
    return rows.map((r) => {
      const id = crypto.randomUUID();
      // 로그인 못 하는 계정 (비밀번호 해시가 아님 + 잠금)
      s.accounts.set(id, { id, kind: "student", loginId: `joint:${id}`, passwordHash: "!", mustChangePassword: false, failedCount: 0, lockedUntil: "9999-12-31T00:00:00.000Z" });
      const st: Student = { id, pseudonymId: r.pseudonymId, studentNo: externalNo(r), grade: r.grade, classNo: r.classNo, number: r.number, name: r.name.trim(), gender: "남", track: 1, careerGoal: null, school: r.school.trim() };
      s.students.set(id, st);
      return st;
    });
  },
  async updateExternalStudent(id, r) {
    const st = store().students.get(id);
    if (!st?.school) return;
    Object.assign(st, { school: r.school.trim(), grade: r.grade, classNo: r.classNo, number: r.number, name: r.name.trim(), studentNo: externalNo(r) });
  },
  async existingStudentNos() {
    return new Set([...store().students.values()].map((s) => s.studentNo));
  },
  async existingPseudonymIds() {
    return [...store().students.values()].map((s) => s.pseudonymId);
  },
  async createStudents(rows: NewStudent[]) {
    const s = store();
    const nos = new Set([...s.students.values()].map((x) => x.studentNo));
    if (rows.some((r) => nos.has(r.studentNo))) throw new Error("이미 등록된 학번이 있어요");
    return rows.map((r) => {
      const id = crypto.randomUUID();
      s.accounts.set(id, { id, kind: "student", loginId: r.studentNo, passwordHash: r.passwordHash, mustChangePassword: true, failedCount: 0, lockedUntil: null });
      const st: Student = { id, pseudonymId: r.pseudonymId, studentNo: r.studentNo, grade: r.grade, classNo: r.classNo, number: r.number, name: r.name, gender: r.gender, track: r.track, careerGoal: null };
      s.students.set(id, st);
      return st;
    });
  },
  async listTeachers() {
    return [...store().teachers.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  },
  async listCourses(year, opts) {
    return store().courses.filter((c) => c.active && c.year === year && (opts?.joint || !c.joint)).map(({ active: _a, ...c }) => c);
  },
  async getCourse(id) {
    const c = store().courses.find((x) => x.id === id && x.active);
    if (!c) return null;
    const { active: _a, ...rest } = c;
    return rest;
  },
  async createCourse(c) {
    const s = store();
    if (s.courses.some((x) => x.active && x.year === c.year && x.grade === c.grade && x.semester === c.semester && x.subject === c.subject && (x.ownerId ?? null) === (c.ownerId ?? null))) {
      throw new Error("이미 같은 학기에 있는 과목이에요");
    }
    const row = { ...c, id: crypto.randomUUID(), active: true };
    s.courses.push(row);
    const { active: _a, ...rest } = row;
    return rest;
  },
  async archiveCourse(id) {
    const c = store().courses.find((x) => x.id === id);
    if (c) c.active = false;
  },
  async updateCourse(id, patch) {
    const c = store().courses.find((x) => x.id === id && x.active);
    if (c) Object.assign(c, patch);
  },
  async getTeacherGroups(teacherId) {
    return store().teacherGroups.get(teacherId) ?? [];
  },
  async setTeacherGroups(teacherId, groups) {
    store().teacherGroups.set(teacherId, [...groups]);
  },
  async listTeacherCourses(teacherId) {
    return store().teacherCourses.filter((t) => t.teacherId === teacherId).map((t) => ({ ...t, classes: [...t.classes], sections: [...(t.sections ?? [])] }));
  },
  async listAllTeacherCourses() {
    return store().teacherCourses.map((t) => ({ ...t, classes: [...t.classes] }));
  },
  async setTeacherCourses(teacherId, rows) {
    const s = store();
    s.teacherCourses = [...s.teacherCourses.filter((t) => t.teacherId !== teacherId), ...rows.map((r) => ({ ...r, teacherId }))];
  },
  async listSetuk(courseId) {
    return store().setuk.filter((r) => r.courseId === courseId);
  },
  async listSetukForStudent(studentId, courseIds) {
    const ids = new Set(courseIds);
    return store().setuk.filter((r) => r.studentId === studentId && ids.has(r.courseId));
  },
  async addSetuk(r) {
    const row: SetukRecord = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    store().setuk.push(row);
    return row;
  },
  async listClubs(year) {
    return store().clubs.filter((c) => c.active && c.year === year).map(({ active: _a, ...c }) => c);
  },
  async getClub(id) {
    const c = store().clubs.find((x) => x.id === id && x.active);
    if (!c) return null;
    const { active: _a, ...rest } = c;
    return rest;
  },
  async createClub(c) {
    const s = store();
    if (s.clubs.some((x) => x.active && x.year === c.year && x.name === c.name)) throw new Error("이미 같은 이름의 동아리가 있어요");
    const row = { ...c, id: crypto.randomUUID(), active: true };
    s.clubs.push(row);
    const { active: _a, ...rest } = row;
    return rest;
  },
  async listClubMembers(clubId) {
    return [...(store().clubMembers.get(clubId) ?? [])];
  },
  async setClubMembers(clubId, ids) {
    store().clubMembers.set(clubId, [...new Set(ids)]);
  },
  async listActivityLogs(area, studentIds) {
    const set = new Set(studentIds);
    return store().logs.filter((l) => l.area === area && set.has(l.studentId) && !(l as { deletedAt?: string }).deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },
  async hideActivityLogs(ids, authorId) {
    const want = new Set(ids);
    let n = 0;
    for (const l of store().logs) if (want.has(l.id) && l.authorId === authorId && !(l as { deletedAt?: string }).deletedAt) { (l as { deletedAt?: string }).deletedAt = new Date().toISOString(); n++; }
    return n;
  },
  async addActivityLogs(rows) {
    const now = new Date().toISOString();
    store().logs.push(...rows.map((r) => ({ ...r, id: crypto.randomUUID(), createdAt: now })));
    return rows.length;
  },
  async addServiceRecord(r: NewServiceRecord, file) {
    const s = store();
    const id = crypto.randomUUID();
    const filePath = `${r.studentId}/${id}`;
    s.files.set(filePath, file);
    const row: ServiceRecord = { ...r, id, filePath, status: "sent", confirmedBy: null, confirmedAt: null, createdAt: new Date().toISOString() };
    s.service.push(row);
    return row;
  },
  async listServiceRecords({ studentIds, uploaderId }) {
    const set = studentIds ? new Set(studentIds) : null;
    return store().service
      .filter((r) => (!set || set.has(r.studentId)) && (!uploaderId || r.uploaderId === uploaderId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getServiceRecord(id) {
    return store().service.find((r) => r.id === id) ?? null;
  },
  async getServiceFile(r) {
    return r.filePath ? store().files.get(r.filePath) ?? null : null;
  },
  async confirmService(id, by) {
    const r = store().service.find((x) => x.id === id);
    if (r && r.status === "sent") Object.assign(r, { status: "confirmed", confirmedBy: by, confirmedAt: new Date().toISOString() });
  },
  async updateServiceActivity(id, activity) {
    const r = store().service.find((x) => x.id === id);
    if (!r || r.status !== "sent") return false;
    r.activity = activity;
    return true;
  },
  async purgeServiceFiles(ids) {
    const set = new Set(ids);
    let n = 0;
    for (const r of store().service) {
      if (!set.has(r.id) || r.purgedAt) continue;
      if (r.filePath) { store().files.delete(r.filePath); n++; }
      Object.assign(r, { filePath: "", purgedAt: new Date().toISOString() });
    }
    return n;
  },
  async audit(actorId, action, target) {
    store().audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString() });
  },
  async listAudit(limit) {
    return store().audit.slice(0, limit);
  },
};
