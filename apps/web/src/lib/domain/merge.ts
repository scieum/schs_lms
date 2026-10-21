import { measure, type LengthRange } from "./length";
import { fitToMax, sentences, toNeisSentence } from "./writing";
import { activityTag, leadWithActivity, stripActivity } from "./activity-name";
import { linkSentences } from "./sentence-flow";

// 합치기 (Figma N11): 학기 동안 따로 쌓인 조각(누가기록·관찰 메모·본문)을 한 문단으로 합치고 분량(예: 1,500바이트)에 맞춘다.
// 맞추기: 본문 하나만 분량에 맞춘다. 둘 다 AI가 하고, 꺼져 있으면 아래 규칙으로 이어 붙인다.

/** 특색 활동 = 프로그램 선생님이 확정해 담임에게 보낸 초안 (담임의 자율·자치·진로에만) */
/** 공통 활동 = 과목·반 전체 활동(Figma N26)에서 학생 자료로 만든 조각 */
/** 자료 요약 = 조각 모으기(Figma N32)에서 활동 자료를 AI가 읽어 요약한 조각 */
/** 보관함 = 문장 보관함(Figma N35 ②)에서 "조각으로 넣기"한 문장 */
/** 수행평가 = 수행평가(Figma N59)에 올린 학생 자료를 AI가 읽은 요약 */
export type PieceSource = "누가기록" | "메모" | "본문" | "특색 활동" | "공통 활동" | "자료 요약" | "보관함" | "차시" | "수행평가";
export const PIECE_SOURCES = ["누가기록", "메모", "본문", "특색 활동", "공통 활동", "자료 요약", "보관함", "차시", "수행평가"] as const satisfies readonly PieceSource[];
export type MergePiece = { id: string; source: PieceSource; date: string | null; text: string; weight?: Importance };

// 조각 고르기 (Figma N20): 교사가 조각마다 중요도를 매기고, 목표 분량에 맞춰 고른다.
/** 3 핵심 · 2 보통 · 1 참고 */
export type Importance = 1 | 2 | 3;
/** N41: 핵심 → "꼭 넣기" (메모 모아 쓰기 칩) */
export const IMPORTANCE_LABEL: Record<Importance, string> = { 3: "꼭 넣기", 2: "보통", 1: "참고" };
/** 누를 때마다 보통 → 핵심 → 참고 → 보통 */
export const nextImportance = (w: Importance): Importance => (w === 2 ? 3 : w === 3 ? 1 : 2);
/** 고른 조각이 목표의 몇 배까지면 알맞은지 (넘치는 만큼은 합치기가 줄인다) */
export const BUDGET_OVER = 1.5;

/** 조각 칸(세특·행발 편집 화면)에서 바로 남긴 메모의 범위 — 관찰 메모(편집기 "메모로")와 섞이지 않게 따로 둔다 */
export const pieceScope = (scope: string) => `${scope}#조각`;
/** 자료로 남긴 조각(활동 요약)의 범위 (Figma N32) — 목록에서 "자료 요약" 칩으로 보인다 */
export const fileScope = (scope: string) => `${scope}#자료`;
export const isFileScope = (scope: string) => scope.endsWith("#자료");
/** 문장 보관함에서 넣은 조각의 범위 (Figma N35 ②) — 목록에서 "보관함" 칩 */
export const libraryScope = (scope: string) => `${scope}#보관함`;
export const isLibraryScope = (scope: string) => scope.endsWith("#보관함");
/** 조각 남기기의 출처: 메모 칸 · 자료 요약 · 문장 보관함 */
export type PieceKind = "memo" | "file" | "library";
/** 조각 칸에서 남길 메모 범위: 메모는 #조각, 자료 요약은 #자료, 보관함은 #보관함 */
export const pieceScopeOf = (scope: string, kind: PieceKind = "memo") => (kind === "file" ? fileScope(scope) : kind === "library" ? libraryScope(scope) : pieceScope(scope));
export const PIECE_MIN = 2;
export const PIECE_MAX = 1000;

/** 합치기·맞추기 목표: 최대에서 90%까지 (NEIS 칸을 거의 채우되 넘지 않게) */
export const FIT_RATIO = 0.9;
export function fitRange(range: Pick<LengthRange, "unit" | "max">): LengthRange {
  return { unit: range.unit, max: range.max, min: Math.ceil(range.max * FIT_RATIO), capped: false };
}

/**
 * 맞추기 겨냥점: 범위 가운데(최대의 약 95%)와, 바이트일 때 그 글의 바이트/글자 비율로 셈한 글자 수.
 * AI는 바이트를 못 세므로 "약 N자(공백 포함)"로 같이 알려 준다. sample 이 비면 한글 글의 보통 비율(2.6)을 쓴다.
 */
export function fitGoal(range: Pick<LengthRange, "unit" | "min" | "max">, sample = ""): { value: number; chars: number } {
  const value = Math.round((range.min + range.max) / 2);
  if (range.unit !== "bytes") return { value, chars: value };
  const len = [...sample].length;
  const ratio = len >= 40 ? measure(sample, "bytes") / len : 2.6;
  return { value, chars: Math.round(value / ratio) };
}

