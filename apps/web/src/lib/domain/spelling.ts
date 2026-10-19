// 맞춤법·띄어쓰기 규칙 사전 (Figma N38 (e)): AI 없이 자주 틀리는 말만 찾는다. 순수 함수 — 화면·서버 공용.
// 바깥 맞춤법 API는 쓰지 않는다. 거짓 양성을 줄이려고 낱말 경계·앞뒤 조건을 둔다.
// basis(국립국어원 「한글 맞춤법」 조항 원문)는 원문을 확인하기 전까지 비워 둔다 (N34 금칙어와 같은 규칙).

export type SpellKind = "띄어쓰기" | "붙여쓰기" | "맞춤법";
export type SpellBasis = { quote: string; source: string; url?: string };
export type SpellHit = {
  start: number;
  end: number;
  from: string;
  to: string;
  kind: SpellKind;
  /** 행 설명 한 줄 ("의존 명사 '수'는 띄어 써요") */
  why: string;
  /** 펼침 설명 (규칙을 풀어 쓴 말 — 조항 원문 아님) */
  more?: string;
  basis?: SpellBasis;
  rule: string;
};

type Rule = {
  id: string;
  kind: SpellKind;
  re: RegExp;
  /** 걸린 말 → 고칠 말 (null 이면 이 자리는 넘긴다) */
  to: (m: RegExpExecArray) => string | null;
  why: string;
  more?: string;
  basis?: SpellBasis;
};

const H = "[가-힣]";
/** 받침이 ㄹ인 글자 (할 · 볼 · 될 …) */
function rieul(ch: string): boolean {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 === 8;
}
const word = (from: string, to: string, why: string): Rule => ({
  id: `word-${from}`, kind: "맞춤법", re: new RegExp(`(?<!${H})${from}`, "g"), to: () => to, why,
});

export const SPELL_RULES: Rule[] = [
  // 되 / 돼
  { id: "됬", kind: "맞춤법", re: /됬/g, to: () => "됐", why: "'되었'을 줄이면 '됐'이에요", more: "'되-'에 '-었-'이 붙어 줄면 '됐'으로 써요. '됬'은 없는 글자예요." },
  { id: "되요", kind: "맞춤법", re: /되요(?=[\s.,!?]|$)/g, to: () => "돼요", why: "'되어요'를 줄이면 '돼요'예요", more: "'되-' 뒤에 '-어요'가 붙어 줄면 '돼요'로 써요." },
  { id: "되서", kind: "맞춤법", re: /되서(?=[\s.,]|$)/g, to: () => "돼서", why: "'되어서'를 줄이면 '돼서'예요", more: "'되-' 뒤에 '-어서'가 붙어 줄면 '돼서'로 써요." },
  { id: "안되", kind: "띄어쓰기", re: new RegExp(`(?<=^|[\\s"'(“‘])안되(?=${H})`, "g"), to: () => "안 되", why: "부정의 '안' 뒤는 띄어 써요", more: "'안'은 뒤 말을 부정하는 부사라서 '안 되다'처럼 띄어 써요." },
  // 안 / 않
  { id: "안하", kind: "띄어쓰기", re: new RegExp(`(?<=^|[\\s"'(“‘])안하(?=${H})(?!무인)`, "g"), to: () => "안 하", why: "부정의 '안' 뒤는 띄어 써요", more: "'안'은 뒤 말을 부정하는 부사라서 '안 하다'처럼 띄어 써요." },
  { id: "지않", kind: "띄어쓰기", re: new RegExp(`(?<=${H})지않(?=${H})`, "g"), to: () => "지 않", why: "'-지 않다'는 띄어 써요", more: "'않다'는 앞말과 따로 쓰는 보조 용언이라 '하지 않고'처럼 띄어 써요." },
  // 로서 / 로써
  { id: "함으로서", kind: "맞춤법", re: /(?<=\S)함으로서/g, to: () => "함으로써", why: "방법·수단은 '-(으)로써'예요", more: "'-함으로써'는 그 일을 수단으로 삼는다는 뜻이라 '써'로 써요. '로서'는 자격(학생으로서)에 써요." },
  // 붙여 쓰기: ○○ 함으로써 → ○○함으로써
  { id: "띄운함으로써", kind: "붙여쓰기", re: new RegExp(`(?<!${H})(${H}{2,}) 함으로[써서]`, "g"), to: (m) => `${m[1]}함으로써`, why: "'-함으로써'는 앞말에 붙여 써요", more: "'제시하다'처럼 '하다'가 붙은 말은 한 낱말이라 '제시함으로써'로 붙여 써요." },
  // 의존 명사: 할수 있 · 할때 · 할줄
  {
    id: "ㄹ수", kind: "띄어쓰기", re: new RegExp(`(?<!${H})(${H}+)수(?=\\s?(?:있|없))`, "g"),
    to: (m) => (rieul(m[1].slice(-1)) ? `${m[1]} 수` : null), why: "의존 명사 '수'는 띄어 써요", more: "꾸미는 말('할') 뒤의 '수'는 의존 명사라서 '할 수 있다'처럼 띄어 써요.",
  },
  {
    id: "ㄹ때", kind: "띄어쓰기", re: new RegExp(`(?<!${H})(${H}+?)때(?=[\\s,.]|${H})`, "g"),
    to: (m) => (rieul(m[1].slice(-1)) ? `${m[1]} 때` : null), why: "'때'는 앞말과 띄어 써요", more: "'발표할 때'처럼 꾸미는 말 뒤의 '때'는 띄어 써요.",
  },
  {
    id: "ㄹ줄", kind: "띄어쓰기", re: new RegExp(`(?<!${H})(${H}+)줄(?=\\s?(?:알|몰|모르))`, "g"),
    to: (m) => (rieul(m[1].slice(-1)) ? `${m[1]} 줄` : null), why: "의존 명사 '줄'은 띄어 써요", more: "'할 줄 알다'의 '줄'은 의존 명사라서 띄어 써요.",
  },
  { id: "는데있어", kind: "띄어쓰기", re: /는데 있어/g, to: () => "는 데 있어", why: "'-는 데 있어'의 '데'는 띄어 써요", more: "'일·것'을 뜻하는 '데'는 의존 명사라서 '하는 데 있어'처럼 띄어 써요." },
  // 자주 틀리는 말
  word("몇일", "며칠", "'몇 일'이 아니라 '며칠'이 맞아요"),
  word("금새", "금세", "'금시에'를 줄인 말은 '금세'예요"),
  { id: "word-역활", kind: "맞춤법", re: /역활/g, to: () => "역할", why: "'역할(役割)'이 맞아요" },
  word("일일히", "일일이", "'일일이'가 맞아요"),
  word("제작년", "재작년", "지지난해는 '재작년'이에요"),
  { id: "word-어의없", kind: "맞춤법", re: /어의없/g, to: () => "어이없", why: "'어이없다'가 맞아요" },
  { id: "word-왠만", kind: "맞춤법", re: /왠만/g, to: () => "웬만", why: "'웬만하다'가 맞아요" },
  { id: "word-오랫만", kind: "맞춤법", re: /오랫만/g, to: () => "오랜만", why: "'오래간만'을 줄인 '오랜만'이 맞아요" },
  { id: "word-설레임", kind: "맞춤법", re: /설레임/g, to: () => "설렘", why: "'설레다'의 명사형은 '설렘'이에요" },
  { id: "word-바램", kind: "맞춤법", re: /(?<![가-힣])바램(?=[\s.,을이은과]|$)/g, to: () => "바람", why: "바라는 마음은 '바람'이에요" },
];

