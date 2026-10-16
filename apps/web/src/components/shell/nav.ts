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
        { label: "설문·서류 제출", href: "/student/submit", icon: "clipboard" },
        { label: "성적·최저", href: "/student/scores", icon: "chart" },
        { label: "생활기록부", href: "/student/record", icon: "book" },
      ] },
      { label: "신청", items: [
        { label: "추천 활동", href: "/student/recs", icon: "sparkle" },
        { label: "야자 신청", href: "/student/night", icon: "moon" },
        { label: "과목 신청", href: "/student/courses", icon: "list" },
      ] },
    ];
  }
  const r = v.teacher.roles;
  const groups: NavGroup[] = [
    { label: "업무", items: [
      { label: "홈", href: "/teacher", icon: "home", ready: true },
      { label: "교과 세특", href: "/teacher/setuk", icon: "book", ready: true },
      { label: "초안 검토", href: "/teacher/drafts", icon: "file" },
      { label: "프로그램·자료", href: "/teacher/programs", icon: "clipboard" },
      { label: "내 교과·과목", href: "/teacher/subjects", icon: "list", ready: true },
    ] },
    { label: "학생", items: [
      { label: "담당 학생", href: "/students", icon: "users", ready: true },
      { label: "상담 기록", href: "/teacher/counseling", icon: "chat" },
      { label: "학생 등록", href: "/students/new", icon: "userPlus", ready: true },
    ] },
  ];
  if (r.includes("homeroom")) {
    groups.push({ label: "우리 반", items: [
      { label: "우리 반 홈", href: "/homeroom", icon: "home", ready: true },
      { label: "성적 업로드", href: "/homeroom/scores", icon: "chart" },
      { label: "수능 최저", href: "/homeroom/minimum", icon: "target" },
      { label: "야간 자율학습", href: "/homeroom/night", icon: "moon" },
    ] });
  }
  if (r.includes("admin")) {
    groups.push({ label: "관리", items: [
      { label: "관리 홈", href: "/admin", icon: "home", ready: true },
      { label: "오류 처리", href: "/admin/errors", icon: "alert" },
      { label: "초안 생성 현황", href: "/admin/pipeline", icon: "refresh" },
      { label: "계정 관리", href: "/admin/accounts", icon: "users" },
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
      { label: "홈", href: "/student", icon: "home" },
      { label: "제출", href: "/student/submit", icon: "clipboard" },
      { label: "성적", href: "/student/scores", icon: "chart" },
      { label: "생기부", href: "/student/record", icon: "book" },
      { label: "MY", href: "/me", icon: "user" },
    ];
  }
  const home = v.teacher.roles.includes("admin") ? "/admin" : v.teacher.roles.includes("homeroom") ? "/homeroom" : "/teacher";
  return [
    { label: "홈", href: home, icon: "home" },
    { label: "세특", href: "/teacher/setuk", icon: "book" },
    { label: "학생", href: "/students", icon: "users" },
    { label: "등록", href: "/students/new", icon: "userPlus" },
    { label: "MY", href: "/me", icon: "user" },
  ];
}
