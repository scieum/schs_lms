import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "bookmark" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user" | "calendar" | "presentation" | "send" | "share" | "layers" | "grid" | "lock";

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
      I("글 모아 보기", "/teacher/texts", "list"),
      I("내 동아리", "/teacher/club", "users"),
      I("공동교육과정", "/teacher/joint", "share"),
      I("문장 보관함", "/teacher/library", "bookmark"),
    ] },
    { label: "학생", items: [
      I("담당 학생", "/students", "users"),
      I("상담 기록", "/teacher/counseling", "chat"),
      I("누가기록", "/teacher/logs", "file"),
      I("생기부 조각", "/teacher/pieces", "layers"),
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
      I("학생부 점검", "/admin/record-report", "chart"),
      I("자료 보존", "/admin/retention", "lock"),
      I("계정 관리", "/admin/accounts", "users"),
      I("과목 개설", "/admin/offerings", "list"),
      I("편제표", "/admin/curriculum", "list"),
      I("감사 로그", "/admin/audit", "shield"),
    );
  }
  if (manage.length) groups.push({ label: homeroom && !admin ? "관리 · 우리 반" : "관리", items: manage });
  return groups;
}

/** 모바일 하단 다섯째 탭: 전체 메뉴 (Figma N15). 내 정보(/me)도 여기서 들어간다 */
const MENU_TAB: NavItem = { label: "메뉴", href: "/menu", icon: "grid", match: ["/me"] };

/** 모바일 하단 탭 (5개). 가운데(3번째)는 언제나 홈 (2026-10-17 사용자 결정), 다섯째는 메뉴 (2026-10-18) */
export function tabsFor(v: Viewer): NavItem[] {
  if (v.kind === "student") {
    return [
      { label: "제출", href: "/student/submit", icon: "clipboard" },
      { label: "성적", href: "/student/scores", icon: "chart" },
      { label: "홈", href: "/student", icon: "home" },
      { label: "생기부", href: "/student/record", icon: "book" },
      MENU_TAB,
    ];
  }
  const r = v.teacher.roles;
  const draftsAndPrograms: NavItem[] = [
    { label: "초안", href: "/teacher/drafts", icon: "file" },
    { label: "프로그램", href: "/teacher/programs", icon: "clipboard" },
  ];
  if (r.includes("admin")) {
    return [...draftsAndPrograms, { label: "홈", href: "/teacher", icon: "home" }, { label: "관리", href: "/admin", icon: "shield", match: ["/admin"] }, MENU_TAB];
  }
  if (r.includes("homeroom") && v.teacher.homeroom) {
    // 담임 기능(학생 기록·받은 초안·성적·최저·야자·행발·봉사)은 "담임" 탭 하나로 묶는다
    return [...draftsAndPrograms, { label: "홈", href: "/homeroom", icon: "home" }, { label: "담임", href: "/homeroom/menu", icon: "users", match: ["/homeroom/"] }, MENU_TAB];
  }
  return [...draftsAndPrograms, { label: "홈", href: "/teacher", icon: "home" }, { label: "학생", href: "/students", icon: "users" }, MENU_TAB];
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

// ---------- 메뉴 숨기기 (내 정보 · 설정, Figma N14) ----------
// 숨긴 메뉴는 사이드바·탭바에서만 빠진다. 주소로는 그대로 들어갈 수 있다. 홈과 내 정보는 숨길 수 없다.

export const isLockedMenu = (it: Pick<NavItem, "label" | "href">) => it.label === "홈" || it.href === "/me" || it.href === "/menu";

export function hideMenus(groups: NavGroup[], hidden: string[]): NavGroup[] {
  if (!hidden.length) return groups;
  const h = new Set(hidden);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => isLockedMenu(it) || !h.has(it.href)) }))
    .filter((g) => g.items.length);
}

export function hideTabs(tabs: NavItem[], hidden: string[]): NavItem[] {
  const h = new Set(hidden);
  return tabs.filter((t) => isLockedMenu(t) || !h.has(t.href));
}

// ---------- 전체 메뉴 검색어 (Figma N15) ----------
// 메뉴 이름에 없는 말로도 찾게 한다. 예: "세특" → 교과 세특, AI 기록 쓰기, 생기부 조각, 나이스 입력
export const MENU_KEYWORDS: Record<string, string[]> = {
  "/teacher/setuk": ["세특", "교과"],
  "/teacher/write": ["세특 초안", "창체", "특기사항", "자율", "진로", "동아리"],
  "/teacher/pieces": ["세특 조각 모아 보기", "합치기", "조각"],
  "/teacher/neis": ["세특 붙여넣기", "나이스", "내보내기"],
  "/teacher/logs": ["관찰", "기록"],
  "/teacher/texts": ["모아 보기", "1500바이트", "확정본", "세특 모음", "행발", "누가기록"],
  "/teacher/counseling": ["상담"],
  "/teacher/drafts": ["초안", "검토"],
  "/teacher/programs": ["설문", "특색 활동", "프로젝트"],
  "/teacher/service": ["봉사"],
  "/teacher/subjects": ["편제표", "이동반", "분반", "과목"],
  "/teacher/joint": ["학교 간", "온라인"],
  "/teacher/club": ["동아리 명단"],
  "/schedule": ["일정", "달력", "급식"],
  "/homeroom/behavior": ["행동특성", "종합의견"],
  "/homeroom/scores": ["모의고사", "성적"],
  "/homeroom/minimum": ["최저", "수능"],
  "/homeroom/night": ["야자", "자율학습"],
  "/homeroom/service": ["봉사"],
  "/homeroom/drafts": ["특색 활동 초안"],
  "/admin/accounts": ["교사 계정", "비밀번호 초기화"],
  "/admin/curriculum": ["편제표"],
  "/admin/audit": ["로그"],
  "/admin/record-report": ["점검 보고서", "학생부", "바이트 초과", "미작성"],
  "/admin/retention": ["보존 기간", "파기", "삭제", "개인정보"],
};
