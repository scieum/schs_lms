// 문단 나누기 (Figma N56): 다 쓴 글을 보기 편하게 문단으로 나눠 보여 준다. 저장 · 나이스 · 복사 · 바이트는 늘 한 문단(joinParagraphs).
// 조각별로 나눈다: 근거(AI 원안과 맞춘 문장마다의 조각)가 있으면 같은 조각에서 온 문장끼리 한 문단.
// 근거가 없으면 "[활동명]"으로 시작하는 문장, 이어지는 말(또한 · 이후 · 특히 …)로 시작하는 문장. 그런 곳도 없고 문장이 4개 이상이면 비슷한 길이로 2~3문단.
// 문단 사이는 줄바꿈 하나 (빈 줄 없음).

const MARK = /^(\[|또한|이후|이어|한편|특히|아울러|더불어|나아가|이를 바탕으로|이를 계기로|이 밖에도|그 밖에도|마지막으로|끝으로|그리고)/;

/** 한 문단으로: 줄바꿈 · 겹친 띄어쓰기를 한 칸으로 */
export const joinParagraphs = (text: string) => text.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();

/** 문장으로 자르기 (마침표 · 물음표 · 느낌표 뒤 띄어쓰기) */
export const sentencesOf = (text: string) => joinParagraphs(text).split(/(?<=[.!?])\s+/).filter(Boolean);

/** 문장 자리와 그 문장의 조각(근거 첫 번째, 직접 쓴 문장은 null) */
export type SentenceSpan = { start: number; end: number; key: string | null };

/** 문단으로 나눈 글 (문단 사이 줄바꿈 하나). 나눌 데가 없으면 그대로 한 문단 */
export function splitParagraphs(text: string, spans?: SentenceSpan[]): string {
  const byPiece = spans && new Set(spans.map((x) => x.key).filter(Boolean)).size >= 2 ? piecesParas(text, spans) : null;
  if (byPiece) return byPiece;
  const s = sentencesOf(text);
  if (s.length < 2) return joinParagraphs(text);
  const paras: string[][] = [[]];
  for (const x of s) {
    const cur = paras[paras.length - 1];
    if (cur.length >= 2 && MARK.test(x)) paras.push([x]);
    else cur.push(x);
  }
  if (paras.length === 1 && s.length >= 4) return balanced(s, s.length >= 7 ? 3 : 2).join("\n");
  return paras.map((p) => p.join(" ")).join("\n");
}

/** 같은 조각에서 온 문장이 이어지면 한 문단. 조각 없는 문장(직접 쓴 문장)은 앞 문단에 붙는다 */
function piecesParas(text: string, spans: SentenceSpan[]): string | null {
  const paras: { key: string | null; s: string[] }[] = [];
  for (const sp of [...spans].sort((a, b) => a.start - b.start)) {
    const t = joinParagraphs(text.slice(sp.start, sp.end));
    if (!t) continue;
    const cur = paras[paras.length - 1];
    if (!cur || (sp.key && cur.key && sp.key !== cur.key)) paras.push({ key: sp.key, s: [t] });
    else { cur.s.push(t); cur.key ??= sp.key; }
  }
  const out = paras.map((p) => p.s.join(" ")).join("\n");
  // 문장 자리가 지금 글과 어긋나면(고치는 중) 쓰지 않는다
  return joinParagraphs(out) === joinParagraphs(text) ? out : null;
}

/** 글자 수가 비슷하게 k 문단 */
function balanced(s: string[], k: number): string[] {
  const total = s.reduce((n, x) => n + x.length, 0);
  const out: string[] = [];
  let cur: string[] = [], acc = 0;
  for (let i = 0; i < s.length; i++) {
    cur.push(s[i]); acc += s[i].length;
    const left = s.length - i - 1, need = k - out.length - 1;
    if (need > 0 && left >= need && acc >= (total * (out.length + 1)) / k) { out.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

export const paragraphCount = (text: string) => text.split(/\n+/).filter((p) => p.trim()).length;
