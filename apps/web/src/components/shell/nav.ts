import type { Viewer } from "@/lib/domain/types";

// 역할별 메뉴. 교사는 역할이 여러 개면 그룹이 합쳐진다 (관리자 = 모든 권한 교사).
export type IconName =
  | "home" | "file" | "clipboard" | "users" | "chat" | "userPlus" | "chart" | "target" | "moon"
  | "book" | "bookmark" | "sparkle" | "list" | "alert" | "refresh" | "shield" | "user" | "calendar" | "presentation" | "send" | "share" | "layers" | "grid" | "lock" | "pencil" | "plus";

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
  // 교사 사이드바 (Figma N52 → N53, 2026-10-21): 홈(묶음 밖) · 업무 · 세특 · 동아리 · 특색활동 · 담임 · 관리.
  // 기록 묶음은 늘 "내 ~ · 조각 모으기 · 글 짓기 · 글 모아 보기". 특색활동은 내 프로그램 · 새 프로그램 · 초안 검토(배지) · 프로그램 일정 · 봉사 확인서.
  // 공동교육과정은 메뉴 대신 내 수업 안 카드(N54, /teacher/joint 는 운영 안내로 남김).
  // 세특은 교과 교사, 담임은 담임, 관리는 관리자만. 담임 전용 기능(학생 기록 · 봉사 받은함 · 성적 · 최저 · 야자)은 업무 끝에.
  // 순서는 사람마다 바꿀 수 있다(arrangeMenus, N53). 여기 순서가 "처음대로".
  const r = v.teacher.roles;
  const homeroom = r.includes("homeroom") && !!v.teacher.homeroom;
  const admin = r.includes("admin");
  const I = (label: string, href: string, icon: IconName): NavItem => ({ label, href, icon, ready: true });
  // 담임(관리자 아님)은 우리 반 홈이 첫 화면
  const home = homeroom && !admin ? "/homeroom" : "/teacher";

  const groups: NavGroup[] = [{ label: "", items: [I("홈", home, "home")] }];
  groups.push({ label: "업무", items: [
    I("학사일정", "/schedule", "calendar"),
    I("나이스 입력", "/teacher/neis", "send"),
    I("담당 학생", "/students", "users"),
    I("상담 기록", "/teacher/counseling", "chat"),
    I("학생 등록", "/students/new", "userPlus"),
    I("문장 보관함", "/teacher/library", "bookmark"),
    ...(homeroom ? [
      I("학생 기록", "/homeroom/students", "users"),
      I("봉사 받은함", "/homeroom/service", "shield"),
      I("성적 업로드", "/homeroom/scores", "chart"),
      I("수능 최저", "/homeroom/minimum", "target"),
      I("야간 자율학습", "/homeroom/night", "moon"),
    ] : []),
  ] });
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
  // 초안 검토(/teacher/drafts)는 검토할 초안이 남은 첫 프로그램의 초안 검토 탭으로 넘긴다. 배지 = 검토 대기 수
  groups.push({ label: "특색활동", items: [
    I("내 프로그램", "/teacher/programs", "clipboard"),
    I("새 프로그램", "/teacher/programs/new", "plus"),
    I("초안 검토", "/teacher/drafts", "file"),
    I("프로그램 일정", "/teacher/programs?view=calendar", "calendar"),
    I("봉사 확인서", "/teacher/service", "shield"),
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

// ---------- 지금 화면 메뉴 ----------

function isActive(path: string, href: string) {
  href = href.split("?")[0];
  return path === href || (href !== "/" && path.startsWith(href + "/") && href.split("/").length > 2);
}

/** 지금 화면에 맞는 메뉴 하나: 주소가 더 길게 맞는 것, 같으면 쿼리(?tab= · ?view=)까지 맞는 것 */
export function activeHref(path: string, search: URLSearchParams, hrefs: string[]): string | null {
  let best: string | null = null;
  let score = -1;
  for (const h of hrefs) {
    if (!isActive(path, h)) continue;
    const q = new URLSearchParams(h.split("?")[1] ?? "");
    let hit = 0;
    let miss = 0;
    q.forEach((v, k) => { if (search.get(k) === v) hit++; else miss++; });
    // 쿼리가 하나라도 어긋나면 쿼리 없는 메뉴보다 뒤로
    const s = h.split("?")[0].length * 100 + (miss ? -50 - miss : hit * 10);
    if (s > score) { score = s; best = h; }
  }
  return best;
}

// ---------- 메뉴 순서 바꾸기 (Figma N53) ----------
// 내가 바꾼 순서 = 묶음 이름 순서 + 묶음마다 메뉴 주소 순서. 메뉴는 다른 묶음으로도 옮길 수 있다.
// 머리 없는 묶음(홈)은 늘 맨 위에 그대로. 저장한 뒤 새로 생긴 메뉴 · 묶음은 처음 자리(묶음 끝 · 맨 끝)에 붙는다.

export type MenuLayout = { label: string; items: string[] }[];

/** 지금 메뉴 묶음을 저장한 순서대로 다시 놓는다. 없어진 묶음에 있던 메뉴는 처음 묶음으로 돌아간다 */
export function arrangeMenus(groups: NavGroup[], layout: MenuLayout | null | undefined): NavGroup[] {
  if (!layout?.length) return groups;
  const top = groups.filter((g) => !g.label);
  const rest = groups.filter((g) => g.label);
  const item = new Map(rest.flatMap((g) => g.items.map((it) => [it.href, it] as const)));
  const home = new Map(rest.flatMap((g) => g.items.map((it) => [it.href, g.label] as const)));
  const known = new Set(rest.map((g) => g.label));
  const saved = layout.map((g) => g.label);
  const order = [...new Set(saved.filter((l) => known.has(l))), ...rest.map((g) => g.label).filter((l) => !saved.includes(l))];
  const placed = new Set<string>();
  const out = new Map<string, NavItem[]>(order.map((l) => [l, []]));
  for (const g of layout) {
    const list = out.get(g.label);
    if (!list) continue;
    for (const h of g.items) {
      const it = item.get(h);
      if (it && !placed.has(h)) { list.push(it); placed.add(h); }
    }
  }
  for (const g of rest) for (const it of g.items) if (!placed.has(it.href)) out.get(home.get(it.href)!)!.push(it);
  const base = new Map(rest.map((g) => [g.label, g]));
  return [...top, ...order.map((l) => ({ ...base.get(l)!, items: out.get(l)! })).filter((g) => g.items.length)];
}

/** 화면에 보이는 묶음 → 저장할 순서 */
export const layoutOf = (groups: Pick<NavGroup, "label" | "items">[]): MenuLayout =>
  groups.filter((g) => g.label).map((g) => ({ label: g.label, items: g.items.map((it) => it.href) }));

/** 받은 순서를 내 메뉴에 있는 묶음 · 메뉴만 남겨 정리한다(서버 저장 전). 처음 순서와 같으면 null */
export function cleanLayout(raw: unknown, groups: NavGroup[]): MenuLayout | null {
  if (!Array.isArray(raw)) return null;
  const labels = new Set(groups.filter((g) => g.label).map((g) => g.label));
  const hrefs = new Set(groups.filter((g) => g.label).flatMap((g) => g.items).map((it) => it.href));
  const seenL = new Set<string>();
  const seenH = new Set<string>();
  const out: MenuLayout = [];
  for (const g of raw.slice(0, 20) as { label?: unknown; items?: unknown }[]) {
    const label = typeof g?.label === "string" ? g.label : "";
    if (!labels.has(label) || seenL.has(label) || !Array.isArray(g.items)) continue;
    seenL.add(label);
    const items: string[] = [];
    for (const h of g.items as unknown[]) if (typeof h === "string" && hrefs.has(h) && !seenH.has(h) && items.length < 100) { seenH.add(h); items.push(h); }
    out.push({ label, items });
  }
  const same = JSON.stringify(layoutOf(arrangeMenus(groups, out))) === JSON.stringify(layoutOf(groups));
  return out.length && !same ? out : null;
}

/** 메뉴를 to 묶음의 index 자리로 옮긴다(같은 묶음 안 · 묶음 사이). index 는 옮기기 전 목록 기준 */
export function moveItem(layout: MenuLayout, href: string, to: string, index: number): MenuLayout {
  const from = layout.find((g) => g.items.includes(href));
  if (!from || !layout.some((g) => g.label === to)) return layout;
  const at = from.items.indexOf(href);
  const next = layout.map((g) => ({ ...g, items: g.items.filter((h) => h !== href) }));
  const dest = next.find((g) => g.label === to)!;
  const i = from.label === to && at < index ? index - 1 : index;
  dest.items.splice(Math.max(0, Math.min(i, dest.items.length)), 0, href);
  return next;
}

/** 묶음을 index 자리로 (옮기기 전 목록 기준) */
export function moveGroup(layout: MenuLayout, label: string, index: number): MenuLayout {
  const at = layout.findIndex((g) => g.label === label);
  if (at < 0) return layout;
  const next = layout.filter((g) => g.label !== label);
  next.splice(Math.max(0, Math.min(at < index ? index - 1 : index, next.length)), 0, layout[at]);
  return next;
}

/** ↑ ↓ 한 칸: 묶음 첫 메뉴의 ↑ 는 앞 묶음 끝으로, 마지막 메뉴의 ↓ 는 다음 묶음 처음으로 */
export function stepItem(layout: MenuLayout, href: string, dir: -1 | 1): MenuLayout {
  const gi = layout.findIndex((g) => g.items.includes(href));
  if (gi < 0) return layout;
  const i = layout[gi].items.indexOf(href);
  if (dir < 0 && i > 0) return moveItem(layout, href, layout[gi].label, i - 1);
  if (dir > 0 && i < layout[gi].items.length - 1) return moveItem(layout, href, layout[gi].label, i + 2);
  const other = layout[gi + dir];
  if (!other) return layout;
  return moveItem(layout, href, other.label, dir < 0 ? other.items.length : 0);
}

export function stepGroup(layout: MenuLayout, label: string, dir: -1 | 1): MenuLayout {
  const i = layout.findIndex((g) => g.label === label);
  if (i < 0 || !layout[i + dir]) return layout;
  return moveGroup(layout, label, dir < 0 ? i - 1 : i + 2);
}

// 순서 바꾸기 화면(사이드바 · 내 정보 카드)에 넘기는 모양
export type ArrangeItem = { label: string; href: string; icon: IconName };
export type ArrangeGroup = { label: string; items: ArrangeItem[] };

/** 보내기 쉬운 모양으로 (배지 · 준비 중 같은 표시는 뺀다) */
export const plainGroups = (groups: { label: string; items: ArrangeItem[] }[]): ArrangeGroup[] =>
  groups.filter((g) => g.label).map((g) => ({ label: g.label, items: g.items.map(({ label, href, icon }) => ({ label, href, icon })) }));

/** 순서(주소만) → 묶음(이름 · 아이콘 포함) */
export function rebuild(groups: ArrangeGroup[], layout: MenuLayout): ArrangeGroup[] {
  const items = new Map(groups.flatMap((g) => g.items.map((it) => [it.href, it] as const)));
  return layout.map((g) => ({ label: g.label, items: g.items.map((h) => items.get(h)!).filter(Boolean) }));
}

/** 숨긴 메뉴는 화면에서 빠진 채 옮겼으니, 저장할 때 원래 묶음 · 자리 근처로 다시 끼운다 */
export function withHidden(edited: MenuLayout, all: ArrangeGroup[], hidden: string[]): MenuLayout {
  const h = new Set(hidden);
  return edited.map((g) => {
    const items = [...g.items];
    all.find((x) => x.label === g.label)?.items.forEach((it, i) => { if (h.has(it.href)) items.splice(Math.min(i, items.length), 0, it.href); });
    return { label: g.label, items };
  });
}

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
  "/teacher/programs": ["설문", "특색 활동", "프로젝트"],
  "/teacher/programs/new": ["프로그램 만들기", "설문 만들기"],
  "/teacher/drafts": ["초안", "검토", "특색 활동 초안"],
  "/teacher/programs?view=calendar": ["캘린더", "달력", "일정"],
  "/teacher/service": ["봉사"],
  "/teacher/subjects": ["편제표", "이동반", "분반", "과목", "공동교육과정", "다른 학교", "타교", "온라인 공동"],
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
