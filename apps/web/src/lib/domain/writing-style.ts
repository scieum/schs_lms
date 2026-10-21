// 내 스타일 (Figma N58): 교사가 영역마다 저장하는 "내 프롬프트" + "레퍼런스 생기부"(최대 3개).
// 글 짓기 AI 쓰기(새로 쓰기 · 다시 쓰기 · 이어 쓰기)에서 켜면 학교 프롬프트 뒤에 붙인다 — 구조 · 문장 길이 · 서술어만 본뜨고 내용은 가져오지 않는다.

export const STYLE_AREAS = ["세특", "창체", "행발"] as const;
export type StyleArea = (typeof STYLE_AREAS)[number];
export const isStyleArea = (v: unknown): v is StyleArea => (STYLE_AREAS as readonly string[]).includes(String(v));
/** 기록 영역 → 내 스타일 영역 (자율 · 동아리 · 진로는 창체 하나) */
export const styleAreaOf = (area: string): StyleArea => (area === "세특" ? "세특" : area === "행발" ? "행발" : "창체");

export const STYLE_LIMITS = { prompt: 2000, ref: 1000, refs: 3 } as const;

export type WritingStyle = { area: StyleArea; prompt: string; refs: string[]; updatedAt: string | null };
export const emptyStyle = (area: StyleArea): WritingStyle => ({ area, prompt: "", refs: [], updatedAt: null });
export const hasStyle = (s: Pick<WritingStyle, "prompt" | "refs"> | null | undefined) => !!s && (!!s.prompt.trim() || s.refs.some((r) => r.trim()));

/** 저장 전 정리 · 검사: 빈 레퍼런스는 빼고 길이를 본다. 문제 있으면 error */
export function cleanStyle(input: { prompt: string; refs: string[] }): { prompt: string; refs: string[] } | { error: string } {
  const prompt = input.prompt.trim();
  const refs = input.refs.map((r) => r.trim()).filter(Boolean);
  if (prompt.length > STYLE_LIMITS.prompt) return { error: `내 프롬프트는 ${STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자까지예요` };
  if (refs.length > STYLE_LIMITS.refs) return { error: `레퍼런스는 ${STYLE_LIMITS.refs}개까지예요` };
  if (refs.some((r) => r.length > STYLE_LIMITS.ref)) return { error: `레퍼런스는 하나에 ${STYLE_LIMITS.ref.toLocaleString("ko-KR")}자까지예요` };
  return { prompt, refs };
}

/** AI 시스템 프롬프트 뒤에 붙일 글. 학교 규칙(문체 · 근거 · 분량 게이트)이 먼저라는 것을 분명히 한다 */
export function styleTone(s: Pick<WritingStyle, "prompt" | "refs">): string {
  if (!hasStyle(s)) return "";
  const parts = ["", "<교사 스타일>", "아래는 이 교사가 원하는 쓰는 방식이다. 위 학교 규칙 · 근거 규칙 · 분량 규칙과 부딪치면 학교 규칙을 따른다."];
  if (s.prompt.trim()) parts.push("<내 프롬프트>", s.prompt.trim(), "</내 프롬프트>");
  const refs = s.refs.filter((r) => r.trim());
  if (refs.length) {
    parts.push("<레퍼런스 생기부>", "이 글들의 구조(문장 순서 · 문단 흐름) · 문장 길이 · 서술어 고르는 방식만 본뜬다. 레퍼런스에 나온 활동 · 사실 · 낱말은 절대 가져오지 않는다. 사실은 조각에서만 쓴다.");
    refs.forEach((r, i) => parts.push(`<예시 ${i + 1}>`, r.trim(), `</예시 ${i + 1}>`));
    parts.push("</레퍼런스 생기부>");
  }
  parts.push("</교사 스타일>");
  return parts.join("\n");
}
