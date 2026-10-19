// 과장 막기 (Figma N41, 2026-10-19 "메모 하나 가지고 바로 A라고 하는 건 아니지 않아?").
// AI가 메모 한두 개만 보고 최상급 칭찬(탁월함·뛰어남·인상적임·돋보임 …)이나 학생 전체를 단정하는 총평을 쓰지 않게 한다.
// - 프롬프트 줄(praisePrompt): 성취수준을 안 골랐으면 사실 그대로(LV1~LV2), 근거가 적으면 총평·최상급 금지.
// - 사후 검사(overPraise): 자동 검사 "근거보다 높은 평가" 행 (확인 — 확정을 막지 않는다).
// 서버·클라이언트 공용 순수 함수.

import type { Level } from "./achievement";

/** 최상급 칭찬어: stem 은 근거에서 찾을 뿌리, soft 는 문장 끝 그대로일 때 바꿀 말 */
export const TOP_PRAISE: { stem: string; re: RegExp; soft?: Record<string, string> }[] = [
  { stem: "탁월", re: /탁월(?:함|한|하게|하며|하여|했|하고|성)?/g, soft: { 탁월함: "충실함" } },
  { stem: "뛰어", re: /뛰어(?:남|난|나게|나며|나고|났)/g, soft: { 뛰어남: "잘 드러남" } },
  { stem: "월등", re: /월등(?:함|한|하게|히|하며)?/g, soft: { 월등함: "충실함" } },
  { stem: "출중", re: /출중(?:함|한|하게|하며)?/g, soft: { 출중함: "충실함" } },
  { stem: "압도적", re: /압도적(?:임|인|으로)?/g },
  { stem: "인상적", re: /인상적(?:임|인|으로|이었음)?/g, soft: { 인상적임: "드러남" } },
  { stem: "인상깊", re: /인상\s?깊(?:음|은|었음|게)?/g, soft: { "인상 깊었음": "드러남" } },
  { stem: "두드러", re: /두드러(?:짐|진|지게|지며|졌음)/g, soft: { 두드러짐: "드러남" } },
  { stem: "돋보", re: /돋보(?:임|인|이며|였음|이는|이게)/g, soft: { 돋보임: "드러남" } },
  { stem: "독보적", re: /독보적(?:임|인|으로)?/g },
  { stem: "발군", re: /발군(?:임|의)?/g },
];
/** 프롬프트에 그대로 넣는 낱말 목록 */
export const TOP_PRAISE_WORDS = "탁월함, 뛰어남, 월등함, 출중함, 압도적임, 인상적임, 두드러짐, 돋보임, 독보적임";

/** 근거가 적다: 메모·자료 FEW_COUNT 개 이하이거나 글이 FEW_CHARS 자 미만 */
export const FEW_COUNT = 2;
export const FEW_CHARS = 200;
export type EvidenceAmount = { count: number; chars: number };
export const isFewEvidence = (e: EvidenceAmount) => e.count <= FEW_COUNT || e.chars < FEW_CHARS;
export const evidenceAmount = (texts: string[]): EvidenceAmount => {
  const list = texts.map((t) => t.trim()).filter(Boolean);
  return { count: list.length, chars: list.reduce((n, t) => n + t.replace(/\s/g, "").length, 0) };
};

/** 최상급 칭찬을 써도 되는 수준: A · 상 */
export const isTopLevel = (level: Level | null | undefined) => level === "A" || level === "상";
const LOW = new Set<Level>(["D", "E", "하"]);

/**
 * 시스템 프롬프트 끝에 붙는 평가 수위 규칙 (학생 정보 없이).
 * level 은 고른 성취수준(없으면 null), amount 는 근거 자료의 양.
 */
export function praisePrompt(level: Level | null | undefined, amount: EvidenceAmount): string {
  const lines = ["", "", "평가 수위 규칙(과장 막기, 다른 규칙보다 먼저 지킴):"];
  if (!level) {
    lines.push(
      "- 성취수준을 고르지 않았음. 근거 자료에 적힌 사실과 행동만 쓰고 문장 끝은 LV1~LV2 서술어(수행함, 설명함, 정리함, 적용함, 보완함 등)로 맺음.",
      `- 최상급 칭찬어(${TOP_PRAISE_WORDS})는 근거 자료(교사 메모)에 그 말이나 같은 평가가 직접 적혀 있을 때만 씀. 행동을 보고 짐작해 높이지 않음.`,
    );
  } else if (isTopLevel(level)) {
    lines.push(
      "- 고른 수준에 맞춰 상위 서술어를 쓸 수 있으나 근거 자료에 없는 성과, 수상, 결과, 평가는 만들지 않음.",
      `- 최상급 칭찬어(${TOP_PRAISE_WORDS})는 글 전체에서 한 번까지만, 그 근거가 된 구체적 장면 바로 뒤에만 씀.`,
    );
  } else if (LOW.has(level)) {
    lines.push(
      "- 노력과 참여 사실 중심으로 긍정적이되 담백하게 씀. 부정적인 말은 쓰지 않음.",
      `- 우수함과 최상급 칭찬어(${TOP_PRAISE_WORDS})는 쓰지 않음.`,
    );
  } else {
    lines.push(
      "- 고른 수준의 말투를 따르되 문장 끝은 주로 LV1~LV2 서술어로 맺음.",
      `- 최상급 칭찬어(${TOP_PRAISE_WORDS})는 근거 자료에 그 말이나 같은 평가가 직접 적혀 있을 때만 씀.`,
    );
  }
  if (isFewEvidence(amount)) {
    lines.push(
      `- 근거 자료가 ${amount.count}개로 적음. 관찰된 장면만 쓰고, 이 한두 장면으로 학생 전체를 단정하는 총평('~한 학생임', '~능력이 뛰어남', '~역량이 돋보이는 학생임')을 쓰지 않음. LV3 서술어도 쓰지 않음.`,
      "- 분량이 모자라도 없는 활동, 성과, 평가로 채우지 않음. 짧으면 짧은 대로 둠.",
    );
  }
  lines.push("- 모범 구성의 총평은 근거 자료에 여러 장면이 쌓여 있을 때만 쓰고, 쓸 때도 근거에 적힌 행동으로 맺음.");
  return lines.join("\n");
}

export type PraiseHit = { word: string; stem: string; start: number; end: number; soft?: string };

/** 글 속 최상급 칭찬어 (자리 포함) */
export function findTopPraise(text: string): PraiseHit[] {
  const out: PraiseHit[] = [];
  for (const p of TOP_PRAISE) {
    for (const m of text.matchAll(p.re)) {
      const start = m.index ?? 0;
      out.push({ word: m[0], stem: p.stem, start, end: start + m[0].length, soft: p.soft?.[m[0]] });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * 근거보다 높은 평가: 수준 A·상을 고르지 않았는데 최상급 칭찬어가 있고, 그 말(뿌리)이 근거 자료에 없으면.
 * evidence 는 근거 글(메모·누가기록·설문 답) 전체. 근거를 모르면(빈 글) 근거에 없다고 본다.
 */
export function overPraise(text: string, level: Level | null | undefined, evidence: string): PraiseHit[] {
  if (isTopLevel(level)) return [];
  const ev = evidence.replace(/\s/g, "");
  return findTopPraise(text).filter((h) => !ev.includes(h.stem));
}

export const OVER_PRAISE_WHY = "메모에 없는 높은 평가예요. 한두 장면으로 학생 전체를 높이 평가하지 않게, 관찰한 행동을 그대로 쓰거나 낮은 말로 바꿔 주세요. 성취수준 A(상)를 골랐다면 그대로 둬도 돼요.";
