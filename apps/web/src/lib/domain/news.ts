// 신기능 안내 창 (N75 · N76, 2026-10-26 "처음 들어간 분들을 위해 로그인하면 홈 화면에 팝업 … 일주일 동안 안 보이게" ·
// "나이스 전송과 관련한 팝업창도 안내용으로 하나"): 교사 홈에 안내 창 하나를 띄우고, 여러 기능은 장을 넘겨 본다(팝업을 겹쳐 띄우지 않는다).
// 새 기능을 내면 NEWS 의 slides 와 id 를 바꾼다(id 가 바뀌면 숨김 기록과 상관없이 다시 뜬다).
// [닫기] = 이번 접속(탭)에서만 숨김 → 다음 로그인 때 다시. 일주일 체크 후 닫기 · [버튼] = 7일 숨김. 기록은 이 브라우저에만.

export type NewsSlide = {
  /** 그림 칸 모양 (news-popup.tsx) */
  art: "voice" | "neis";
  area: string;
  title: [string, string];
  steps: string[];
  /** 모바일에서만 보이는 한 줄 (예: PC에서만 쓰는 기능) */
  mobileNote?: string;
  cta: { label: string; href: string };
};

export type News = {
  id: string;
  /** 이 날(포함)이 지나면 띄우지 않는다 "YYYY-MM-DD" */
  until: string;
  slides: NewsSlide[];
};

export const NEWS: News | null = {
  id: "2026-10-voice-neis",
  until: "2026-12-31",
  slides: [
    {
      art: "voice",
      area: "조각 모으기",
      title: ["발표를 녹음하면", "글로 받아 적어요"],
      steps: ["녹음", "받아쓰기", "조각으로 남기기"],
      cta: { label: "녹음 써 보기", href: "/teacher/setuk/collect?mode=voice" },
    },
    {
      art: "neis",
      area: "나이스 입력",
      title: ["확정한 기록을", "나이스에 한 번에 채워요"],
      steps: ["버튼 달기", "복사", "나이스에서 누르기"],
      mobileNote: "PC 크롬에서 써요",
      cta: { label: "나이스 입력 열기", href: "/teacher/neis" },
    },
  ],
};

export const HIDE_DAYS = 7;
export const newsKey = (id: string) => `schs-news:${id}`;

/** 숨김 기록(만료 시각 ms 또는 null)과 지금으로 띄울지 */
export function showNews(news: News | null, today: string, hiddenUntil: number | null, now: number): news is News {
  if (!news || !news.slides.length || today > news.until) return false;
  return hiddenUntil == null || !Number.isFinite(hiddenUntil) || now >= hiddenUntil;
}

export const hideUntil = (now: number, days = HIDE_DAYS) => now + days * 24 * 60 * 60 * 1000;

/** 장 넘기기: 끝에서 멈춘다 (돌아가지 않는다) */
export const turnPage = (page: number, by: number, count: number) => Math.min(count - 1, Math.max(0, page + by));
