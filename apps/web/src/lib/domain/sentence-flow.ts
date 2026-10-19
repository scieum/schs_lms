// 문장 잇기 (2026-10-19 "문장이 너무 많이 끊긴다"): 노션 원본 프롬프트의 "문장을 여러 개로 나누지 말고 최대한 이어서"를
// AI 없이 만드는 글(합치기 규칙·예시 초안)에도 적용한다. 같은 활동의 짧은 "~함." 문장을 "~하고"·"~하며"로 잇는다.

/** 한 문장을 이을 때 넘지 않을 글자 수 (노션 과학 예시 문장 길이 안팎) */
export const LINK_MAX_CHARS = 130;

const HANGUL = 0xac00;
const JONG_M = 16; // ㅁ
const JONG_LM = 10; // ㄻ
const JONG_L = 8; // ㄹ

/**
 * "~함." 꼴 문장의 끝을 연결어미로 바꾼다. kind 0 = "~고", 1 = "~며".
 * 확실한 꼴만 바꾼다: 받침 ㅁ 명사형(함·됨·임·냄·봄…), 따로 붙은 "음"(맡음·있음·읽음), ㄻ(만듦). "도움" 같은 불규칙은 null.
 */
export function toConnective(sentence: string, kind: 0 | 1 = 0): string | null {
  const s = sentence.trim().replace(/\.$/, "");
  if (!s || /[.!?]$/.test(s) || /움$/.test(s)) return null;
  const last = s.charCodeAt(s.length - 1) - HANGUL;
  if (last < 0 || last > 11171) return null;
  const jong = last % 28;
  const body = s.slice(0, -1);
  // 따로 붙은 "음": 앞 글자에 받침이 있을 때 (맡음 → 맡고/맡으며)
  if (s.endsWith("음") && body) {
    const prev = body.charCodeAt(body.length - 1) - HANGUL;
    if (prev >= 0 && prev <= 11171 && prev % 28 !== 0) return body + (kind === 0 ? "고" : "으며");
  }
  if (jong === JONG_M) return body + String.fromCharCode(HANGUL + last - JONG_M) + (kind === 0 ? "고" : "며");
  if (jong === JONG_LM) return body + String.fromCharCode(HANGUL + last - JONG_LM + JONG_L) + (kind === 0 ? "고" : "며");
  return null;
}

/**
 * 짧은 문장들을 차례로 잇는다: 이은 문장이 maxChars 를 넘지 않는 동안 "~하고" → "~하며" 로 번갈아 붙인다.
 * 끝을 바꿀 수 없는 문장은 그대로 끊는다. 결과 문장 수는 같거나 적다.
 */
export function linkSentences(list: string[], maxChars = LINK_MAX_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  let joins = 0;
  for (const raw of list) {
    const next = raw.trim();
    if (!next) continue;
    if (!cur) {
      cur = next;
      joins = 0;
      continue;
    }
    const link = cur.length + next.length <= maxChars ? toConnective(cur, (joins % 2) as 0 | 1) : null;
    if (link) {
      cur = `${link} ${next}`;
      joins++;
    } else {
      out.push(cur);
      cur = next;
      joins = 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}
