import type { Course, SubjectGroup, TeacherCourse } from "@/lib/domain/curriculum";
import type { ActivityArea, ActivityLog, Club, ServiceRecord } from "@/lib/domain/activity";
import type { SetukRecord } from "@/lib/domain/setuk";
import type { Account, AuditEntry, Student, Teacher } from "@/lib/domain/types";
import type { ExternalInput } from "@/lib/domain/joint-curriculum";

export interface NewStudent {
  pseudonymId: string;
  studentNo: string;
  grade: number;
  classNo: number;
  number: number;
  name: string;
  gender: "남" | "여";
  track: number;
  passwordHash: string;
}

export type NewServiceRecord = Omit<ServiceRecord, "id" | "createdAt" | "status" | "confirmedBy" | "confirmedAt" | "filePath">;

/** 저장소. 데모(메모리)와 Supabase가 같은 모양을 지킨다. 서버 코드만 쓴다. */
export interface Repo {
  findAccountByLogin(kind: Account["kind"], loginId: string): Promise<Account | null>;
  getAccount(id: string): Promise<Account | null>;
  updateAccount(id: string, patch: Partial<Pick<Account, "passwordHash" | "mustChangePassword" | "failedCount" | "lockedUntil">>): Promise<void>;

  getTeacher(id: string): Promise<Teacher | null>;
  getStudent(id: string): Promise<Student | null>;
  /** 본교 학생. external 이면 공동교육과정 다른 학교 학생도 (N54) */
  listStudents(opts?: { external?: boolean }): Promise<Student[]>;
  /** 공동교육과정 다른 학교 학생 만들기: 로그인 못 하는 계정 + 학생 정보 (N54) */
  createExternalStudents(rows: (ExternalInput & { pseudonymId: string })[]): Promise<Student[]>;
  updateExternalStudent(id: string, r: ExternalInput): Promise<void>;
  existingStudentNos(): Promise<Set<string>>;
  existingPseudonymIds(): Promise<string[]>;
  /** 학생 계정과 학생 정보를 함께 만든다. 학번이 겹치면 실패 */
  createStudents(rows: NewStudent[]): Promise<Student[]>;

  listTeachers(): Promise<Teacher[]>;

  // 편제표 (학교 개설 과목). 지우지 않고 active=false 로 내린다
  /** 편제표 과목. joint 이면 공동교육과정 수업(N54)도 — 편제표 · 수강 신청 · 상담에는 안 보인다 */
  listCourses(year: number, opts?: { joint?: boolean }): Promise<Course[]>;
  getCourse(id: string): Promise<Course | null>;
  /** 같은 학년도·학년·학기·과목이 이미 있으면 실패 */
  createCourse(c: Omit<Course, "id">): Promise<Course>;
  archiveCourse(id: string): Promise<void>;
  /** 공동교육과정 수업 고치기 (N54) */
  updateCourse(id: string, patch: Pick<Course, "subject" | "grade" | "semester" | "joint">): Promise<void>;

  // 교사의 교과·담당 과목
  getTeacherGroups(teacherId: string): Promise<SubjectGroup[]>;
  setTeacherGroups(teacherId: string, groups: SubjectGroup[]): Promise<void>;
  listTeacherCourses(teacherId: string): Promise<TeacherCourse[]>;
  listAllTeacherCourses(): Promise<TeacherCourse[]>;
  /** 이 교사의 배정을 통째로 바꾼다 */
  setTeacherCourses(teacherId: string, rows: TeacherCourse[]): Promise<void>;

  // 교과 세특: 추가만 한다 (C4)
  listSetuk(courseId: string): Promise<SetukRecord[]>;
  /** 한 학생의 세특 전부 (여러 과목을 한 번에) */
  listSetukForStudent(studentId: string, courseIds: string[]): Promise<SetukRecord[]>;
  addSetuk(r: Omit<SetukRecord, "id" | "createdAt">): Promise<SetukRecord>;

  // 동아리
  listClubs(year: number): Promise<Club[]>;
  getClub(id: string): Promise<Club | null>;
  /** 같은 학년도에 같은 이름이 있으면 실패 */
  createClub(c: Omit<Club, "id">): Promise<Club>;
  listClubMembers(clubId: string): Promise<string[]>;
  setClubMembers(clubId: string, studentIds: string[]): Promise<void>;

  // 창체 누가기록: 추가만 한다 (C4)
  listActivityLogs(area: ActivityArea, studentIds: string[]): Promise<ActivityLog[]>;
  addActivityLogs(rows: Omit<ActivityLog, "id" | "createdAt">[]): Promise<number>;
  /** 누가기록 지우기 (0034): 그 선생님이 쓴 것만 숨긴다. 숨긴 수 */
  hideActivityLogs(ids: string[], authorId: string): Promise<number>;

  // 봉사 확인서
  addServiceRecord(r: NewServiceRecord, file: Uint8Array): Promise<ServiceRecord>;
  listServiceRecords(filter: { studentIds?: string[]; uploaderId?: string }): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | null>;
  getServiceFile(r: ServiceRecord): Promise<Uint8Array | null>;
  confirmService(id: string, by: string): Promise<void>;
  /** 확인 대기(sent) 확인서의 활동내용만 바꾼다 (N42 ④ "바꾸고 확인" — 확인서 파일 그대로). 바꿨으면 true */
  updateServiceActivity(id: string, activity: string): Promise<boolean>;
  /** 보존 기간이 지난 봉사 확인서 원본 파일만 지운다 (N39). 봉사 기록은 남긴다. 지운 개수 */
  purgeServiceFiles(ids: string[]): Promise<number>;

  audit(actorId: string | null, action: string, target: string | null): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}
