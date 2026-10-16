// 도메인 타입. DB(Supabase)와 데모 저장소가 같은 모양을 쓴다.

export type TeacherRole = "subject" | "program" | "homeroom" | "admin";

export type AccountKind = "student" | "teacher";

export interface Account {
  id: string;
  kind: AccountKind;
  /** 학생은 학번, 교사는 로그인 이름 */
  loginId: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedCount: number;
  lockedUntil: string | null; // ISO
}

export interface Teacher {
  id: string; // = account id
  name: string;
  roles: TeacherRole[];
  homeroom: { grade: number; classNo: number } | null;
  dept: string | null;
}

export interface Student {
  id: string; // = account id
  /** 가명ID. AI에 보낼 때는 이름·학번 대신 이 값만 쓴다. */
  pseudonymId: string;
  studentNo: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
  gender: "남" | "여";
  /** 계열 번호 (속초고는 1로 통일) */
  track: number;
  careerGoal: string | null;
}

/** 로그인한 사람. 세션에서 다시 읽어 만든다. */
export type Viewer =
  | { kind: "student"; accountId: string; mustChangePassword: boolean; student: Student }
  | { kind: "teacher"; accountId: string; mustChangePassword: boolean; teacher: Teacher };

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  target: string | null;
  at: string;
}