/** 본문에서 규칙 사전에 걸린 곳 (앞에서부터, 겹치면 먼저 걸린 것 하나만) */
export function spellCheck(text: string): SpellHit[] {
  const hits: SpellHit[] = [];
  for (const r of SPELL_RULES) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text))) {
      if (m[0] === "") { r.re.lastIndex++; continue; }
      const to = r.to(m);
      if (to == null || to === m[0]) continue;
      hits.push({ start: m.index, end: m.index + m[0].length, from: m[0], to, kind: r.kind, why: r.why, more: r.more, basis: r.basis, rule: r.id });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: SpellHit[] = [];
  let at = -1;
  for (const h of hits) {
    if (h.start < at) continue;
    out.push(h);
    at = h.end;
  }
  return out;
}

/** 걸린 자리들을 뒤에서부터 바꾼다 (자리가 어긋나지 않게) */
export function applySpell(text: string, hits: Pick<SpellHit, "start" | "end" | "from" | "to">[]): string {
  let out = text;
  for (const h of [...hits].sort((a, b) => b.start - a.start)) {
    if (out.slice(h.start, h.end) !== h.from) continue;
    out = out.slice(0, h.start) + h.to + out.slice(h.end);
  }
  return out;
}

/** 맞춤법 AI 검사 결과(from → to)를 본문 자리로: 본문에 그대로 있고 가명 표지(S012 · ○○)를 건드리지 않는 것만 */
export function placeAiFixes(text: string, fixes: { from: string; to: string; why: string }[], ruleHits: SpellHit[] = []): SpellHit[] {
  const out: SpellHit[] = [];
  const taken = ruleHits.map((h) => [h.start, h.end] as const);
  for (const f of fixes) {
    const from = f.from;
    if (!from.trim() || from === f.to || from.length > 40 || f.to.length > 60) continue;
    if (/S\d{2,}|○○|#####/.test(from) || /S\d{2,}|○○|#####/.test(f.to)) continue;
    const at = text.indexOf(from);
    if (at < 0) continue;
    const end = at + from.length;
    if (taken.some(([a, b]) => at < b && end > a) || out.some((h) => at < h.end && end > h.start)) continue;
    const spaceOnly = from.replace(/\s/g, "") === f.to.replace(/\s/g, "");
    const kind: SpellKind = spaceOnly ? (f.to.length > from.length ? "띄어쓰기" : "붙여쓰기") : "맞춤법";
    out.push({ start: at, end, from, to: f.to, kind, why: f.why.slice(0, 60) || "AI가 고칠 말을 찾았어요", rule: "ai" });
  }
  return out.sort((a, b) => a.start - b.start);
}
