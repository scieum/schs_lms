// 생기부 금칙어: 학교생활기록부 기재요령(교육부)의 "기재 금지·미반영" 항목을 낱말 규칙으로 옮긴 것.
// - ban: 기재요령상 쓰면 안 되는 내용 → 확정·저장 확정을 막는다
// - check: 맥락에 따라 문제가 될 수 있는 내용 → 경고만 (교사가 판단)
// 해마다 기재요령이 바뀌므로 학교 담당자가 최신 기재요령과 대조해 이 목록을 고친다.
// 근거(basis)는 「2026학년도 학교생활기록부 기재요령(고등학교)」 원문에서 옮겨 적은 것만 둔다 (2026-10-19 확인, 쪽 = 인쇄 쪽수).

export type ForbiddenLevel = "ban" | "check";

/** 기재요령 원문 짧은 인용 + 출처 (Figma N34 근거 블록). 원문을 확인한 것만 넣는다 — 없으면 화면이 근거 블록을 숨긴다 */
export type ForbiddenBasis = { quote: string; source: string; url?: string };

/** 규칙으로 고칠 말: to=null 이면 그 구를 뺀다. 규칙으로 못 고치면 undefined(→ AI로 고치기) */
export type ForbiddenFix = { from: string; to: string | null };

type FixFn = (text: string, hit: { index: number; word: string; phrase: string }, context?: string) => ForbiddenFix | undefined;

export interface ForbiddenRule {
  /** 규칙 이름 (예: "school") */
  id: string;
  category: string;
  level: ForbiddenLevel;
  /** 기재요령 근거 한 줄 (편집기에 보여 준다 · "왜") */
  reason: string;
  /** 검사 행 설명 줄 (짧게) */
  short: string;
  pattern: RegExp;
  basis?: ForbiddenBasis;
  /** "○○대학교 주최 ○○대회"처럼 뒤 어절까지 한 구로 볼 때 */
  wide?: boolean;
  /** 고칠 말 (본문 · 걸린 자리 · 걸린 구 · 과목명) */
  fix?: FixFn;
}

/** 2026학년도 학교생활기록부 기재요령(고등학교) — 울산광역시교육청 게시 원본 (교육부·17개 시도교육청 공통, 첨부 PDF) */
export const GUIDE_URL = "https://use.go.kr/user/bbs/BD_selectBbs.do?q_bbsSn=1971&q_bbsDocNo=20260226090749132";
const guide = (page: number, quote: string): ForbiddenBasis => ({ quote, source: `2026 기재요령 ${page}쪽`, url: GUIDE_URL });

// 「학교생활기록부 작성 시 유의사항」 2·3항 (18~19쪽)
const BASIS = {
  paper: guide(18, "논문을 학회지 등에 투고 또는 등재하거나 학회 등에서 발표한 사실"),
  award: guide(18, "교외대회는 학교장의 참가 허락을 받아 참여한 경우에도 기재할 수 없음."),
  mock: guide(18, "모의고사･전국연합학력평가 성적(원점수, 석차, 석차등급, 백분위 등 성적 관련 내용 일체)"),
  parent: guide(18, "부모(친인척 포함)의 사회･경제적 지위(직종명, 직업명, 직장명, 직위명 등) 암시 내용"),
  name: guide(19, "구체적인 특정 대학명, 기관명(기구, 단체, 조직 등 포함), 상호명, 강사명 등"),
  outside: guide(18, "학교교육계획 이외의 체험활동은 교육관련기관(…)에서 주최하고 주관한 행사, 봉사활동 실적 등만 학교장이 승인한 경우에 한해 기재 가능함."),
  scholarship: guide(18, "장학생･장학금 관련 내용"),
} satisfies Record<string, ForbiddenBasis>;

// ---------- 걸린 구 · 고칠 말 ----------

