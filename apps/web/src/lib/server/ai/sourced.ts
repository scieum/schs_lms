import "server-only";
import { z } from "zod";

// 문장 근거 (Figma N38): AI가 문장마다 기댄 자료 표지([S1] …)를 같이 돌려준다. 표지 ↔ 실제 근거 표는 서버에만 있다.

export const SourcedOut = z.object({ sentences: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })) });
export type SourcedSentence = { text: string; keys: string[] };

export const SOURCED_RULES = `
근거 표지 규칙:
- 자료마다 [S1] 같은 표지가 붙어 있다. 문장마다 그 문장을 쓸 때 기댄 자료의 표지를 sources 에 넣는다 (여러 개 가능, 기댄 자료가 없으면 빈 배열).
- 표지는 위 자료에 있는 것만 쓴다. 문장 text 에는 표지를 쓰지 않는다.
- sentences 에 최종본 문장을 순서대로 하나씩 넣는다 (이어 붙이면 한 문단이 된다).`;

const TAG = /\s*\[S\d+\]\s*/g;
const clean = (t: string) => t.replace(TAG, " ").replace(/\s+/g, " ").trim();

/** 문장들 → 한 문단 (혹시 남은 표지는 지운다) */
export const joinSentences = (list: { text: string }[]) => list.map((s) => clean(s.text)).filter(Boolean).join(" ");

/** 표지 → 근거 key (표에 없는 표지는 버린다) */
export function toKeys(list: { text: string; sources: string[] }[], labels: Map<string, string>): SourcedSentence[] {
  return list
    .map((s) => ({ text: clean(s.text), keys: [...new Set(s.sources.map((x) => labels.get(x.replace(/[[\]\s]/g, "").toUpperCase())).filter((k): k is string => !!k))] }))
    .filter((s) => s.text);
}

/** 근거 key 목록에 표지를 붙인다: 표지 → key 표 · i번째 표지 글 */
export function makeLabels(keys: string[]): { labels: Map<string, string>; tag: (i: number) => string } {
  return { labels: new Map(keys.map((k, i) => [`S${i + 1}`, k])), tag: (i) => `[S${i + 1}]` };
}
