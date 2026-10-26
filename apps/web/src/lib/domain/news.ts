// 신기능 안내 창 (N75, 2026-10-26 "처음 들어간 분들을 위해 로그인하면 홈 화면에 팝업 … 일주일 동안 안 보이게"):
// 교사 홈에 지금 안내 하나를 띄운다. 새 기능을 내면 NEWS 를 바꾼다(id 가 바뀌면 숨김 기록과 상관없이 다시 뜬다).
// [닫기] = 이번 접속(탭)에서만 숨김 → 다음 로그인 때 다시. 일주일 체크 후 닫기 · [써 보기] = 7일 숨김. 기록은 이 브라우저에만.

export type News = {
  id: string;
  /** 이 날(포함)이 지나면 띄우지 않는다 "YYYY-MM-DD" */
  until: string;
  area: string;
  title: [string, string];
  steps: string[];
  cta: { label: string; href: string };
};

export const NEWS: News | null = {
  id: "2026-10-voice",
  until: "2026-12-31",
  area: "조각 모으기",
  title: ["발표를 녹음하면", "글로 받아 적어요"],
  steps: ["녹음", "받아쓰기", "조각으로 남기기"],
  cta: { label: "녹음 써 보기", href: "/teacher/setuk/collect?mode=voice" },
};

export const HIDE_DAYS = 7;
export const newsKey = (id: string) => `schs-news:${id}`;

/** 숨김 기록(만료 시각 ms 또는 null)과 지금으로 띄울지 */
export function showNews(news: News | null, today: string, hiddenUntil: number | null, now: number): news is News {
  if (!news || today > news.until) return false;
  return hiddenUntil == null || !Number.isFinite(hiddenUntil) || now >= hiddenUntil;
}

export const hideUntil = (now: number, days = HIDE_DAYS) => now + days * 24 * 60 * 60 * 1000;
