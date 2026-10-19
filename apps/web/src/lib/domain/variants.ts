// 다른 버전 (Figma N34 ②) — AI 키가 없을 때 쓰는 예시 버전 (같은 입력이면 늘 같은 결과, 화면에 "예시").
// keep = 내용·순서 그대로 서술어만 바꿈 · fresh = 같은 문장으로 순서를 다시 짬. 사실을 보태지 않는다.
import { rephraseRule } from "./program";
import { sentences } from "./writing";

export type VariantMode = "keep" | "fresh";

/** "AI로 고치기" 액션 결과 (세특·창체·행발·초안 공통) */
export type AiFixResult =
  | { ok: true; text: string; changes: { from: string; to: string }[]; label: "AI" | "자동"; bytes: number; notice?: string }
  | { ok: false; error: string };

/** "다른 버전" 액션 결과 */
export type VariantsActionResult =
  | { ok: true; versions: { text: string; block: boolean }[]; label: "AI" | "자동"; sample: boolean; notice?: string }
  | { ok: false; error: string };

const swap = (s: string) => rephraseRule(s).find((o) => o !== s) ?? s;

export function sampleVariants(text: string, mode: VariantMode): string[] {
  const list = sentences(text);
  if (!list.length) return [];
  const join = (xs: string[]) => xs.join(" ");
  const out =
    mode === "keep"
      ? [join(list.map(swap)), join(list.map((s, i) => (i % 2 === 0 ? swap(s) : s))), join(list.map((s, i) => (i % 2 === 1 ? swap(s) : s)))]
      : [join([...list.slice(1), list[0]]), join([...list].reverse()), join([...list.slice(1), list[0]].map(swap))];
  return [...new Set(out)].filter((v) => v !== text.trim());
}
