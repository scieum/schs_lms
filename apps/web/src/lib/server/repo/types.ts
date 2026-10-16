import type { Account, AuditEntry, Student, Teacher } from "@/lib/domain/types";

export interface NewStudent {
  pseudonymId: string;
  studentNo: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
  birthDate: string;
  passwordHash: string;
}

/** 저장소. 데모(메모리)와 Supabase가 같은 모양을 지킨다. 서버 코드만 쓴다. */
export interface Repo {
  findAccountByLogin(kind: Account["kind"], loginId: string): Promise<Account | null>;
  getAccount(id: string): Promise<Account | null>;
  updateAccount(id: string, patch: Partial<Pick<Account, "passwordHash" | "mustChangePassword" | "failedCount" | "lockedUntil">>): Promise<void>;

  getTeacher(id: string): Promise<Teacher | null>;
  getStudent(id: string): Promise<Student | null>;
  listStudents(): Promise<Student[]>;
  existingStudentNos(): Promise<Set<string>>;
  existingPseudonymIds(): Promise<string[]>;
  /** 학생 계정과 학생 정보를 함께 만든다. 학번이 겹치면 실패 */
  createStudents(rows: NewStudent[]): Promise<Student[]>;

  audit(actorId: string | null, action: string, target: string | null): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}
