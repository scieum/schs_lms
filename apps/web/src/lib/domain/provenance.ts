// 문장 근거 · AI 원안 기록 (Figma N38): 순수 함수 — 서버(저장·확정)와 화면(근거 보기·수정 칩)이 같이 쓴다.
// - AI가 쓴 문장마다 근거(설문 문항 · 조각 · 누가기록 · 파일)를 잇고, 규칙으로 한 번 더 본다(verifySources).
// - 지금 글을 문장으로 나눠 AI 원안 문장과 맞추고(alignSentences), 근거를 물려받거나 "직접"으로 본다.
// - 수정 비율(editRatio): AI 원안 어절 대비 바뀐 어절. 기준값은 PROVENANCE_DEFAULTS(학교 설정 app_state 가 덮는다).

import { lcsLength } from "./diff";

/** 학교 설정이 없을 때 쓰는 기준 (화면 문구 "기준 10%"도 여기서) */
export const PROVENANCE_DEFAULTS = { editRatioMin: 10, sourceMatchMin: 0.5 } as const;
export type ProvenanceSettings = { editRatioMin: number; sourceMatchMin: number };

export type SourceType = "survey" | "piece" | "log" | "file" | "common";
/** 저장하는 근거 (인용 글은 저장하지 않는다 — ref 로 그때 읽는다) */
export type SourceRef = { type: SourceType; ref: string; q?: string; page?: number };
/** AI 원안 문장 (ai_originals.sentences) */
export type OriginalSentence = { i: number; start: number; end: number; sources: SourceRef[]; own?: boolean };
/** 지금 글 기준 문장 근거 (record.sentence_sources): own = 교사가 쓴 문장(직접), pinned = 교사가 정함 */
export type SentenceSource = { i: number; start: number; end: number; sources: SourceRef[]; own?: boolean; pinned?: boolean };
/** 교사가 정한 문장 ("근거로 잇기" · "내가 본 일이에요") — 문장 글로 맞춘다 */
export type Pin = { text: string; sources: SourceRef[]; own?: boolean };

/** 기록 버전마다 붙는 N38 칸 (마이그레이션 0022 전 글은 모두 없음) */
export type RecordProv = {
  aiOriginalId?: string | null;
  sentenceSources?: SentenceSource[] | null;
  /** 확정 때만 (0~100) */
  editRatio?: number | null;
  lowEditReason?: string | null;
};

/** 화면에 보일 근거 한 개 (서버가 ref 로 읽어 만든다) */
export type SourceItem = SourceRef & {
  key: string;
  /** 설문 · 조각 · 누가기록 · 파일 · 공통 활동 */
  kind: string;
  /** "10월 2일 · 물리학 1분반" · "후속 계획" */
  where: string;
  /** 칩 글 ("설문 Q3" · "조각 · 실험 메모" · "누가 10/2" · "보고서.pdf 2쪽") */
  chip: string;
  text: string;
};

/** 화면에 내려 주는 AI 원안 */
export type OriginalView = { id: string; content: string; createdAt: string; sentences: OriginalSentence[] };

export const sourceKey = (s: Pick<SourceRef, "type" | "ref" | "q">) => `${s.type}:${s.ref}${s.q ? `#${s.q}` : ""}`;
export const toRef = (s: SourceRef): SourceRef => ({ type: s.type, ref: s.ref, ...(s.q ? { q: s.q } : {}), ...(s.page ? { page: s.page } : {}) });

// ---------- 문장 · 어절 ----------

export type Span = { start: number; end: number; text: string };

/** 글을 문장 자리로 나눈다 ('다.' '함.' '음.' '임.' 처럼 마침표 + 공백, 또는 줄바꿈) */
export function splitSentences(text: string): Span[] {
  const out: Span[] = [];
  const push = (a: number, b: number) => {
    const raw = text.slice(a, b);
    const body = raw.trim();
    if (!body) return;
    const lead = raw.length - raw.trimStart().length;
    out.push({ start: a + lead, end: a + lead + body.length, text: body });
  };
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      push(start, i);
      start = i + 1;
    } else if ((c === "." || c === "!" || c === "?") && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      push(start, i + 1);
      start = i + 1;
    }
  }
  push(start, text.length);
  return out;
}

