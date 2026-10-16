// 생기부 문체 규칙 — 속초고 "세특 프롬프트(속초고등학교 전달용)" 노션의 최상위 규칙·출력 제약·자기검증 체크리스트를 코드로 옮겼다.
// AI 초안과 예시 초안 모두 이 규칙으로 다듬고(polishStyle) 검사한다(styleIssues).

export type StyleIssue = "가운데 점" | "학생 주어" | "그는·그가·그의" | "따옴표 문장" | "서술형 어미" | "쉼표 과다" | "마침표 없음";

const LAST_HANGUL = /([가-힣])[^가-힣]*$/;

/** 마지막 한글 글자에 받침이 있는가 (와/과 고르기) */
export function hasBatchim(word: string): boolean {
  const m = word.match(LAST_HANGUL);
  if (!m) return false;
  return (m[1].charCodeAt(0) - 0xac00) % 28 !== 0;
}

/** 문장으로 나눈다 (마침표·물음표·느낌표 뒤 공백) */
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?]["”'’]?)\s+/).map((s) => s.trim()).filter(Boolean);
}

/** 고칠 수 있는 것은 고친다: 가운데 점 → 와/과, 줄바꿈 → 공백, 문장을 감싼 따옴표 제거, 끝 마침표 */
export function polishStyle(text: string): string {
  let t = text.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  // "A·B·C" → "A와 B와 C" (앞 단어 받침에 따라 와/과)
  t = t.replace(/([^\s·]+)\s*·\s*(?=[^\s·])/g, (_, w: string) => `${w}${hasBatchim(w) ? "과" : "와"} `);
  t = t.replace(/[·ㆍ]/g, " ");
  t = splitSentences(t)
    .map((s) => {
      const m = s.match(/^["“'‘](.*)["”'’]\.?$/);
      return m ? `${m[1].replace(/\.$/, "")}.` : s;
    })
    .join(" ");
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t.replace(/\s{2,}/g, " ").trim();
}

/** 고치지 못한 규칙 위반 목록 (중복 없이) */
export function styleIssues(text: string): StyleIssue[] {
  const out = new Set<StyleIssue>();
  const body = text.trim();
  if (!body) return [];
  if (/[·ㆍ]/.test(body)) out.add("가운데 점");
  if (/(^|[\s(])학생(은|이|는|이가)\s/.test(body)) out.add("학생 주어");
  if (/(^|\s)그(는|가|의)\s/.test(body)) out.add("그는·그가·그의");
  for (const s of splitSentences(body)) {
    if (/^["“'‘].*["”'’]\.?$/.test(s)) out.add("따옴표 문장");
    if (!/[.]$/.test(s)) out.add("마침표 없음");
    if (/(했다|하였다|이다|였다|한다|있다|된다)\.$/.test(s)) out.add("서술형 어미");
    if ((s.match(/,/g) ?? []).length >= 3) out.add("쉼표 과다");
  }
  return [...out];
}
