// 전·후 비교 (Figma N34 고친 글 · 순화 결과): 어절 단위 LCS 로 빠진 말(전)과 바뀐 말(후)의 자리를 찾는다.

export type Range = { start: number; end: number };
type Tok = { w: string; start: number; end: number };

/** 공백으로 나눈 어절과 자리 */
export function words(text: string): Tok[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ w: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/** 이어진 자리(사이 공백만)는 한 구간으로 */
function merge(toks: Tok[], text: string): Range[] {
  const out: Range[] = [];
  for (const t of toks) {
    const last = out[out.length - 1];
    if (last && /^\s*$/.test(text.slice(last.end, t.start))) last.end = t.end;
    else out.push({ start: t.start, end: t.end });
  }
  return out;
}

/** before → after: 빠진 어절(before 자리)과 들어온 어절(after 자리) */
export function wordDiff(before: string, after: string): { removed: Range[]; added: Range[]; changes: number } {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;
  // LCS 표 (뒤에서부터)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].w === b[j].w ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed: Tok[] = [];
  const added: Tok[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].w === b[j].w) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  const r = merge(removed, before);
  const ad = merge(added, after);
  return { removed: r, added: ad, changes: Math.max(r.length, ad.length) };
}

/** 글을 구간 표시용 조각으로 */
export function splitByRanges(text: string, ranges: Range[]): { text: string; on: boolean }[] {
  const out: { text: string; on: boolean }[] = [];
  let at = 0;
  for (const r of [...ranges].sort((x, y) => x.start - y.start)) {
    if (r.start < at) continue;
    if (r.start > at) out.push({ text: text.slice(at, r.start), on: false });
    out.push({ text: text.slice(r.start, r.end), on: true });
    at = r.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), on: false });
  return out;
}