const PUNCT = /[.,·ㆍ'"“”‘’()[\]{}!?…:;~\-–—/]/g;
/** 어절 (문장부호를 뗀 공백 단위) */
export function wordsOf(text: string): string[] {
  return text.replace(PUNCT, " ").split(/\s+/).filter(Boolean);
}

/** 어절 끝에 붙는 조사·어미 (이것만 다르면 같은 어절) */
const TAIL = /^(?:을|를|이|가|은|는|의|에|에서|에게|으로|로|와|과|도|만|씩|들|들을|들이|들의|함|음|임|됨|하고|하여|해|해서|한|할|하는|했|했다|하며|하게|된|되어|되는|적|적인|적으로|이다|였|었|으며|고|며|다)$/;

/** 같은 어절로 본다: 같거나, 두 글자 이상 줄기 뒤에 조사·어미만 다르다 (굴절각을 ~ 굴절각 · 측정함 ~ 측정, 굴절 ≠ 굴절각) */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 2 && l.startsWith(s) && TAIL.test(l.slice(s.length));
}

/** 겹친 어절 수 (한 어절은 한 번만 짝짓는다) */
export function sharedWords(a: string[], b: string[]): number {
  const used = new Array<boolean>(b.length).fill(false);
  let n = 0;
  for (const w of a) {
    const j = b.findIndex((x, k) => !used[k] && same(w, x));
    if (j >= 0) { used[j] = true; n++; }
  }
  return n;
}

/** 두 문장의 어절 겹침 (짧은 쪽 대비, 0~1). 두 어절 미만이면 0 */
export function overlap(a: string, b: string): number {
  const x = wordsOf(a);
  const y = wordsOf(b);
  if (!x.length || !y.length) return 0;
  const n = sharedWords(x, y);
  return n < 2 && Math.min(x.length, y.length) > 1 ? 0 : n / Math.min(x.length, y.length);
}

// ---------- 두 번째 검사 (규칙) ----------

/**
 * AI가 단 근거를 문장과 한 번 더 본다 (세특PRO식 2단계): 문장과 2어절 이상 겹치지 않는 근거는 뗀다.
 * 하나도 안 남으면 빈 배열 = "근거 없음".
 */
export function verifySources<T extends { text: string }>(sentence: string, sources: T[], minShared = 2): T[] {
  const w = wordsOf(sentence);
  return sources.filter((s) => sharedWords(w, wordsOf(s.text)) >= minShared);
}

// ---------- 문장 맞추기 ----------

const norm = (s: string) => wordsOf(s).join(" ");

/**
 * 지금 글을 문장으로 나누고 AI 원안 문장과 맞춘다.
 * - 교사가 정한 문장(pinned)이 먼저: 같은 문장(또는 겹침 ≥ min)이면 그 근거/직접.
 * - 원안 문장과 어절 겹침 ≥ min 이면 근거를 물려받는다 (순서 바뀜 · 합침 · 쪼갬 모두 — 겹친 원안 문장 근거를 모은다).
 * - 아니면 own (교사가 쓴 문장 = 직접).
 */
