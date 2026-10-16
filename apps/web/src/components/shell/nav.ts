import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user";

export interface NavItem { label: string; href: string; icon: IconName; ready?: boolean }
export interface NavGroup { label: string; items: NavItem[] }

export function navFor(v: Viewer): NavGroup[] {
  if (v.kind === "student") {
    return [
      { label: "나의 기록", items: [
        { label: "홈", href: "/student", icon: "home", ready: true },
        { label: "설문·서류 제출", href: "/student/submit", icon: "clipboard", ready: true },
        { label: "성적·최저", href: "/student/scores", icon: "chart", ready: true },
        { label: "생활기록부", href: "/student/record", icon: "book", ready: true },
      ] },
      { label: "신청", items: [
        { label: "추천 활동", href: "/student/recs", icon: "sparkle", ready: true },
        { label: "야자 신청", href: "/student/night", icon: "moon", ready: true },
        { label: "과목 신청", href: "/student/courses", icon: "list", ready: true },
      ] },
    ];
  }
  const r = v.teacher.roles;
  const groups: NavGroup[] = [
    { label: "업무", items: [
      { label: "홈", href: "/teacher", icon: "home", ready: true },
      { label: "교과 세특", href: "/teacher/setuk", icon: "book", ready: true },
      { label: "AI 기록 쓰기", href: "/teacher/write", icon: "sparkle", ready: true },
      { label: "누가기록", href: "/teacher/logs", icon: "file", ready: true },
      { label: "봉사 확인서", href: "/teacher/service", icon: "clipboard", ready: true },
      { label: "초안 검토", href: "/teacher/drafts", icon: "file", ready: true },
      { label: "프로그램·자료", href: "/teacher/programs", icon: "clipboard", ready: true },
      { label: "내 교과·과목", href: "/teacher/subjects", icon: "list", ready: true },
      { label: "내 동아리", href: "/teacher/club", icon: "users", ready: true },
    ] },
    { label: "학생", items: [
      { label: "담당 학생", href: "/students", icon: "users", ready: true },
      { label: "상담 기록", href: "/teacher/counseling", icon: "chat", ready: true },
      { label: "학생 등록", href: "/students/new", icon: "userPlus", ready: true },
    ] },
  ];
  if (r.includes("homeroom")) {
    groups.push({ label: "우리 반", items: [
      { label: "우리 반 홈", href: "/homeroom", icon: "home", ready: true },
      { label: "학생 기록", href: "/homeroom/students", icon: "users", ready: true },
      { label: "행발", href: "/homeroom/behavior", icon: "book", ready: true },
      { label: "봉사 받은함", href: "/homeroom/service", icon: "shield", ready: true },
      { label: "성적 업로드", href: "/homeroom/scores", icon: "chart", ready: true },
      { label: "수능 최저", href: "/homeroom/minimum", icon: "target", ready: true },
      { label: "야간 자율학습", href: "/homeroom/night", icon: "moon", ready: true },
    ] });
  }
  if (r.includes("admin")) {
    groups.push({ label: "관리", items: [
      { label: "관리 홈", href: "/admin", icon: "home", ready: true },
      { label: "오류 처리", href: "/admin/errors", icon: "alert", ready: true },
      { label: "초안 생성 현황", href: "/admin/pipeline", icon: "refresh", ready: true },
      { label: "계정 관리", href: "/admin/accounts", icon: "users", ready: true },
      { label: "과목 개설", href: "/admin/offerings", icon: "list", ready: true },
      { label: "편제표", href: "/admin/curriculum", icon: "list", ready: true },
      { label: "감사 로그", href: "/admin/audit", icon: "shield", ready: true },
    ] });
  }
  return groups;
}

/** 모바일 하단 탭 (5개) */
export function tabsFor(v: Viewer): NavItem[] {
  if (v.kind === "student") {
    return [
      { label: "홈", href: "/student", icon: "home", ready: true },
      { label: "제출", href: "/student/submit", icon: "clipboard", ready: true },
      { label: "성적", href: "/student/scores", icon: "chart", ready: true },
      { label: "생기부", href: "/student/record", icon: "book", ready: true },
      { label: "MY", href: "/me", icon: "user", ready: true },
    ];
  }
  const home = v.teacher.roles.includes("admin") ? "/admin" : v.teacher.roles.includes("homeroom") ? "/homeroom" : "/teacher";
  return [
    { label: "홈", href: home, icon: "home", ready: true },
    { label: "세특", href: "/teacher/setuk", icon: "book", ready: true },
    { label: "학생", href: "/students", icon: "users", ready: true },
    { label: "등록", href: "/students/new", icon: "userPlus", ready: true },
    { label: "MY", href: "/me", icon: "user", ready: true },
  ];
}
