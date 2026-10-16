import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user";

export interface NavItem { label: string; href: string; icon: IconName; ready?: boolean; badge?: number }
/** 사이드바 숫자 배지 (Figma: 초안 검토 12, 오류 처리 2, 설문·서류 제출 2) — href 기준 */
export type NavBadges = Record<string, number>;
/** fold: 시안에 없는 기능 묶음 — 접어 두고, 지금 화면이 안에 있으면 펼친다 */
export interface NavGroup { label: string; items: NavItem[]; fold?: boolean }

export function navFor(v: Viewer, badges: NavBadges = {}): NavGroup[] {
  return withBadges(baseNav(v), badges);
}

function withBadges(groups: NavGroup[], badges: NavBadges): NavGroup[] {
  return groups.map((g) => ({ ...g, items: g.items.map((it) => (badges[it.href] ? { ...it, badge: badges[it.href] } : it)) }));
}

function baseNav(v: Viewer): NavGroup[] {
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
  // Figma 사이드바 그대로: 교사(T1) 업무·학생 / 담임(H1) 우리 반·관리 / 관리자(A1) 업무·관리.
  // 시안에 없는 기능은 "더보기"에 접어 둔다.
  const r = v.teacher.roles;
  const homeroom = r.includes("homeroom") && !!v.teacher.homeroom;
  const admin = r.includes("admin");
  const I = (label: string, href: string, icon: IconName): NavItem => ({ label, href, icon, ready: true });

  const work: NavGroup = { label: "업무", items: [
    ...(homeroom && !admin ? [] : [I("홈", "/teacher", "home")]),
    I("초안 검토", "/teacher/drafts", "file"),
    I("프로그램·설문", "/teacher/programs", "clipboard"),
  ] };
  const students: NavGroup = { label: "학생", items: [
    I("담당 학생", "/students", "users"),
    I("상담 기록", "/teacher/counseling", "chat"),
    I("학생 등록", "/students/new", "userPlus"),
  ] };
  // 담임(H1)은 우리 반·관리만 펼치고, 교사 업무·학생은 더보기 맨 앞에 둔다 (관리자는 교사 홈을 쓰므로 펼침)
  const tuck = homeroom && !admin;
  const more: NavGroup = { label: "더보기", fold: true, items: [
    ...(tuck ? [...work.items, ...students.items] : []),
    I("AI 기록 쓰기", "/teacher/write", "sparkle"),
    I("교과 세특", "/teacher/setuk", "book"),
    I("누가기록", "/teacher/logs", "file"),
    I("봉사 확인서", "/teacher/service", "clipboard"),
    ...(homeroom ? [I("행발", "/homeroom/behavior", "book"), I("봉사 받은함", "/homeroom/service", "shield")] : []),
    I("내 교과·과목", "/teacher/subjects", "list"),
    I("내 동아리", "/teacher/club", "users"),
  ] };
  const groups: NavGroup[] = [];
  if (homeroom) {
    groups.push(
      { label: "우리 반", items: [I("우리 반 홈", "/homeroom", "home"), I("학생 기록", "/homeroom/students", "users"), I("받은 초안", "/homeroom/drafts", "file")] },
      { label: "관리", items: [I("성적 업로드", "/homeroom/scores", "chart"), I("수능 최저", "/homeroom/minimum", "target"), I("야간 자율학습", "/homeroom/night", "moon")] },
    );
  }
  if (!tuck) groups.push(work, students);
  if (admin) {
    groups.push({ label: "관리자", items: [
      I("관리 현황", "/admin", "home"),
      I("오류 처리", "/admin/errors", "alert"),
      I("초안 생성 현황", "/admin/pipeline", "refresh"),
      I("계정 관리", "/admin/accounts", "users"),
      I("과목 개설", "/admin/offerings", "list"),
      I("편제표", "/admin/curriculum", "list"),
      I("감사 로그", "/admin/audit", "shield"),
    ] });
  }
  groups.push(more);
  return groups;
}

/** 모바일 하단 탭 (5개) — Figma 각 역할 모바일 시안의 탭 그대로 */
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
  const r = v.teacher.roles;
  if (r.includes("admin")) {
    return [
      { label: "홈", href: "/teacher", icon: "home" },
      { label: "오류", href: "/admin/errors", icon: "alert" },
      { label: "계정", href: "/admin/accounts", icon: "users" },
      { label: "과목", href: "/admin/offerings", icon: "list" },
      { label: "MY", href: "/me", icon: "user" },
    ];
  }
  if (r.includes("homeroom")) {
    return [
      { label: "홈", href: "/homeroom", icon: "home" },
      { label: "학생", href: "/homeroom/students", icon: "users" },
      { label: "초안", href: "/homeroom/drafts", icon: "file" },
      { label: "최저", href: "/homeroom/minimum", icon: "target" },
      { label: "야자", href: "/homeroom/night", icon: "moon" },
    ];
  }
  return [
    { label: "홈", href: "/teacher", icon: "home" },
    { label: "초안", href: "/teacher/drafts", icon: "file" },
    { label: "프로그램", href: "/teacher/programs", icon: "clipboard" },
    { label: "학생", href: "/students", icon: "users" },
    { label: "내 정보", href: "/me", icon: "user" },
  ];
}