export function alignSentences(
  original: { content: string; sentences: OriginalSentence[] },
  now: string,
  pinned: Pin[] = [],
  min: number = PROVENANCE_DEFAULTS.sourceMatchMin,
): SentenceSource[] {
  const orig = original.sentences.map((s) => ({ ...s, text: original.content.slice(s.start, s.end) }));
  return splitSentences(now).map((sp, i): SentenceSource => {
    const base = { i, start: sp.start, end: sp.end };
    const n = norm(sp.text);
    const pin = pinned.find((p) => norm(p.text) === n) ?? pinned.find((p) => overlap(p.text, sp.text) >= Math.max(min, 0.8));
    if (pin) return pin.own ? { ...base, sources: [], own: true, pinned: true } : { ...base, sources: dedupe(pin.sources), pinned: true };
    const hits = orig.filter((o) => overlap(o.text, sp.text) >= min);
    if (!hits.length) return { ...base, sources: [], own: true };
    if (hits.every((h) => h.own)) return { ...base, sources: [], own: true };
    return { ...base, sources: dedupe(hits.flatMap((h) => h.sources)) };
  });
}

function dedupe(list: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = sourceKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(toRef);
}

/** 근거 없는 문장 (직접 쓴 문장은 빼고) */
export const noSourceSentences = (list: SentenceSource[]) => list.filter((s) => !s.own && s.sources.length === 0);

// ---------- 수정 비율 ----------

/** 원안 → 지금: 빠진 어절 · 보탠 어절 · 원안 어절 · 지금 어절 */
export function wordChange(original: string, now: string): { removed: number; added: number; a: number; b: number } {
  const a = wordsOf(original);
  const b = wordsOf(now);
  // 공백·문장부호만 다르면 0
  if (a.join("") === b.join("")) return { removed: 0, added: 0, a: a.length, b: b.length };
  const l = lcsLength(a, b);
  return { removed: a.length - l, added: b.length - l, a: a.length, b: b.length };
}

/** 수정 비율 % = (빠진 어절 + 보탠 어절) ÷ (원안 어절 + 지금 어절) × 100, 반올림 정수 0~100 */
export function editRatio(original: string, now: string): number {
  const c = wordChange(original, now);
  const total = c.a + c.b;
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round(((c.removed + c.added) / total) * 100)));
}

export type RatioLevel = "enough" | "low" | "own";
/** 수정 칩 단계: 원안 없음 = 직접, 기준 미만 = 적음, 그 밖 = 충분 */
export function ratioLevel(ratio: number | null, min: number = PROVENANCE_DEFAULTS.editRatioMin): RatioLevel {
  if (ratio == null) return "own";
  return ratio < min ? "low" : "enough";
}

// ---------- 원안 만들기 (AI 문장 + 근거 표지 → 최종 글 기준 문장) ----------

/**
 * AI가 돌려준 문장들(근거 표지 포함)을 최종 글(다듬기·분량 맞추기 뒤)에 맞춘 원안 문장으로.
 * keysOf: 표지 → 근거 (표에 없는 표지는 버린다). 근거 글로 두 번째 검사를 한다.
 * ownKeys: 이 표지만 단 문장은 교사 글(지금 본문 조각)로 보고 own.
 */
export function buildOriginalSentences(
  finalText: string,
  aiSentences: { text: string; keys: string[] }[],
  pool: Map<string, SourceItem>,
  opts: { ownKeys?: string[]; min?: number } = {},
): OriginalSentence[] {
  const own = new Set(opts.ownKeys ?? []);
  const verified = aiSentences.map((s) => {
    const keys = [...new Set(s.keys)];
    const ownOnly = keys.length > 0 && keys.every((k) => own.has(k));
    const items = keys.map((k) => pool.get(k)).filter((x): x is SourceItem => !!x);
    return { text: s.text, own: ownOnly, sources: verifySources(s.text, items).map(toRef) };
  });
  const joined: { content: string; sentences: OriginalSentence[] } = { content: "", sentences: [] };
  for (const v of verified) {
    const start = joined.content ? joined.content.length + 1 : 0;
    joined.content = joined.content ? `${joined.content} ${v.text.trim()}` : v.text.trim();
    joined.sentences.push({ i: joined.sentences.length, start, end: joined.content.length, sources: v.sources, ...(v.own ? { own: true } : {}) });
  }
  // 최종 글 문장마다: 맞는 AI 문장 근거를 물려받는다. 못 맞추면(AI 글인데) 근거 없음
  return alignSentences(joined, finalText, [], opts.min).map((s) => ({ i: s.i, start: s.start, end: s.end, sources: s.sources, ...(s.own && aiOwned(joined, finalText.slice(s.start, s.end), opts.min) ? { own: true } : {}) }));
}

