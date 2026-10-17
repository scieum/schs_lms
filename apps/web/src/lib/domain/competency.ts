import { sentences } from "./writing";

// 역량 보기 (Figma N11): 생기부 문장을 대입 학생부종합전형 평가 3대 역량(2024 개편 공통 평가요소)으로 나눠 색으로 보여 준다.
// AI가 문장마다 고르고, AI가 꺼져 있으면 아래 낱말 규칙으로 고른다. 어느 쪽이든 교사가 참고로만 본다.

export const COMPETENCIES = ["학업", "진로", "공동체"] as const;
export type Competency = (typeof COMPETENCIES)[number];

export const COMPETENCY_LABEL: Record<Competency, string> = { 학업: "학업역량", 진로: "진로역량", 공동체: "공동체역량" };

/** 평가항목 10개 (대교협 「학생부종합전형 공통 평가요소 및 평가항목」 2022). 화면 이름표는 SUB_SHORT */
export const SUB_ITEMS: Record<Competency, readonly string[]> = {
  학업: ["학업성취도", "학업태도", "탐구력"],
  진로: ["전공(계열) 관련 교과 이수 노력", "전공(계열) 관련 교과 성취도", "진로 탐색 활동과 경험"],
  공동체: ["협업과 소통능력", "나눔과 배려", "성실성과 규칙준수", "리더십"],
};

/** 좁은 화면용 짧은 이름 */
export const SUB_SHORT: Record<string, string> = {
  "전공(계열) 관련 교과 이수 노력": "교과 이수 노력",
  "전공(계열) 관련 교과 성취도": "교과 성취도",
  "진로 탐색 활동과 경험": "진로 탐색",
  "협업과 소통능력": "협업과 소통",
  "성실성과 규칙준수": "성실·규칙준수",
};
export const subLabel = (sub: string) => SUB_SHORT[sub] ?? sub;

/** 모든 평가항목 (역량 순서대로) */
export const ALL_SUBS = COMPETENCIES.flatMap((c) => SUB_ITEMS[c].map((sub) => ({ competency: c, sub })));

export type TaggedSentence = { text: string; competency: Competency | null; sub: string | null };

// 규칙: 낱말이 많이 걸린 역량을 고른다 (같으면 학업 > 진로 > 공동체)
const RULES: { c: Competency; sub: string; words: RegExp }[] = [
  { c: "학업", sub: "탐구력", words: /탐구|실험|가설|분석|측정|검증|조사|자료|원리|모델|보고서|논문|오차|변인|설계|증명/g },
  { c: "학업", sub: "학업태도", words: /질문|스스로|자기주도|복습|예습|오답|끝까지|집중|호기심|꾸준히 공부|학습 계획/g },
  { c: "학업", sub: "학업성취도", words: /이해|개념|풀이|해결|적용|수준 높|정확하게|논리/g },
  { c: "진로", sub: "진로 탐색 활동과 경험", words: /진로|희망|꿈|직업|학과|분야로 진출|관심 분야|탐방|체험/g },
  { c: "진로", sub: "전공(계열) 관련 교과 이수 노력", words: /심화|선택 과목|이수|추가로 공부|관련 교과|전공/g },
  { c: "진로", sub: "전공(계열) 관련 교과 성취도", words: /연계|확장|관련 개념|전공 지식|응용/g },
  { c: "공동체", sub: "협업과 소통능력", words: /모둠|협력|협업|토의|토론|발표|소통|의견|경청|공유|함께/g },
  { c: "공동체", sub: "나눔과 배려", words: /배려|도움|도와|나눔|봉사|멘토|친구들에게 설명|격려/g },
  { c: "공동체", sub: "성실성과 규칙준수", words: /성실|책임|규칙|약속|맡은 역할|빠짐없이|꼼꼼/g },
  { c: "공동체", sub: "리더십", words: /이끌|주도하|리더|회장|부장|조장|대표|기획|조율/g },
];

export function tagByRules(text: string): TaggedSentence[] {
  return sentences(text).map((s) => {
    const score = new Map<Competency, number>();
    let best: { c: Competency; sub: string; n: number } | null = null;
    for (const r of RULES) {
      const n = s.match(r.words)?.length ?? 0;
      if (!n) continue;
      score.set(r.c, (score.get(r.c) ?? 0) + n);
      if (!best || n > best.n) best = { c: r.c, sub: r.sub, n };
    }
    if (!best) return { text: s, competency: null, sub: null };
    const top = COMPETENCIES.reduce((a, c) => ((score.get(c) ?? 0) > (score.get(a) ?? 0) ? c : a), COMPETENCIES[0]);
    const sub = top === best.c ? best.sub : RULES.find((r) => r.c === top && s.match(r.words))!.sub;
    return { text: s, competency: top, sub };
  });
}

/** AI가 문장 번호로 고른 결과를 문장에 붙인다. 이상한 값은 '없음'으로 */
export function applyTags(text: string, picks: { index: number; competency: string | null; sub: string | null }[]): TaggedSentence[] {
  return sentences(text).map((s, i) => {
    const p = picks.find((x) => x.index === i);
    const c = (COMPETENCIES as readonly string[]).includes(p?.competency ?? "") ? (p!.competency as Competency) : null;
    const sub = c && p?.sub && SUB_ITEMS[c].includes(p.sub) ? p.sub : c ? SUB_ITEMS[c][0] : null;
    return { text: s, competency: c, sub };
  });
}

export function competencySummary(tagged: TaggedSentence[]) {
  const counts = Object.fromEntries(COMPETENCIES.map((c) => [c, tagged.filter((t) => t.competency === c).length])) as Record<Competency, number>;
  const subs = Object.fromEntries(ALL_SUBS.map(({ sub }) => [sub, tagged.filter((t) => t.sub === sub).length])) as Record<string, number>;
  return { counts, subs, missing: COMPETENCIES.filter((c) => !counts[c]), missingSubs: ALL_SUBS.filter(({ sub }) => !subs[sub]) };
}
