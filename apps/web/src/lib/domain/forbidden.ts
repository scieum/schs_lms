// 생기부 금칙어: 학교생활기록부 기재요령(교육부)의 "기재 금지·미반영" 항목을 낱말 규칙으로 옮긴 것.
// - ban: 기재요령상 쓰면 안 되는 내용 → 확정·저장 확정을 막는다
// - check: 맥락에 따라 문제가 될 수 있는 내용 → 경고만 (교사가 판단)
// 해마다 기재요령이 바뀌므로 학교 담당자가 최신 기재요령과 대조해 이 목록을 고친다.

export type ForbiddenLevel = "ban" | "check";

export interface ForbiddenRule {
  category: string;
  level: ForbiddenLevel;
  /** 기재요령 근거 한 줄 (편집기에 보여 준다) */
  reason: string;
  pattern: RegExp;
}

export const FORBIDDEN_RULES: ForbiddenRule[] = [
  {
    category: "논문·출판·특허", level: "ban",
    reason: "논문(학회지) 투고·등재·발표, 도서 출간, 지식재산권 출원·등록은 기재할 수 없어요",
    pattern: /소논문|논문|학회지|학술지|학회\s?(?:발표|등재|투고)|등재|투고|출간|출판|저서|공저|특허|실용신안|지식재산권|상표\s?등록|디자인\s?등록/g,
  },
  {
    category: "교외 수상·인증시험", level: "ban",
    reason: "교외 대회 수상, 공인어학시험·인증시험 점수·급수는 기재할 수 없어요",
    pattern: /교외\s?(?:대회|수상)|올림피아드|토익|TOEIC|토플|TOEFL|텝스|TEPS|OPIc|오픽|JLPT|JPT|HSK|DELF|DELE|한국사\s?능력\s?검정|한자\s?능력|한국어\s?능력\s?시험|TOPIK|정보처리기사|컴퓨터\s?활용\s?능력|컴활/gi,
  },
  {
    category: "모의고사·성적 수치", level: "ban",
    reason: "모의고사·전국연합학력평가 성적, 석차·등급·백분위는 기재할 수 없어요",
    pattern: /모의\s?고사|모의\s?평가|전국\s?연합|학력\s?평가|석차|백분위|\d\s?등급/g,
  },
  {
    category: "부모·가족의 사회경제적 지위", level: "ban",
    reason: "부모(친인척)의 직업·직위·직장 등 사회·경제적 지위를 알 수 있는 내용은 기재할 수 없어요",
    pattern: /(?:아버지|어머니|아빠|엄마|부모님?|부친|모친|할아버지|할머니|삼촌|이모|고모|외삼촌|친척)(?:의|께서|가|는|이)?\s?(?:직업|직장|회사|직위|의사|변호사|판사|검사|교수|교사|목사|대표|사장|회장|이사|원장|공무원|국회의원|CEO|사업)/g,
  },
  {
    category: "가족 관계", level: "check",
    reason: "가족 이야기는 활동과 무관하면 빼고, 사회·경제적 지위가 드러나지 않게 써요",
    pattern: /아버지|어머니|아빠|엄마|부모님?|부친|모친|할아버지|할머니|형제|자매|누나|언니|오빠|남동생|여동생|삼촌|이모|고모|친척|가족|가정\s?형편|한부모|다문화\s?가정/g,
  },
  {
    category: "학교명·대학명", level: "ban",
    reason: "학교명(출신 학교 포함)과 특정 대학명은 기재할 수 없어요",
    pattern: /[가-힣A-Za-z]{1,10}(?:대학교|대학원|초등학교|중학교|고등학교|여고|여중|과학고|외고|국제고|자사고)|속초고|서울대|연세대|고려대|카이스트|KAIST|포스텍|POSTECH|UNIST|GIST|DGIST|하버드|MIT|스탠퍼드|옥스퍼드|케임브리지/g,
  },
  {
    category: "기관명·상호명·인명", level: "check",
    reason: "교외 기관명, 기업·상품명(상호명), 강사·저명인 이름은 쓰지 않는 것이 원칙이에요 (책 저자 표기는 기재요령 예외 확인)",
    pattern: /연구소|연구원|재단|협회|진흥원|공사|㈜|\(주\)|주식회사|삼성|엘지|LG|현대자동차|SK|네이버|카카오|쿠팡|애플|구글|마이크로소프트|아마존|테슬라|엔비디아|유튜브|인스타그램|틱톡|넷플릭스|갤럭시|아이폰|챗GPT|ChatGPT|제미나이|클로드/gi,
  },
  {
    category: "사교육·교외 활동", level: "ban",
    reason: "사교육(학원·과외), 교외 기관 프로그램, 해외 활동 실적은 기재할 수 없어요",
    pattern: /학원|과외|인강|인터넷\s?강의|어학\s?연수|해외\s?(?:봉사|탐방|연수|캠프|활동)|교환\s?학생|영재\s?교육원|발명\s?교육원/g,
  },
  {
    category: "장학·미반영 활동", level: "ban",
    reason: "장학생·장학금, 자율동아리·청소년단체·방과후학교 활동 내용은 기재하지 않아요",
    pattern: /장학생|장학금|자율\s?동아리|청소년\s?단체|방과\s?후\s?학교/g,
  },
  {
    category: "민감 정보", level: "check",
    reason: "질병·장애·종교·정치 성향 등 민감한 개인 정보는 쓰지 않아요",
    pattern: /장애(?!물)|질병|투병|입원|우울증|ADHD|교회|성당|사찰|불교|기독교|천주교|정당/gi,
  },
];

export interface ForbiddenHit {
  word: string;
  category: string;
  level: ForbiddenLevel;
  reason: string;
}

/** 글에서 금칙어를 찾는다. 같은 낱말은 한 번만, ban 이 먼저 */
export function findForbidden(text: string): ForbiddenHit[] {
  const out: ForbiddenHit[] = [];
  const seen = new Set<string>();
  for (const r of FORBIDDEN_RULES) {
    for (const m of text.matchAll(r.pattern)) {
      const word = m[0].trim();
      const key = `${r.category}:${word}`;
      if (!word || seen.has(key)) continue;
      // 같은 자리를 더 엄한 규칙(ban)이 이미 잡았으면 check 는 건너뛴다
      if (r.level === "check" && out.some((h) => h.level === "ban" && (h.word.includes(word) || word.includes(h.word)))) continue;
      seen.add(key);
      out.push({ word, category: r.category, level: r.level, reason: r.reason });
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "ban" ? -1 : 1));
}

export const bannedOnly = (hits: ForbiddenHit[]) => hits.filter((h) => h.level === "ban");

/** 확정을 막는 메시지 (없으면 null) */
export function forbiddenBlock(text: string): string | null {
  const ban = bannedOnly(findForbidden(text));
  if (!ban.length) return null;
  return `기재 금지 표현이 있어 확정할 수 없어요: ${ban.slice(0, 4).map((h) => `'${h.word}'(${h.category})`).join(", ")}`;
}

/** AI 프롬프트에 붙이는 금지 목록 */
export const FORBIDDEN_PROMPT = `기재 금지 (학교생활기록부 기재요령):
${FORBIDDEN_RULES.map((r) => `- ${r.category}: ${r.reason}`).join("\n")}
근거 자료에 이런 내용이 있어도 옮기지 않는다. 학교·대학·기관·기업 이름은 "지역 대학", "관련 기관"처럼 일반 명사로 바꾸거나 뺀다.`;