/** 이 문장이 교사 글(own) 문장에서 온 것인지 (못 맞춘 문장은 AI 글로 본다) */
function aiOwned(joined: { content: string; sentences: OriginalSentence[] }, text: string, min: number = PROVENANCE_DEFAULTS.sourceMatchMin): boolean {
  const hits = joined.sentences.filter((o) => overlap(joined.content.slice(o.start, o.end), text) >= min);
  return hits.length > 0 && hits.every((h) => h.own);
}

/** 규칙만으로 근거 붙이기 (AI가 꺼져 예시 초안일 때): 문장마다 모든 근거 후보를 두 번째 검사로 거른다 */
export function guessSentences(finalText: string, pool: SourceItem[], ownKeys: string[] = []): OriginalSentence[] {
  const map = new Map(pool.map((p) => [p.key, p]));
  return buildOriginalSentences(finalText, splitSentences(finalText).map((s) => ({ text: s.text, keys: pool.map((p) => p.key) })), map, { ownKeys });
}

/** 근거 후보 순서: 문장과 겹치는 어절이 많은 순 (같으면 원래 순서) */
export function rankCandidates<T extends { text: string }>(sentence: string, items: T[]): T[] {
  const w = wordsOf(sentence);
  return items.map((it, i) => ({ it, i, n: sharedWords(w, wordsOf(it.text)) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.it);
}

/** 근거 카드 인용에서 문장과 겹친 말 자리 (굵게) */
export function sharedSpans(quote: string, sentence: string): { start: number; end: number }[] {
  const w = wordsOf(sentence);
  const out: { start: number; end: number }[] = [];
  for (const m of quote.matchAll(/\S+/g)) {
    const word = m[0].replace(PUNCT, "");
    if (word && w.some((x) => same(word, x))) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** 문장 하나를 글에서 지운다 (앞뒤 공백 정리) */
export function removeSentence(text: string, span: { start: number; end: number }): string {
  const before = text.slice(0, span.start).replace(/[ \t]+$/, "");
  const after = text.slice(span.end).replace(/^[ \t]+/, "");
  if (!before) return after;
  if (!after) return before;
  return /\n$/.test(before) || /^\n/.test(after) ? before + after : `${before} ${after}`;
}

/** 저장된 sentence_sources 에서 교사가 정한 것(pinned)만 Pin 으로 */
export function pinsFrom(text: string, list: SentenceSource[] | null | undefined): Pin[] {
  return (list ?? []).filter((s) => s.pinned && s.end <= text.length).map((s) => ({ text: text.slice(s.start, s.end), sources: s.sources, ...(s.own ? { own: true } : {}) }));
}

/** 서버로 받은 sentence_sources / pins JSON 을 믿을 수 있는 모양으로 */
export function parsePins(raw: unknown): Pin[] {
  if (!Array.isArray(raw)) return [];
  const types = new Set<SourceType>(["survey", "piece", "log", "file", "common"]);
  return raw.slice(0, 80).flatMap((p): Pin[] => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) return [];
    const sources = Array.isArray(o.sources)
      ? o.sources.slice(0, 12).flatMap((s): SourceRef[] => {
          const x = s as Record<string, unknown>;
          return x && typeof x.ref === "string" && types.has(x.type as SourceType)
            ? [toRef({ type: x.type as SourceType, ref: x.ref.slice(0, 80), q: typeof x.q === "string" ? x.q.slice(0, 8) : undefined, page: typeof x.page === "number" ? x.page : undefined })]
            : [];
        })
      : [];
    return [{ text: o.text.slice(0, 1000), sources, ...(o.own === true ? { own: true } : {}) }];
  });
}
