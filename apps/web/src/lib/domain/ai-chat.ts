// AI 작업창 (Figma N70, 2026-10-22): 홈 바로 아래. 무엇이든 시키고, @로 맥락(학생 · 수업 · 프롬프트 · 협업방 · 팁)을 붙인다.
// 대화는 화면에만 둔다(저장 안 함). 학생은 가명ID로만 AI에 간다.

export const MENTION_KINDS = ["학생", "수업", "프롬프트", "협업방", "팁"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];
export const isMentionKind = (v: unknown): v is MentionKind => (MENTION_KINDS as readonly string[]).includes(String(v));
/** id: 학생 = "<범위key>|<학생id>", 수업 = 범위key, 그 밖은 글 · 방 id */
export type Mention = { kind: MentionKind; id: string; label: string; sub?: string };

/** 모델 고르기 (입력칸 ▾): 자동 = 학생을 붙이면 생기부용, 아니면 보통 */
export const CHAT_MODELS = { 자동: "학생을 붙이면 Opus 5.5, 아니면 Sonnet", 빠르게: "Haiku — 짧고 가벼운 일", 보통: "Sonnet — 업무 글 · 정리", 생기부: "Opus 5.5 — 생기부 글" } as const;
export type ChatModelChoice = keyof typeof CHAT_MODELS;
export const isChatModel = (v: unknown): v is ChatModelChoice => Object.prototype.hasOwnProperty.call(CHAT_MODELS, String(v));

export const CHAT_LIMITS = { turns: 20, message: 4000, mentions: 6, context: 30000 } as const;

/** @ 뒤에 친 말로 고르기: 이름 · 설명에 다 들어 있는 것, 종류 이름으로도 (예: "@학생", "@화학") */
export function filterMentions(list: Mention[], query: string, limit = 8): Mention[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((m) => words.every((w) => `${m.kind} ${m.label} ${m.sub ?? ""}`.toLowerCase().includes(w))).slice(0, limit);
}

/** 입력칸 끝의 "@말" (커서 앞). 없으면 null */
export function mentionQuery(before: string): string | null {
  const m = before.match(/(?:^|\s)@([^\s@]{0,20})$/);
  return m ? m[1] : null;
}

/** AI 답의 가명ID를 화면에서만 이름으로 (예: S012 → 강예린(S012)) */
export function showNames(text: string, aliases: Record<string, string>): string {
  let out = text;
  for (const [pid, name] of Object.entries(aliases)) out = out.replace(new RegExp(`(?<![A-Za-z0-9])${pid}(?![0-9])`, "g"), `${name}(${pid})`);
  return out;
}
