import { measure, type LengthRange } from "./length";
import { fitToMax, sentences, toNeisSentence } from "./writing";

// 합치기 (Figma N11): 학기 동안 따로 쌓인 조각(누가기록·관찰 메모·본문)을 한 문단으로 합치고 분량(예: 1,500바이트)에 맞춘다.
// 맞추기: 본문 하나만 분량에 맞춘다. 둘 다 AI가 하고, 꺼져 있으면 아래 규칙으로 이어 붙인다.

/** 특색 활동 = 프로그램 선생님이 확정해 담임에게 보낸 초안 (담임의 자율·자치·진로에만) */
export type PieceSource = "누가기록" | "메모" | "본문" | "특색 활동";
export type MergePiece = { id: string; source: PieceSource; date: string | null; text: string };

/** 합치기·맞추기 목표: 최대에서 90%까지 (NEIS 칸을 거의 채우되 넘지 않게) */
export const FIT_RATIO = 0.9;
export function fitRange(range: Pick<LengthRange, "unit" | "max">): LengthRange {
  return { unit: range.unit, max: range.max, min: Math.ceil(range.max * FIT_RATIO), capped: false };
}

/** 날짜 순(날짜 없는 본문은 맨 앞), 같은 날짜는 들어온 순서 */
export function orderPieces(pieces: MergePiece[]): MergePiece[] {
  return pieces.map((p, i) => ({ p, i })).sort((a, b) => (a.p.date ?? "").localeCompare(b.p.date ?? "") || a.i - b.i).map((x) => x.p);
}

/** AI 없이: 조각 문장을 날짜 순으로 잇고, 같은 문장은 한 번만, NEIS 어미로, 넘치면 뒤 문장부터 뺀다 */
export function mergeByRules(pieces: MergePiece[], range: Pick<LengthRange, "unit" | "max">): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of orderPieces(pieces)) {
    for (const s of sentences(p.text)) {
      const n = toNeisSentence(s.replace(/^\[[^\]]*\]\s*/, ""));
      const key = n.replace(/\s/g, "");
      if (!n || seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return fitToMax(out.join(" "), range);
}

export const piecesBytes = (pieces: MergePiece[], unit: LengthRange["unit"]) => pieces.reduce((n, p) => n + measure(p.text, unit), 0);
