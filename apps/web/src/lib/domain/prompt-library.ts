import { STYLE_AREAS, STYLE_LIMITS, type StyleArea } from "./writing-style";

// 프롬프트 보관함 (도구, 2026-10-22): 과목별 공식 프롬프트(관리자가 올림) · 선생님이 공개한 프롬프트(★ 별로 추천) · 내 프롬프트(나만 보기).
// "내 스타일에 넣기"로 글 짓기 내 스타일(0031)에 그대로 들어가 AI 쓰기에 쓰인다. 앱 기본 프롬프트는 읽기 전용으로 함께 보여 준다.

export const PROMPT_TABS = ["공식", "공유", "내 프롬프트"] as const;
export type PromptTab = (typeof PROMPT_TABS)[number];
export const isPromptTab = (v: unknown): v is PromptTab => (PROMPT_TABS as readonly string[]).includes(String(v));

export type PromptDoc = {
  id: string;
  /** 공식 = 관리자가 올린 학교 프롬프트, 공유 = 선생님 프롬프트(public 이면 모두에게) */
  official: boolean;
  public: boolean;
  area: StyleArea;
  /** 세특 과목 이름 (예: 화학Ⅱ) · 창체 · 행발은 null */
  subject: string | null;
  title: string;
  body: string;
  authorId: string | null;
  authorName: string;
  stars: number;
  /** 지금 선생님이 별을 줬나 */
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  /** 앱이 쓰는 기본 프롬프트 (고치기 · 별 없음) */
  builtin?: boolean;
};

export const PROMPT_LIMITS = { title: 60, body: 8000, subject: 30 } as const;
/** 내 스타일 칸에 들어갈 수 있는 길이 */
export const fitsStyle = (body: string) => body.trim().length <= STYLE_LIMITS.prompt;

export type PromptInput = { official: boolean; public: boolean; area: string; subject: string | null; title: string; body: string };

export function checkPrompt(input: PromptInput): string | null {
  if (!(STYLE_AREAS as readonly string[]).includes(input.area)) return "영역을 골라 주세요";
  const title = input.title.trim(), body = input.body.trim();
  if (title.length < 2) return "제목을 2자 이상 써 주세요";
  if (title.length > PROMPT_LIMITS.title) return `제목은 ${PROMPT_LIMITS.title}자까지예요`;
  if ((input.subject ?? "").trim().length > PROMPT_LIMITS.subject) return `과목은 ${PROMPT_LIMITS.subject}자까지예요`;
  if (body.length < 10) return "프롬프트를 10자 이상 써 주세요";
  if (body.length > PROMPT_LIMITS.body) return `프롬프트는 ${PROMPT_LIMITS.body.toLocaleString("ko-KR")}자까지예요`;
  return null;
}

/** 탭마다 보이는 글: 공식 = 학교 것(+앱 기본), 공유 = 공개된 선생님 것, 내 프롬프트 = 내가 쓴 것(공개 · 비공개) */
export function promptsOf(list: PromptDoc[], tab: PromptTab, me: string): PromptDoc[] {
  if (tab === "공식") return list.filter((p) => p.official || p.builtin);
  if (tab === "공유") return list.filter((p) => !p.official && !p.builtin && p.public);
  return list.filter((p) => !p.official && !p.builtin && p.authorId === me);
}

/** 영역 · 과목 · 찾기 거르기. 공유는 별 많은 순(같으면 최신), 공식은 학교 것 → 앱 기본, 과목 이름 순 */
export function filterPrompts(list: PromptDoc[], q: { tab: PromptTab; area?: string | null; text?: string | null }): PromptDoc[] {
  const words = (q.text ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = list
    .filter((p) => !q.area || q.area === "전체" || p.area === q.area)
    .filter((p) => words.every((w) => `${p.title} ${p.subject ?? ""} ${p.body} ${p.authorName}`.toLowerCase().includes(w)));
  if (q.tab === "공유") return out.sort((a, b) => b.stars - a.stars || b.createdAt.localeCompare(a.createdAt));
  if (q.tab === "공식") return out.sort((a, b) => Number(!!a.builtin) - Number(!!b.builtin) || STYLE_AREAS.indexOf(a.area) - STYLE_AREAS.indexOf(b.area) || (a.subject ?? "").localeCompare(b.subject ?? "", "ko"));
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 고치기 · 지우기: 쓴 선생님 · 관리자 (공식은 관리자만). 앱 기본은 아무도 */
export function canEditPrompt(p: Pick<PromptDoc, "authorId" | "official" | "builtin">, me: { id: string; admin: boolean }): boolean {
  if (p.builtin) return false;
  if (p.official) return me.admin;
  return me.admin || (!!p.authorId && p.authorId === me.id);
}
