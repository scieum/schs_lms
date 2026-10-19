// 기재요령 인용 모음 (quote bank · Figma N43) — 데이터와 꺼내 쓰기만. 검색·이 글에서 찾기는 guide-bank.ts.
// 원문은 「2026 학교생활기록부 기재요령(고)」 PDF에서 그대로 옮겼고, scripts/verify-guide-bank.mjs 로 PDF 글과 대조한다.
// N34 금칙어 근거(forbidden.ts)도 여기서 id로 꺼내 쓴다 — 같은 원문을 두 곳에 두지 않는다.

import data from "./guide-bank.json";

export type GuideSection = "작성 시 유의사항" | "교과학습발달상황" | "창의적 체험활동" | "행동특성 및 종합의견" | "분량";
export type GuideVerdict = "불가" | "가능" | "조건";

export interface GuideEntry {
  id: string;
  /** 인쇄 쪽 번호 (N34 칩 "2026 기재요령 18쪽") */
  page: number;
  /** PDF 파일의 쪽 (원문 PDF 링크 #page=) */
  pdfPage: number;
  section: GuideSection;
  /** 원문의 장 이름 ("01 학교생활기록부 작성 시 유의사항") */
  heading: string;
  /** 짧은 주제 이름 */
  topic: string;
  verdict: GuideVerdict;
  /** 짧은 답 (~요체) */
  short: string;
  /** 설명 한 줄 */
  note?: string;
  /** 원문 그대로 (줄임은 "(…)"만) */
  quote: string;
  /** 자주 묻는 말 · 동의어 */
  questions: string[];
  keywords: string[];
  /** 이 글에서 찾기 — forbidden.ts 규칙 id 또는 guide-bank.ts FIND_EXTRA id */
  find?: string[];
}

export interface GuideBank {
  edition: string;
  title: string;
  source: string;
  verified: { pdfSha256: string; at: string; entries: number } | null;
  entries: GuideEntry[];
}

export const GUIDE: GuideBank = data as GuideBank;
export const GUIDE_URL = GUIDE.source;
const byId = new Map(GUIDE.entries.map((e) => [e.id, e]));

export function guideEntry(id: string): GuideEntry | undefined {
  return byId.get(id);
}

/** "2026 기재요령 18쪽" */
export const guideSource = (e: Pick<GuideEntry, "page">) => `${GUIDE.edition.slice(0, 4)} 기재요령 ${e.page}쪽`;
