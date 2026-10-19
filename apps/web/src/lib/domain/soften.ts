// 순화하기 (Figma N34 ③): 생기부에 쓰기 어려운 퉁명스러운 말을 규칙으로 찾는다 (AI 없이 · 알림 줄과 밑줄).
// 바꾸는 일은 AI(teacher-ai.softenMemo)가 한다. 여기서는 찾기만.

export type BluntHit = { word: string; start: number; end: number };

const BLUNT = new RegExp(
  [
    "졸(?:고|았|아서|면서|기|다)",
    "잠을\\s?(?:잠|자고|잤|잔다)",
    // "제안함"·"편안한"이 걸리지 않게 앞이 낱말 경계일 때만
    "(?<![가-힣])안\\s?(?:냄|내고|냈|낸다|내지|함|하고|했|한다|가져옴|가져오고|가져왔)",
    "(?<![가-힣])못\\s?(?:냄|내고|냈|가져옴|가져왔)",
    "떠듦|떠든다|떠들고|떠들어|떠들었",
    "산만(?:함|하고|해|하다|한)?",
    "불량",
    "게으름|게으르(?:고|다|며)|게을러",
    "무례(?:함|하고|하다|한)?|버릇\\s?없(?:음|고|다|는)?",
    "대듦|대든다|대들고|대들었",
    "지각이\\s?잦(?:음|고|다|은)?|결석이\\s?잦(?:음|고|다|은)?",
    "말을\\s?안\\s?들(?:음|어|었|고)",
    "엎드려\\s?(?:잠|잔다|자고)",
    "핸드폰만|폰만\\s?봄|딴짓",
  ].join("|"),
  "g",
);

/** 메모에서 퉁명스러운 말과 자리 */
export function bluntWords(text: string): BluntHit[] {
  const out: BluntHit[] = [];
  for (const m of text.matchAll(BLUNT)) {
    const start = m.index ?? 0;
    out.push({ word: m[0], start, end: start + m[0].length });
  }
  return out;
}

/** 알림 줄 "‘졸고’ ‘안 냄’" (같은 말은 한 번, 최대 3개) */
export function bluntLine(hits: BluntHit[]): string {
  return [...new Set(hits.map((h) => h.word))].slice(0, 3).map((w) => `‘${w}’`).join(" ");
}
