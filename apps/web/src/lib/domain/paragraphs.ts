// 문단 나누기 (Figma N56): 다 쓴 글을 보기 편하게 문단으로 나눠 보여 준다. 저장 · 나이스 · 복사 · 바이트는 늘 한 문단(joinParagraphs).
// 나누는 곳: "[활동명]"으로 시작하는 문장, 이어지는 말(또한 · 이후 · 특히 …)로 시작하는 문장. 그런 곳이 없고 문장이 4개 이상이면 비슷한 길이로 2~3문단.

const MARK = /^(\[|또한|이후|이어|한편|특히|아울러|더불어|나아가|이를 바탕으로|이를 계기로|이 밖에도|그 밖에도|마지막으로|끝으로|그리고)/;

/** 한 문단으로: 줄바꿈 · 겹친 띄어쓰기를 한 칸으로 */
export const joinParagraphs = (text: string) => text.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();

/** 문장으로 자르기 (마침표 · 물음표 · 느낌표 뒤 띄어쓰기) */
export const sentencesOf = (text: string) => joinParagraphs(text).split(/(?<=[.!?])\s+/).filter(Boolean);

/** 문단으로 나눈 글 (문단 사이 빈 줄 하나). 나눌 데가 없으면 그대로 한 문단 */
export function splitParagraphs(text: string): string {
  const s = sentencesOf(text);
  if (s.length < 2) return joinParagraphs(text);
  const paras: string[][] = [[]];
  for (const x of s) {
    const cur = paras[paras.length - 1];
    if (cur.length >= 2 && MARK.test(x)) paras.push([x]);
    else cur.push(x);
  }
  if (paras.length === 1 && s.length >= 4) return balanced(s, s.length >= 7 ? 3 : 2).join("\n\n");
  return paras.map((p) => p.join(" ")).join("\n\n");
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

export const paragraphCount = (text: string) => text.split(/\n\s*\n/).filter((p) => p.trim()).length;
