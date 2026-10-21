import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "bookmark" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user" | "calendar" | "presentation" | "send" | "share" | "layers" | "grid" | "lock" | "pencil";

export interface NavItem { label: string; href: string; icon: IconName; ready?: boolean; badge?: number; /** 탭: 이 경로로 시작하면 켜짐 */ match?: string[] }
/** 사이드바 숫자 배지 (Figma: 프로그램 12 = 검토 대기 초안, 오류 처리 2, 설문·서류 제출 2) — href 기준 */
export type NavBadges = Record<string, number>;
/** fold: 처음에 접어 두는 묶음. label 이 빈 묶음은 머리 없이 맨 위에 둔다(홈) */
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
  // 교사 사이드바 (Figma N52, 2026-10-20): 홈(묶음 밖) · 세특 · 동아리 · 담임 · 특색활동 · 업무 · 관리.
  // 기록 묶음은 늘 "내 ~ · 조각 모으기 · 글 짓기 · 글 모아 보기". 초안 검토는 프로그램 안 탭이라 메뉴에 없다(배지는 프로그램에).
  // 세특은 교과 교사, 담임은 담임, 관리는 관리자만. 담임 전용 기능(학생 기록 · 봉사 받은함 · 성적 · 최저 · 야자)은 업무 끝에.
  const r = v.teacher.roles;
  const homeroom = r.includes("homeroom") && !!v.teacher.homeroom;
  const admin = r.includes("admin");
  const I = (label: string, href: string, icon: IconName): NavItem => ({ label, href, icon, ready: true });
  // 담임(관리자 아님)은 우리 반 홈이 첫 화면
  const home = homeroom && !admin ? "/homeroom" : "/teacher";

  const groups: NavGroup[] = [{ label: "", items: [I("홈", home, "home")] }];
  if (r.includes("subject") || admin) {
    groups.push({ label: "세특", items: [
      I("내 수업", "/teacher/subjects", "presentation"),
      I("조각 모으기", "/teacher/setuk/collect", "layers"),
      I("글 짓기", "/teacher/setuk/compose", "pencil"),
      I("글 모아 보기", "/teacher/texts?tab=setuk", "list"),
    ] });
  }
  groups.push({ label: "동아리", items: [
    I("내 동아리", "/teacher/club", "users"),
    I("조각 모으기", "/teacher/club/collect", "layers"),
    I("글 짓기", "/teacher/club/compose", "pencil"),
    I("글 모아 보기", "/teacher/texts?tab=record&area=동아리", "list"),
  ] });
  if (homeroom) {
    groups.push({ label: "담임", items: [
      ...(home !== "/homeroom" ? [I("우리 반 홈", "/homeroom", "home")] : []),
      I("누가기록", "/homeroom/logs", "layers"),
      I("글 짓기", "/homeroom/compose", "pencil"),
      I("받은 초안", "/homeroom/drafts", "file"),
      I("글 모아 보기", "/teacher/texts?tab=behavior", "list"),
    ] });
  }
  groups.push({ label: "특색활동", items: [I("프로그램", "/teacher/programs", "clipboard")] });
  groups.push({ label: "업무", fold: true, items: [
    I("학사일정", "/schedule", "calendar"),
    I("나이스 입력", "/teacher/neis", "send"),
    I("봉사 확인서", "/teacher/service", "shield"),
    I("담당 학생", "/students", "users"),
    I("상담 기록", "/teacher/counseling", "chat"),
    I("학생 등록", "/students/new", "userPlus"),
    I("공동교육과정", "/teacher/joint", "share"),
    I("문장 보관함", "/teacher/library", "bookmark"),
    ...(homeroom ? [
      I("학생 기록", "/homeroom/students", "users"),
      I("봉사 받은함", "/homeroom/service", "shield"),
      I("성적 업로드", "/homeroom/scores", "chart"),
      I("수능 최저", "/homeroom/minimum", "target"),
      I("야간 자율학습", "/homeroom/night", "moon"),
    ] : []),
  ] });
  if (admin) {
    groups.push({ label: "관리", fold: true, items: [
      I("관리 현황", "/admin", "refresh"),
      I("오류 처리", "/admin/errors", "alert"),
      I("초안 생성 현황", "/admin/pipeline", "refresh"),
      I("학생부 점검", "/admin/record-report", "chart"),
      I("자료 보존", "/admin/retention", "lock"),
      I("계정 관리", "/admin/accounts", "users"),
      I("과목 개설", "/admin/offerings", "list"),
      I("편제표", "/admin/curriculum", "list"),
      I("감사 로그", "/admin/audit", "shield"),
    ] });
  }
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
  // 교사 탭 (N52): 조각 · 글 짓기 · 홈 · (특색 | 담임 | 관리) · 메뉴. 조각 · 글 짓기는 세특이 있으면 세특, 아니면 담임 → 동아리
  const r = v.teacher.roles;
  const homeroom = r.includes("homeroom") && !!v.teacher.homeroom;
  const subject = r.includes("subject");
  const write: NavItem[] = [
    { label: "조각", href: subject ? "/teacher/setuk/collect" : homeroom ? "/homeroom/logs" : "/teacher/club/collect", icon: "layers", match: ["/teacher/setuk/collect", "/teacher/club/collect", "/homeroom/logs"] },
    { label: "글 짓기", href: subject ? "/teacher/setuk/compose" : homeroom ? "/homeroom/compose" : "/teacher/club/compose", icon: "pencil", match: ["/teacher/setuk/compose", "/teacher/club/compose", "/homeroom/compose"] },
  ];
  if (r.includes("admin")) {
    return [...write, { label: "홈", href: "/teacher", icon: "home" }, { label: "관리", href: "/admin", icon: "shield", match: ["/admin"] }, MENU_TAB];
  }
  if (homeroom) {
    // 담임 기능은 "담임" 탭 하나로 묶는다 (/homeroom/menu)
    return [...write, { label: "홈", href: "/homeroom", icon: "home" }, { label: "담임", href: "/homeroom/menu", icon: "users", match: ["/homeroom/menu", "/homeroom/drafts", "/homeroom/students", "/homeroom/service", "/homeroom/scores", "/homeroom/minimum", "/homeroom/night"] }, MENU_TAB];
  }
  return [...write, { label: "홈", href: "/teacher", icon: "home" }, { label: "특색", href: "/teacher/programs", icon: "clipboard" }, MENU_TAB];
}

