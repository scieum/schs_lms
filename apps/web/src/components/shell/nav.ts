import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user" | "calendar" | "presentation" | "send" | "share";

export interface NavItem { label: string; href: string; icon: IconName; ready?: boolean; badge?: number; /** 탭: 이 경로로 시작하면 켜짐 */ match?: string[] }
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
        { label: "학사일정", href: "/schedule", icon: "calendar", ready: true },
      ] },
      { label: "신청", items: [
        { label: "추천 활동", href: "/student/recs", icon: "sparkle", ready: true },
        { label: "야자 신청", href: "/student/night", icon: "moon", ready: true },
        { label: "과목 신청", href: "/student/courses", icon: "list", ready: true },
      ] },
    ];
  }
  // 교사 사이드바: 업무 · 수업 · 학생 · 관리 (2026-10-17 사용자 결정).
  // 관리는 담임이면 우리 반 기능, 관리자면 관리자 기능까지. 담임이 아니고 관리자도 아니면 관리 묶음이 없다.
  const r = v.teacher.roles;
  const homeroom = r.includes("homeroom") && !!v.teacher.homeroom;
  const admin = r.includes("admin");
  const I = (label: string, href: string, icon: IconName): NavItem => ({ label, href, icon, ready: true });
  // 담임(관리자 아님)은 우리 반 홈이 첫 화면
  const home = homeroom && !admin ? "/homeroom" : "/teacher";

  const groups: NavGroup[] = [
    { label: "업무", items: [
      I("홈", home, "home"),
      I("학사일정", "/schedule", "calendar"),
      I("초안 검토", "/teacher/drafts", "file"),
      I("나이스 입력", "/teacher/neis", "send"),
      I("프로그램", "/teacher/programs", "clipboard"),
      I("봉사 확인서", "/teacher/service", "shield"),
    ] },
    { label: "수업", items: [
      I("내 수업", "/teacher/subjects", "presentation"),
      I("교과 세특", "/teacher/setuk", "book"),
      I("AI 기록 쓰기", "/teacher/write", "sparkle"),
      I("내 동아리", "/teacher/club", "users"),
      I("공동교육과정", "/teacher/joint", "share"),
    ] },
    { label: "학생", items: [
      I("담당 학생", "/students", "users"),
      I("상담 기록", "/teacher/counseling", "chat"),
      I("누가기록", "/teacher/logs", "file"),
      I("학생 등록", "/students/new", "userPlus"),
    ] },
  ];
  const manage: NavItem[] = [];
  if (homeroom) {
    if (home !== "/homeroom") manage.push(I("우리 반 홈", "/homeroom", "home"));
    manage.push(
      I("학생 기록", "/homeroom/students", "users"),
      I("받은 초안", "/homeroom/drafts", "file"),
      I("행발", "/homeroom/behavior", "book"),
      I("봉사 받은함", "/homeroom/service", "shield"),
      I("성적 업로드", "/homeroom/scores", "chart"),
      I("수능 최저", "/homeroom/minimum", "target"),
      I("야간 자율학습", "/homeroom/night", "moon"),
    );
  }
  if (admin) {
    manage.push(
      I("관리 현황", "/admin", "refresh"),
      I("오류 처리", "/admin/errors", "alert"),
      I("초안 생성 현황", "/admin/pipeline", "refresh"),
      I("계정 관리", "/admin/accounts", "users"),
      I("과목 개설", "/admin/offerings", "list"),
      I("편제표", "/admin/curriculum", "list"),
      I("감사 로그", "/admin/audit", "shield"),
    );
  }
  if (manage.length) groups.push({ label: homeroom && !admin ? "관리 · 우리 반" : "관리", items: manage });
  return groups;
}

/** 모바일 하단 탭 (5개). 가운데(3번째)는 언제나 홈 (2026-10-17 사용자 결정) */
export function tabsFor(v: Viewer): NavItem[] {
  if (v.kind === "student") {
    return [
      { label: "제출", href: "/student/submit", icon: "clipboard" },
      { label: "성적", href: "/student/scores", icon: "chart" },
      { label: "홈", href: "/student", icon: "home" },
      { label: "생기부", href: "/student/record", icon: "book" },
      { label: "MY", href: "/me", icon: "user" },
    ];
  }
  const r = v.teacher.roles;
  const draftsAndPrograms: NavItem[] = [
    { label: "초안", href: "/teacher/drafts", icon: "file" },
    { label: "프로그램", href: "/teacher/programs", icon: "clipboard" },
  ];
  if (r.includes("admin")) {
    return [...draftsAndPrograms, { label: "홈", href: "/teacher", icon: "home" }, { label: "관리", href: "/admin", icon: "shield", match: ["/admin"] }, { label: "MY", href: "/me", icon: "user" }];
  }
  if (r.includes("homeroom") && v.teacher.homeroom) {
    // 담임 기능(학생 기록·받은 초안·성적·최저·야자·행발·봉사)은 "담임" 탭 하나로 묶는다
    return [...draftsAndPrograms, { label: "홈", href: "/homeroom", icon: "home" }, { label: "담임", href: "/homeroom/menu", icon: "users", match: ["/homeroom/"] }, { label: "MY", href: "/me", icon: "user" }];
  }
  return [...draftsAndPrograms, { label: "홈", href: "/teacher", icon: "home" }, { label: "학생", href: "/students", icon: "users" }, { label: "MY", href: "/me", icon: "user" }];
}

/** 담임 탭 메뉴 (/homeroom/menu) */
export const HOMEROOM_MENU: { label: string; items: NavItem[] }[] = [
  { label: "우리 반", items: [
    { label: "학생 기록", href: "/homeroom/students", icon: "users" },
    { label: "받은 초안", href: "/homeroom/drafts", icon: "file" },
    { label: "행발", href: "/homeroom/behavior", icon: "book" },
    { label: "봉사 받은함", href: "/homeroom/service", icon: "shield" },
  ] },
  { label: "관리", items: [
    { label: "성적 업로드", href: "/homeroom/scores", icon: "chart" },
    { label: "수능 최저", href: "/homeroom/minimum", icon: "target" },
    { label: "야간 자율학습", href: "/homeroom/night", icon: "moon" },
  ] },
];
