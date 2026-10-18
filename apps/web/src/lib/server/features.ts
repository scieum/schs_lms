import "server-only";

// 기능 잠금 (2026-10-18 사용자: "개인정보 관련해서 성적은 민감해서 기능들을 일단 락해놓자").
// 성적 업로드 · 수능 최저 · 학생 성적·최저 화면과 홈·학생 상세의 성적 숫자를 잠근다. 이미 올린 자료는 지우지 않는다.
// 다시 열려면 서버 환경변수 FEATURE_SCORES=on (Vercel 환경변수) 후 재배포.

export const scoresEnabled = (): boolean => process.env.FEATURE_SCORES === "on";

/** 잠근 기능의 주소 (사이드바·탭·메뉴·영랑이 안내에서 뺀다) */
export const SCORE_PATHS = ["/homeroom/scores", "/homeroom/minimum", "/student/scores"];
export const isScorePath = (href: string) => SCORE_PATHS.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));

type Item = { href: string; label: string; icon: string };

/** 잠근 기능을 메뉴 묶음에서 뺀다 (사이드바·메뉴 화면·설정·담임 탭) */
export function withoutLocked<G extends { items: Item[] }>(groups: G[]): G[] {
  if (scoresEnabled()) return groups;
  return groups.map((g) => ({ ...g, items: g.items.filter((it) => !isScorePath(it.href)) })).filter((g) => g.items.length);
}

/** 하단 탭: 잠근 탭(학생 '성적')은 학사일정으로 바꾼다 */
export function tabsWithoutLocked<T extends Item>(tabs: T[]): T[] {
  if (scoresEnabled()) return tabs;
  return tabs.map((t) => (isScorePath(t.href) ? ({ ...t, label: "일정", href: "/schedule", icon: "calendar" } as T) : t));
}