/** 담임 탭 메뉴 (/homeroom/menu, N52): 담임 묶음 + 업무 끝의 담임 전용 메뉴 */
export const HOMEROOM_MENU: { label: string; items: NavItem[] }[] = [
  { label: "담임", items: [
    { label: "누가기록", href: "/homeroom/logs", icon: "layers" },
    { label: "글 짓기", href: "/homeroom/compose", icon: "pencil" },
    { label: "받은 초안", href: "/homeroom/drafts", icon: "file" },
    { label: "글 모아 보기", href: "/teacher/texts?tab=behavior", icon: "list" },
  ] },
  { label: "우리 반 업무", items: [
    { label: "학생 기록", href: "/homeroom/students", icon: "users" },
    { label: "봉사 받은함", href: "/homeroom/service", icon: "shield" },
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
// 메뉴 이름에 없는 말로도 찾게 한다. 예: "세특" → 세특 글 짓기 · 조각 모으기 · 나이스 입력, "초안 검토" → 프로그램
export const MENU_KEYWORDS: Record<string, string[]> = {
  "/teacher/setuk/compose": ["세특", "교과", "합치기", "1500바이트"],
  "/teacher/setuk/collect": ["조각", "메모", "관찰", "세특"],
  "/teacher/club/compose": ["동아리 특기사항", "창체"],
  "/teacher/club/collect": ["누가기록", "동아리", "관찰"],
  "/homeroom/compose": ["행발", "행동특성", "종합의견", "자율", "진로", "창체"],
  "/homeroom/logs": ["관찰", "기록", "자율", "진로"],
  "/teacher/neis": ["세특 붙여넣기", "나이스", "내보내기"],
  "/teacher/texts?tab=setuk": ["모아 보기", "1500바이트", "확정본", "세특 모음"],
  "/teacher/texts?tab=behavior": ["모아 보기", "행발", "누가기록", "확정본"],
  "/teacher/counseling": ["상담"],
  "/teacher/programs": ["설문", "특색 활동", "프로젝트", "초안 검토", "초안", "검토"],
  "/teacher/service": ["봉사"],
  "/teacher/subjects": ["편제표", "이동반", "분반", "과목"],
  "/teacher/joint": ["학교 간", "온라인"],
  "/teacher/club": ["동아리 명단"],
  "/schedule": ["일정", "달력", "급식"],
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
