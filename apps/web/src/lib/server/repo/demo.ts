import "server-only";
import bcrypt from "bcryptjs";
import type { Account, AuditEntry, Student, Teacher } from "@/lib/domain/types";
import type { NewStudent, Repo } from "./types";

// 데모 저장소: 서버 메모리에만 있다. 서버를 다시 켜면 처음 상태로 돌아간다.
// 데모 비밀번호는 모두 demo1234 (김민준만 첫 로그인 상태라 인증코드 schs-2026)

interface Store {
  accounts: Map<string, Account>;
  teachers: Map<string, Teacher>;
  students: Map<string, Student>;
  audit: AuditEntry[];
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

  const S: [string, number, number, number, string, string, boolean][] = [
    ["s-1", 2, 3, 12, "김민준", "2009-03-14", true],
    ["s-2", 2, 3, 1, "강예린", "2009-05-02", false],
    ["s-3", 2, 3, 7, "박서준", "2009-01-21", false],
    ["s-4", 2, 1, 11, "한지민", "2009-08-30", false],
    ["s-5", 2, 2, 3, "최지우", "2009-11-09", false],
  ];
  S.forEach(([id, grade, classNo, number, name, birthDate, first], i) => {
    const studentNo = `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
    accounts.set(id, { id, kind: "student", loginId: studentNo, passwordHash: first ? codeHash : demoHash, mustChangePassword: first, failedCount: 0, lockedUntil: null });
    students.set(id, { id, pseudonymId: `S${String(i + 1).padStart(3, "0")}`, studentNo, grade, classNo, number, name, birthDate, careerGoal: i === 0 ? "산업디자인" : null });
  });

  return { accounts, teachers, students, audit: [] };
}

function store(): Store {
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
      const st: Student = { id, pseudonymId: r.pseudonymId, studentNo: r.studentNo, grade: r.grade, classNo: r.classNo, number: r.number, name: r.name, birthDate: r.birthDate, careerGoal: null };
      s.students.set(id, st);
      return st;
    });
  },
  async audit(actorId, action, target) {
    store().audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString() });
  },
  async listAudit(limit) {
    return store().audit.slice(0, limit);
  },
};
