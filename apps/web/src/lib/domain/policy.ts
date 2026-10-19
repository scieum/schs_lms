// 권한 판정은 이 파일 한 곳에서만 한다. 화면·서버 액션은 여기 결과만 따른다.
import type { TeacherRole, Viewer } from "./types";

export type Action =
  | "student.register" // 학생 등록 (엑셀·한 명씩)
  | "student.list" // 학생 목록 보기
  | "account.manage" // 계정 관리·비밀번호 초기화
  | "audit.view" // 감사 로그
  | "curriculum.manage" // 편제표(학교 개설 과목) 관리
  | "subjects.assign" // 내 교과·과목 정하기 (관리자는 다른 교사 것도)
  | "setuk.write" // 교과 세특 쓰기 (배정받은 과목만 — 액션에서 한 번 더 확인)
  | "logs.write" // 창체 누가기록 (동아리 지도교사·담임 — 학생별 권한은 activity.canLog)
  | "service.upload" // 봉사 확인서 올리기 (담당 교사)
  | "service.receive" // 봉사 확인서 받기·확인 (담임)
  | "program.manage" // 프로그램 등록·설문 발행·자료 등록 (교사 — 남의 프로그램은 액션에서 한 번 더 확인)
  | "draft.review" // 생기부 초안 생성·검토·확정 (교사 — 자기 프로그램만)
  | "counsel.write" // 상담 기록 쓰기 (교사 — 담임은 반 학생 기록 전체 열람, 교과교사는 자기 것만)
  | "record.write" // AI 기록 쓰기 공간 (세특·누가기록 특기사항·행발)
  | "homeroom.view" // 우리 반 학생 기록 모아 보기 (담임·관리자)
  | "scores.upload" // 성적 업로드 (담임·관리자)
  | "minimum.view" // 수능 최저 판정 (담임·관리자)
  | "night.manage" // 야간 자율학습 출석·승인 (담임·관리자)
  | "pipeline.view" // 초안 생성 현황·오류 처리 (관리자)
  | "offering.manage" // 과목 신청 개설·정원 (관리자)
  | "report.view" // 학생부 점검 보고서 (N39) — 지금은 관리자. 학생부 담당 역할을 만들면 여기만 바꾼다
  | "retention.manage" // 자료 보존 기간 · 파기 (N39, 관리자)
  | "student.self"; // 학생 본인 화면 (설문·제출·성적·생기부·추천·야자·과목 신청)

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
    case "subjects.assign":
    case "setuk.write":
    case "logs.write":
    case "service.upload":
    case "program.manage":
    case "draft.review":
    case "counsel.write":
    case "record.write":
      return v.kind === "teacher";
    case "service.receive":
    case "homeroom.view":
    case "scores.upload":
    case "minimum.view":
    case "night.manage":
      return v.kind === "teacher" && (!!v.teacher.homeroom || isAdmin(v));
    case "account.manage":
    case "audit.view":
    case "curriculum.manage":
    case "pipeline.view":
    case "offering.manage":
    case "report.view":
    case "retention.manage":
      return isAdmin(v);
    case "student.self":
      return v.kind === "student";
  }
}

/** 로그인 후 처음 갈 홈 경로 */
export function homePath(v: Viewer): string {
  if (v.kind === "student") return "/student";
  // 관리자도 첫 화면은 교사 홈 (2026-10-16 사용자 결정). 관리 현황은 사이드바 "관리자"에서
  if (hasRole(v, "homeroom") && v.teacher.homeroom && !isAdmin(v)) return "/homeroom";
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
