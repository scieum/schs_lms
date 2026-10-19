// 비슷한 문장 (Figma N34 ④): 규칙만으로(AI 없음) 다른 학생 기록과 여섯 어절 넘게 똑같이 이어진 곳을 찾는다.
// 문장부호·공백을 정리한 어절 배열 → minRun 어절 조각(shingle) → 같은 조각을 가진 쌍 → 이어진 구간으로 합침.
// ignore: 모두에게 같은 글이 들어가는 게 정상인 공통 활동(N26) 글 — 그 조각은 세지 않는다.

export type SimilarRun = { aStart: number; aEnd: number; bStart: number; bEnd: number; words: number };
export type SimilarPair = { a: string; b: string; runs: SimilarRun[]; words: number };

type Tok = { w: string; start: number; end: number };

/** 문장부호를 뺀 어절 (비교용) + 원래 글 자리 */
function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const w = m[0].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (w) out.push({ w, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const key = (t: Tok[], i: number, n: number) => t.slice(i, i + n).map((x) => x.w).join(" ");

/** 원래 글에서 구간 끝의 마침표·쉼표는 표시에서 뺀다 */
const trimEnd = (text: string, start: number, end: number) => {
  let e = end;
  while (e > start && /[.,!?·]/.test(text[e - 1])) e--;
  return e;
};

export function similarPairs(items: { id: string; text: string }[], opts: { minRun?: number; ignore?: string[] } = {}): SimilarPair[] {
  const n = opts.minRun ?? 6;
  const ignored = new Set<string>();
  for (const g of opts.ignore ?? []) {
    const t = tokens(g);
    for (let i = 0; i + n <= t.length; i++) ignored.add(key(t, i, n));
  }
  const toks = items.map((it) => tokens(it.text));
  // 조각 → (학생 번호, 어절 자리) 목록
  const index = new Map<string, { item: number; pos: number }[]>();
  toks.forEach((t, item) => {
    for (let pos = 0; pos + n <= t.length; pos++) {
      const k = key(t, pos, n);
      if (ignored.has(k)) continue;
      const list = index.get(k);
      if (list) list.push({ item, pos });
      else index.set(k, [{ item, pos }]);
    }
  });
  // 쌍마다 겹친 조각의 (a 자리, b 자리)
  const hits = new Map<string, [number, number][]>();
  for (const list of index.values()) {
    if (list.length < 2) continue;
    for (let x = 0; x < list.length; x++) {
      for (let y = 0; y < list.length; y++) {
        const p = list[x];
        const q = list[y];
        if (p.item >= q.item) continue;
        const k = `${p.item}:${q.item}`;
        const arr = hits.get(k);
        if (arr) arr.push([p.pos, q.pos]);
        else hits.set(k, [[p.pos, q.pos]]);
      }
    }
  }
  const out: SimilarPair[] = [];
  for (const [k, arr] of hits) {
    const [ai, bi] = k.split(":").map(Number);
    const ta = toks[ai];
    const tb = toks[bi];
    // 같은 대각선(b-a)에서 이어지거나 겹치는 조각을 한 구간으로
    arr.sort((p, q) => p[1] - p[0] - (q[1] - q[0]) || p[0] - q[0]);
    const runs: { a0: number; a1: number; b0: number }[] = [];
    for (const [pa, pb] of arr) {
      const last = runs[runs.length - 1];
      if (last && last.b0 - last.a0 === pb - pa && pa <= last.a1) last.a1 = Math.max(last.a1, pa + n);
      else runs.push({ a0: pa, a1: pa + n, b0: pb });
    }
    const textA = items[ai].text;
    const textB = items[bi].text;
    const res = runs
      .map((r) => {
        const len = r.a1 - r.a0;
        const b1 = r.b0 + len;
        return {
          aStart: ta[r.a0].start, aEnd: trimEnd(textA, ta[r.a0].start, ta[r.a1 - 1].end),
          bStart: tb[r.b0].start, bEnd: trimEnd(textB, tb[r.b0].start, tb[b1 - 1].end),
          words: len,
        };
      })
      .sort((p, q) => p.aStart - q.aStart);
    out.push({ a: items[ai].id, b: items[bi].id, runs: res, words: res.reduce((s, r) => s + r.words, 0) });
  }
  return out.sort((p, q) => q.words - p.words);
}

/** 이 학생과 겹친 학생 수 */
export function similarCount(pairs: SimilarPair[], id: string): number {
  return new Set(pairs.flatMap((p) => (p.a === id ? [p.b] : p.b === id ? [p.a] : []))).size;
}

/** 이 학생 쪽에서 본 쌍: 나(mine) 구간과 상대(other) 구간 */
export function pairsOf(pairs: SimilarPair[], id: string): { other: string; mine: { start: number; end: number }[]; theirs: { start: number; end: number }[]; words: number }[] {
  return pairs
    .filter((p) => p.a === id || p.b === id)
    .map((p) => {
      const me = p.a === id;
      return {
        other: me ? p.b : p.a,
        mine: p.runs.map((r) => (me ? { start: r.aStart, end: r.aEnd } : { start: r.bStart, end: r.bEnd })),
        theirs: p.runs.map((r) => (me ? { start: r.bStart, end: r.bEnd } : { start: r.aStart, end: r.aEnd })),
        words: p.words,
      };
    });
}
