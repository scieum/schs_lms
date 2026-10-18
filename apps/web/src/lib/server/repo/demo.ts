import "server-only";
import bcrypt from "bcryptjs";
import { schoolYear, type Course, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import type { ActivityLog, Club, ServiceRecord } from "@/lib/domain/activity";
import type { SetukRecord } from "@/lib/domain/setuk";
import type { Account, AuditEntry, Student, Teacher } from "@/lib/domain/types";
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
  ];
  S.forEach(([id, grade, classNo, number, name, gender, first], i) => {
    const studentNo = `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
    accounts.set(id, { id, kind: "student", loginId: studentNo, passwordHash: first ? codeHash : demoHash, mustChangePassword: first, failedCount: 0, lockedUntil: null });
    students.set(id, { id, pseudonymId: `S${String(i + 1).padStart(3, "0")}`, studentNo, grade, classNo, number, name, gender, track: 1, careerGoal: i === 0 ? "산업디자인" : null });
  });

  // 편제표 예시 (올해): 1학년 공통과목, 2학년 선택과목
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
  ];
  const courses = C.map(([id, grade, semester, subject, group, type, credits]) => ({ id, year: y, grade, semester, subject, group, type, credits, active: true }));
  const teacherGroups = new Map<string, SubjectGroup[]>([["t-subject", ["과학"]], ["t-homeroom", ["국어"]]]);
  const teacherCourses: TeacherCourse[] = [
    { teacherId: "t-subject", courseId: "c-4", classes: [], mode: "moving", sections: ["1분반", "2분반"] },
    { teacherId: "t-subject", courseId: "c-5", classes: [3] },
    { teacherId: "t-homeroom", courseId: "c-7", classes: [3] },
  ];
  const setuk: SetukRecord[] = [{
    id: "r-1", courseId: "c-4", studentId: "s-2", authorId: "t-subject", unit: "bytes", max: 1500, status: "draft",
    content: "운동 법칙 단원에서 마찰이 있는 빗면 실험을 설계하여 측정값과 이론값의 차이를 분석함.",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  }, {
    id: "r-2", courseId: "c-4", studentId: "s-3", authorId: "t-subject", unit: "bytes", max: 1500, status: "confirmed",
    content: "파동 단원에서 소리의 공명을 주제로 관 길이에 따른 공명 진동수를 측정하고, 오차 원인을 온도 변화로 설명하는 탐구 보고서를 작성함.",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  }];

  // 동아리 예시: 이서연 선생님의 과학탐구반 (2학년 3명)
  const clubs = [{ id: "club-1", year: y, name: "과학탐구반", advisorId: "t-subject", active: true }];
  const clubMembers = new Map<string, string[]>([["club-1", ["s-2", "s-3", "s-4"]]]);
  const logs: ActivityLog[] = [{
    id: "l-1", area: "진로", studentId: "s-1", authorId: "t-homeroom", clubId: null, date: "2026-10-08",
    content: "진로 탐색 주간에 산업디자이너 인터뷰 영상을 보고 관심 분야를 정리함.", createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  }];

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
  async listStudents() {
    return [...store().students.values()].sort((a, b) => a.studentNo.localeCompare(b.studentNo));
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
  async listCourses(year) {
    return store().courses.filter((c) => c.active && c.year === year).map(({ active: _a, ...c }) => c);
  },
  async getCourse(id) {
    const c = store().courses.find((x) => x.id === id && x.active);
    if (!c) return null;
    const { active: _a, ...rest } = c;
    return rest;
  },
  async createCourse(c) {
    const s = store();
    if (s.courses.some((x) => x.active && x.year === c.year && x.grade === c.grade && x.semester === c.semester && x.subject === c.subject)) {
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
    return store().logs.filter((l) => l.area === area && set.has(l.studentId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
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
    return store().files.get(r.filePath) ?? null;
  },
  async confirmService(id, by) {
    const r = store().service.find((x) => x.id === id);
    if (r && r.status === "sent") Object.assign(r, { status: "confirmed", confirmedBy: by, confirmedAt: new Date().toISOString() });
  },
  async audit(actorId, action, target) {
    store().audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString() });
  },
  async listAudit(limit) {
    return store().audit.slice(0, limit);
  },
};
