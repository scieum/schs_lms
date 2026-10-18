// 누가기록 한꺼번에 쓰기 (Figma N28): 공통 내용 한 번 + 학생마다 참여도·특징 칩 → 규칙으로 문장을 붙인 학생별 글.
// AI 없이 정해진 문장만 붙인다. 순서 = [활동명] + 공통 문장 + 참여도 문장 + 특징 문장(팔레트 순서), 같은 문장은 한 번만.
import { withActivity } from "./activity-name";

export type TraitGroup = "참여도" | "특징";
export type Trait = { id: string; group: TraitGroup; label: string; sentence: string; custom?: boolean };

/** 참여도는 긍정 셋만 (기록에 부정 표현을 넣지 않는다). 학생마다 하나 */
export const LEVEL_TRAITS: Trait[] = [
  { id: "lead", group: "참여도", label: "주도적", sentence: "활동 전 과정을 주도적으로 이끎." },
  { id: "active", group: "참여도", label: "적극적", sentence: "활동에 적극적으로 참여함." },
  { id: "sincere", group: "참여도", label: "성실함", sentence: "맡은 일을 성실하게 해냄." },
];

/** 특징은 여러 개. 팔레트 순서가 곧 문장 순서 */
export const FEATURE_TRAITS: Trait[] = [
  { id: "present", group: "특징", label: "발표", sentence: "결과를 정리해 발표함." },
  { id: "question", group: "특징", label: "질문", sentence: "궁금한 점을 질문하며 원리를 확인함." },
  { id: "leader", group: "특징", label: "모둠장", sentence: "모둠장으로 역할을 나누고 진행을 이끎." },
  { id: "record", group: "특징", label: "기록 담당", sentence: "활동 과정을 꼼꼼히 기록함." },
  { id: "research", group: "특징", label: "자료 조사", sentence: "필요한 자료를 찾아 정리함." },
  { id: "idea", group: "특징", label: "아이디어 제시", sentence: "새로운 아이디어를 제시함." },
  { id: "help", group: "특징", label: "친구 도움", sentence: "어려워하는 친구를 도움." },
  { id: "finish", group: "특징", label: "끝까지 해냄", sentence: "어려움이 있어도 끝까지 마무리함." },
];

export const TRAIT_LABEL_MAX = 12;
export const TRAIT_SENTENCE_MAX = 80;

/** 문장 끝에 마침표가 없으면 붙인다 (공백 정리) */
export function endSentence(text: string): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return /[.!?。]$/.test(t) ? t : `${t}.`;
}

/** 교사가 더한 특징: 이름 12자 · 문장 80자, 둘 다 있어야 한다. 이미 있는 이름이면 null */
export function makeCustomTrait(label: string, sentence: string, existing: Trait[]): Trait | null {
  const l = String(label ?? "").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, TRAIT_LABEL_MAX);
  const s = endSentence(String(sentence ?? "").slice(0, TRAIT_SENTENCE_MAX));
  if (!l || s.length < 2) return null;
  if (existing.some((t) => t.label === l)) return null;
  let n = existing.length;
  let id = `c${n}`;
  while (existing.some((t) => t.id === id)) id = `c${++n}`;
  return { id, group: "특징", label: l, sentence: s, custom: true };
}

export type StudentTraits = { level?: string; features: string[] };

/** 참여도는 바꾸고(하나만), 특징은 더한다 (일괄 넣기) */
export function applyTraits(cur: StudentTraits | undefined, add: { level?: string; features: string[] }): StudentTraits {
  const base = cur ?? { features: [] };
  return { level: add.level ?? base.level, features: [...new Set([...base.features, ...add.features])] };
}

/** 학생별 글: [활동명] + 공통 문장 + 참여도 문장 + 특징 문장(팔레트 순서). 같은 문장은 한 번만 */
export function composeTraitLog(input: { activity: string; shared: string; level?: string; features: string[] }, palette: Trait[] = [...LEVEL_TRAITS, ...FEATURE_TRAITS]): string {
  const parts: string[] = [];
  const push = (s: string) => {
    const t = endSentence(s);
    if (t && !parts.includes(t)) parts.push(t);
  };
  push(input.shared);
  const level = palette.find((t) => t.group === "참여도" && t.id === input.level);
  if (level) push(level.sentence);
  const picked = new Set(input.features);
  for (const t of palette) if (t.group === "특징" && picked.has(t.id)) push(t.sentence);
  return withActivity(input.activity, parts.join(" "));
}