/** 지금 글이 범위 밖이면 얼마나 늘리거나 줄여야 하는지 (안이면 null) */
export function fitGap(text: string, range: Pick<LengthRange, "unit" | "min" | "max">): { dir: "늘리기" | "줄이기"; now: number; by: number } | null {
  const now = measure(text, range.unit);
  if (now < range.min) return { dir: "늘리기", now, by: fitGoal(range).value - now };
  if (now > range.max) return { dir: "줄이기", now, by: now - fitGoal(range).value };
  return null;
}

/** 날짜 순(날짜 없는 본문은 맨 앞), 같은 날짜는 들어온 순서 */
export function orderPieces(pieces: MergePiece[]): MergePiece[] {
  return pieces.map((p, i) => ({ p, i })).sort((a, b) => (a.p.date ?? "").localeCompare(b.p.date ?? "") || a.i - b.i).map((x) => x.p);
}

/** 조각을 활동명([활동명])별로 묶는다. 묶음은 처음 나온 순서, 묶음 안은 들어온 순서. n 은 들어온 순서의 번호(1부터) */
export function groupByActivity(pieces: MergePiece[]): { activity: string | null; pieces: { piece: MergePiece; n: number }[] }[] {
  const groups = new Map<string, { activity: string | null; pieces: { piece: MergePiece; n: number }[] }>();
  pieces.forEach((piece, i) => {
    const activity = activityTag(piece.text);
    const key = activity ? activity.replace(/\s/g, "") : "";
    const g = groups.get(key) ?? { activity, pieces: [] };
    g.pieces.push({ piece, n: i + 1 });
    groups.set(key, g);
  });
  return [...groups.values()];
}

/**
 * AI 없이: 조각 문장을 날짜 순으로 잇고, 같은 문장은 한 번만, NEIS 어미로, 넘치면 뒤 문장부터 뺀다.
 * 같은 활동([활동명])이나 같은 조각의 짧은 문장은 "~하고"·"~하며"로 이어 한 문장으로 만들고, 활동명은 그 활동 첫 문장에만 쓴다.
 */
export function mergeByRules(pieces: MergePiece[], range: Pick<LengthRange, "unit" | "max">): string {
  const seen = new Set<string>();
  const out: { text: string; weight: Importance; group: string; act: string | null }[] = [];
  for (const p of orderPieces(pieces)) {
    const act = activityTag(p.text);
    for (const s of sentences(p.text)) {
      const n = toNeisSentence(stripActivity(s));
      const key = n.replace(/\s/g, "");
      if (!n || seen.has(key)) continue;
      seen.add(key);
      out.push({ text: n, weight: p.weight ?? 2, group: act ? `act:${act}` : `piece:${p.id}`, act });
    }
  }
  // 넘치면 참고 → 보통 조각 문장부터 뒤에서 뺀다 (핵심은 끝까지 남긴다)
  for (const level of [1, 2] as const) {
    for (let i = out.length - 1; i >= 0 && measure(out.map((x) => x.text).join(" "), range.unit) > range.max; i--) {
      if (out[i].weight === level && out.length > 1) out.splice(i, 1);
    }
  }
  // 이어진 같은 묶음끼리 잇는다
  const parts: string[] = [];
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && out[j].group === out[i].group) j++;
    const linked = linkSentences(out.slice(i, j).map((x) => x.text));
    const act = out[i].act;
    const named = act && !linked.some((s) => s.replace(/\s/g, "").includes(act.replace(/\s/g, "")));
    parts.push(...(named ? [leadWithActivity(act, linked[0]), ...linked.slice(1)] : linked));
    i = j;
  }
  return fitToMax(parts.join(" "), range);
}

/**
 * 중요도 순으로 목표에 맞춰 고르기: 핵심은 늘 고르고, 나머지는 중요도 → 본문 → 새 것 순으로 목표를 넘기 전까지 더한다.
 * 합치기가 겹치는 말을 줄이므로 목표보다 조금 많은 재료(최대 BUDGET_OVER 배 안)를 허용한다.
 */
export function pickByBudget(pieces: MergePiece[], target: number, unit: LengthRange["unit"]): Set<string> {
  const w = (p: MergePiece) => p.weight ?? 2;
  const order = pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => w(b.p) - w(a.p) || Number(b.p.source === "본문") - Number(a.p.source === "본문") || (b.p.date ?? "9999").localeCompare(a.p.date ?? "9999") || a.i - b.i)
    .map((x) => x.p);
  const out = new Set<string>();
  let total = 0;
  for (const p of order) {
    const n = measure(p.text, unit);
    if (w(p) !== 3 && (total >= target || total + n > target * BUDGET_OVER)) continue;
    out.add(p.id);
    total += n;
  }
  return out;
}

/** 고른 양이 목표에 비해 어떤지: 부족(최소 미만) · 맞음 · 많음(BUDGET_OVER 배 초과) */
export function budgetStatus(total: number, target: number): "부족" | "맞음" | "많음" {
  if (total < Math.ceil(target * FIT_RATIO)) return "부족";
  return total > target * BUDGET_OVER ? "많음" : "맞음";
}

export const piecesBytes = (pieces: MergePiece[], unit: LengthRange["unit"]) => pieces.reduce((n, p) => n + measure(p.text, unit), 0);