const JOSA = /(?:에서의|에서는|에서|에게|으로|이라는|라는|로|의|에|을|를|은|는|이|가|와|과|도)$/;
const HOST = /^(?:주최|주관|후원|부설|주최의|주관의)$/;
const isGap = (c: string | undefined) => c === undefined || /[\s.,!?;:()「」“”"']/.test(c);

/** 걸린 낱말이 든 어절(조사는 뗌). wide 면 "주최·주관" 뒤 어절까지 한 구로 */
export function phraseAt(text: string, index: number, word: string, wide = false): string {
  let s = index;
  while (s > 0 && !isGap(text[s - 1])) s--;
  let e = index + word.length;
  while (e < text.length && !isGap(text[e])) e++;
  if (wide) {
    const rest = text.slice(e).match(/^\s+(\S+?)\s+([^\s.,!?]+)/);
    if (rest && HOST.test(rest[1])) e += rest[0].length;
  }
  const phrase = text.slice(s, e);
  const stripped = phrase.replace(JOSA, "");
  // 걸린 낱말까지 깎이면 안 된다
  return stripped.length >= index - s + word.length ? stripped : phrase;
}

/** 그 자리를 품은 구: 문장 처음부터 다음 쉼표까지(", " 포함), 쉼표가 없으면 문장 전체(뒤 공백 포함) */
export function clauseAt(text: string, index: number): string {
  let s = index;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  while (s < index && /\s/.test(text[s])) s++;
  const rest = text.slice(index);
  const comma = rest.search(/,/);
  const stop = rest.search(/[.!?](?:\s|$)|\n/);
  if (comma >= 0 && (stop < 0 || comma < stop)) {
    const m = rest.slice(comma).match(/^,\s*/)!;
    return text.slice(s, index + comma + m[0].length);
  }
  const end = stop < 0 ? text.length : index + stop + 1;
  const tail = text.slice(end).match(/^[ \t]*/)![0];
  return text.slice(s, end + tail.length);
}

const ACT = /(탐구|실험|발명|토론|글쓰기|코딩)$/;
/** "과학탐구대회" → "과학 탐구 활동" (대회 이름에서 교과·활동만 남긴다) */
export function activityOf(eventName: string, context?: string): string {
  const name = eventName.replace(JOSA, "");
  const core = name.replace(/(?:경진)?대회$|올림피아드$|캠프$|축제$|박람회$|페스티벌$|챌린지$/, "");
  if (core !== name && /[가-힣]{2,}/.test(core)) {
    const spaced = core.replace(/(?<=[가-힣])(탐구|실험|발명|토론|글쓰기|코딩)$/, " $1");
    return ACT.test(spaced) ? `${spaced} 활동` : `${spaced} 탐구 활동`;
  }
  return context ? `${context} 탐구 활동` : "탐구 활동";
}

const fixSchool: FixFn = (text, hit, context) => {
  const words = hit.phrase.split(/\s+/);
  if (words.length >= 3 && HOST.test(words[1])) {
    // "○○대학교 주최 ○○대회(에서 수상한 경험)" → "○○ 탐구 활동( 경험)"
    const act = activityOf(words[words.length - 1], context);
    const after = text.slice(hit.index + hit.phrase.length).match(/^(?:에서|에)\s*(?:수상한|입상한|참가한|참여한)\s*(경험)?/);
    if (after) return { from: hit.phrase + after[0], to: after[1] ? `${act} 경험` : act };
    return { from: hit.phrase, to: act };
  }
  if (/(?:대학교|대학원|대학|대)$/.test(hit.word)) return { from: hit.word, to: "대학" };
  return { from: hit.phrase, to: null };
};

const fixPaper: FixFn = (_text, hit) => (/논문$/.test(hit.word) ? { from: hit.word, to: "탐구 보고서" } : undefined);
const dropClause: FixFn = (text, hit) => ({ from: clauseAt(text, hit.index), to: null });

export const FORBIDDEN_RULES: ForbiddenRule[] = [
  {
    id: "paper", category: "논문·출판·특허", level: "ban",
    reason: "논문(학회지) 투고·등재·발표, 도서 출간, 지식재산권 출원·등록은 기재할 수 없어요",
    short: "논문·출판 실적은 쓸 수 없어요",
    pattern: /소논문|논문|학회지|학술지|학회\s?(?:발표|등재|투고)|등재|투고|출간|출판|저서|공저|특허|실용신안|지식재산권|상표\s?등록|디자인\s?등록/g,
    basis: BASIS.paper, fix: fixPaper,
  },
  {
    id: "award", category: "교외 수상·인증시험", level: "ban",
    reason: "교외 대회 수상, 공인어학시험·인증시험 점수·급수는 기재할 수 없어요",
    short: "교외 대회·인증시험은 쓸 수 없어요",
    pattern: /교외\s?(?:대회|수상)|올림피아드|토익|TOEIC|토플|TOEFL|텝스|TEPS|OPIc|오픽|JLPT|JPT|HSK|DELF|DELE|한국사\s?능력\s?검정|한자\s?능력|한국어\s?능력\s?시험|TOPIK|정보처리기사|컴퓨터\s?활용\s?능력|컴활/gi,
    basis: BASIS.award,
  },
  {
    id: "mock", category: "모의고사·성적 수치", level: "ban",
    reason: "모의고사·전국연합학력평가 성적, 석차·등급·백분위는 기재할 수 없어요",
    short: "모의고사·등급·석차는 쓸 수 없어요",
    pattern: /모의\s?고사|모의\s?평가|전국\s?연합|학력\s?평가|석차|백분위|\d\s?등급/g,
    basis: BASIS.mock, fix: dropClause,
  },
  {
    id: "parent", category: "부모·가족의 사회경제적 지위", level: "ban",
    reason: "부모(친인척)의 직업·직위·직장 등 사회·경제적 지위를 알 수 있는 내용은 기재할 수 없어요",
    short: "부모의 직업·직위는 쓸 수 없어요",
    pattern: /(?:아버지|어머니|아빠|엄마|부모님?|부친|모친|할아버지|할머니|삼촌|이모|고모|외삼촌|친척)(?:의|께서|가|는|이)?\s?(?:직업|직장|회사|직위|의사|변호사|판사|검사|교수|교사|목사|대표|사장|회장|이사|원장|공무원|국회의원|CEO|사업)/g,
    basis: BASIS.parent, fix: dropClause,
  },
  {
    id: "family", category: "가족 관계", level: "check",
    reason: "가족 이야기는 활동과 무관하면 빼고, 사회·경제적 지위가 드러나지 않게 써요",
    short: "가족 이야기는 꼭 필요할 때만 써요",
    pattern: /아버지|어머니|아빠|엄마|부모님?|부친|모친|할아버지|할머니|형제|자매|누나|언니|오빠|남동생|여동생|삼촌|이모|고모|친척|가족|가정\s?형편|한부모|다문화\s?가정/g,
    basis: BASIS.parent,
  },
  {
    id: "school", category: "학교명·대학명", level: "ban",
    reason: "학교명(출신 학교 포함)과 특정 대학명은 기재할 수 없어요",
    short: "학교명·대학명은 쓸 수 없어요",
    pattern: /[가-힣A-Za-z]{1,10}(?:대학교|대학원|초등학교|중학교|고등학교|여고|여중|과학고|외고|국제고|자사고)|속초고|서울대|연세대|고려대|카이스트|KAIST|포스텍|POSTECH|UNIST|GIST|DGIST|하버드|MIT|스탠퍼드|옥스퍼드|케임브리지/g,
    basis: BASIS.name, wide: true, fix: fixSchool,
  },
  {
    id: "org", category: "기관명·상호명·인명", level: "check",
    reason: "교외 기관명, 기업·상품명(상호명), 강사·저명인 이름은 쓰지 않는 것이 원칙이에요 (책 저자 표기는 기재요령 예외 확인)",
    short: "기관명·상호명은 쓰지 않아요",
    pattern: /연구소|연구원|재단|협회|진흥원|공사|㈜|\(주\)|주식회사|삼성|엘지|LG|현대자동차|SK|네이버|카카오|쿠팡|애플|구글|마이크로소프트|아마존|테슬라|엔비디아|유튜브|인스타그램|틱톡|넷플릭스|갤럭시|아이폰|챗GPT|ChatGPT|제미나이|클로드/gi,
    basis: BASIS.name, wide: true,
  },
  {
    id: "private", category: "사교육·교외 활동", level: "ban",
    reason: "사교육(학원·과외), 교외 기관 프로그램, 해외 활동 실적은 기재할 수 없어요",
    short: "사교육·교외 활동은 쓸 수 없어요",
    pattern: /학원|과외|인강|인터넷\s?강의|어학\s?연수|해외\s?(?:봉사|탐방|연수|캠프|활동)|교환\s?학생|영재\s?교육원|발명\s?교육원/g,
    basis: BASIS.outside, fix: dropClause,
  },
  {
    id: "scholarship", category: "장학·미반영 활동", level: "ban",
    reason: "장학생·장학금, 자율동아리·청소년단체·방과후학교 활동 내용은 기재하지 않아요",
    short: "장학·미반영 활동은 쓰지 않아요",
    pattern: /장학생|장학금|자율\s?동아리|청소년\s?단체|방과\s?후\s?학교/g,
    basis: BASIS.scholarship,
  },
  {
    // 기재요령에 기재 금지 문구가 따로 없다 (질병명은 제공 시 제외 항목) → 근거 블록 없음
    id: "sensitive", category: "민감 정보", level: "check",
    reason: "질병·장애·종교·정치 성향 등 민감한 개인 정보는 쓰지 않아요",
    short: "민감한 개인 정보는 쓰지 않아요",
    pattern: /장애(?!물)|질병|투병|입원|우울증|ADHD|교회|성당|사찰|불교|기독교|천주교|정당/gi,
  },
];

export interface ForbiddenHit {
  word: string;
  /** 걸린 말이 든 구 ("서울대학교 주최 과학탐구대회") */
  phrase: string;
  /** 본문에서 처음 걸린 자리 */
  index: number;
  ruleId: string;
  category: string;
  level: ForbiddenLevel;
  reason: string;
  short: string;
  basis?: ForbiddenBasis;
  fix?: ForbiddenFix;
}

/** 글에서 금칙어를 찾는다. 같은 낱말은 한 번만, ban 이 먼저. context = 과목명 (고칠 말에 쓴다) */
export function findForbidden(text: string, context?: string): ForbiddenHit[] {
  const out: ForbiddenHit[] = [];
  const seen = new Set<string>();
  for (const r of FORBIDDEN_RULES) {
    for (const m of text.matchAll(r.pattern)) {
      const word = m[0].trim();
      const key = `${r.category}:${word}`;
      if (!word || seen.has(key)) continue;
      const index = (m.index ?? 0) + m[0].indexOf(word);
      // 같은 자리를 더 엄한 규칙(ban)이 이미 잡았으면 check 는 건너뛴다
      if (r.level === "check" && out.some((h) => h.level === "ban" && (h.word.includes(word) || word.includes(h.word) || (index >= h.index && index < h.index + h.phrase.length)))) continue;
      seen.add(key);
      const phrase = phraseAt(text, index, word, r.wide);
      const fix = r.fix?.(text, { index, word, phrase }, context);
      out.push({ word, phrase, index, ruleId: r.id, category: r.category, level: r.level, reason: r.reason, short: r.short, basis: r.basis, fix });
    }
  }
  // ban 이 먼저, 같은 등급은 본문 순서대로
  return out.sort((a, b) => (a.level === b.level ? a.index - b.index : a.level === "ban" ? -1 : 1));
}

export const bannedOnly = (hits: ForbiddenHit[]) => hits.filter((h) => h.level === "ban");

/** 확정을 막는 메시지 (없으면 null) */
export function forbiddenBlock(text: string): string | null {
  const ban = bannedOnly(findForbidden(text));
  if (!ban.length) return null;
  return `기재 금지 표현이 있어 확정할 수 없어요: ${ban.slice(0, 4).map((h) => `'${h.word}'(${h.category})`).join(", ")}`;
}

/** 고칠 말을 본문에 적용한다 (빼기면 남은 공백·쉼표를 다듬는다). 못 찾으면 그대로 */
export function applyFix(text: string, fix: ForbiddenFix): string {
  const i = text.indexOf(fix.from);
  if (i < 0) return text;
  const out = text.slice(0, i) + (fix.to ?? "") + text.slice(i + fix.from.length);
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,])/g, "$1")
    .replace(/(^|[.!?][ \t]+)[,\s]+/g, "$1")
    .trim();
}

/** AI 프롬프트에 붙이는 금지 목록 */
export const FORBIDDEN_PROMPT = `기재 금지 (학교생활기록부 기재요령):
${FORBIDDEN_RULES.map((r) => `- ${r.category}: ${r.reason}`).join("\n")}
근거 자료에 이런 내용이 있어도 옮기지 않는다. 학교·대학·기관·기업 이름은 "지역 대학", "관련 기관"처럼 일반 명사로 바꾸거나 뺀다.`;
