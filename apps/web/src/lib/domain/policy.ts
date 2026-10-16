// 권한 판정은 이 파일 한 곳에서만 한다. 화면·서버 액션은 여기 결과만 따른다.
import type { TeacherRole, Viewer } from "./types";

export type Action =
  | "student.register" // 학생 등록 (엑셀·한 명씩)
  | "student.list" // 학생 목록 보기
  | "account.manage" // 계정 관리·비밀번호 초기화
  | "audit.view"; // 감사 로그

function hasRole(v: Viewer, role: TeacherRole) {
  return v.kind === "teacher" && v.teacher.roles.includes(role);
}

/** 관리자는 모든 권한을 가진 교사다. */
export function isAdmin(v: Viewer) {
  return hasRole(v, "admin");
}

export function can(v: Viewer, action: Action): boolean {
  if (v.mustChangePassword) return false; // C9: 비밀번호를 바꾸기 전에는 아무것도 못 한다
  switch (action) {
    case "student.register":
    case "student.list":
      // 2026-10-16 결정: 관리자와 교사 모두 학생을 등록할 수 있다
      return v.kind === "teacher";
    case "account.manage":
    case "audit.view":
      return isAdmin(v);
  }
}

/** 로그인 후 처음 갈 홈 경로 */
export function homePath(v: Viewer): string {
  if (v.kind === "student") return "/student";
  if (isAdmin(v)) return "/admin";
  if (hasRole(v, "homeroom")) return "/homeroom";
  return "/teacher";
}

export function roleLabel(v: Viewer): string {
  if (v.kind === "student") {
    const s = v.student;
    return `${s.grade}학년 ${s.classNo}반 ${s.number}번`;
  }
  const t = v.teacher;
  if (t.roles.includes("admin")) return `${t.dept ?? "교무"} · 관리자`;
  if (t.homeroom) return `담임 · ${t.homeroom.grade}학년 ${t.homeroom.classNo}반`;
  return "교과 · 프로그램 교사";
}
