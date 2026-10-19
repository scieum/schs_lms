// 활동명 (Figma N27): 기록을 쓸 때 활동명을 먼저 받고, 조각·요약은 "[활동명] …", 생기부 초안은 "활동명에서 …"로 시작한다.
// 활동명은 그 활동의 첫 문장에만 쓴다 — 문장마다 되풀이하면 글이 끊겨 읽힌다 (2026-10-19).

export const ACTIVITY_MAX = 40;

/** 대괄호·겹친 공백을 지우고 40자까지 */
export function cleanActivity(name: string | null | undefined): string {
  return String(name ?? "").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, ACTIVITY_MAX);
}

/** 조각·요약 앞에 "[활동명] " (이미 붙어 있으면 그대로) */
export function withActivity(name: string | null | undefined, text: string): string {
  const n = cleanActivity(name);
  const t = text.trim();
  if (!n || !t) return t;
  if (t.startsWith(`[${n}]`)) return t;
  return `[${n}] ${t.replace(/^\[[^\]]*\]\s*/, "")}`;
}

/** 조각 앞의 "[활동명]" 을 읽는다 (없으면 null) */
export function activityTag(text: string): string | null {
  const m = text.trim().match(/^\[([^\]]+)\]/);
  return m ? cleanActivity(m[1]) || null : null;
}

/** 조각 앞의 "[활동명] " 을 뗀다 */
export function stripActivity(text: string): string {
  return text.trim().replace(/^\[[^\]]*\]\s*/, "");
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** 생기부 초안 첫 문장이 활동명으로 시작하지 않으면 "활동명에서 "를 붙인다 (본문 안 대괄호 머리말은 뗀다, 띄어쓰기만 다른 활동명은 같은 것으로 본다) */
export function leadWithActivity(name: string | null | undefined, text: string): string {
  const n = cleanActivity(name);
  const t = stripActivity(text);
  if (!n || !t) return t;
  const first = t.split(/(?<=\.)\s/)[0] ?? t;
  if (squash(first).includes(squash(n))) return t;
  // 이미 "○○ 실험에서 …"로 시작하면 "활동명에서 ○○ 실험에서"가 되지 않게 "활동명의 ○○ 실험에서"로
  return /^[^.\s]+(?:\s[^.\s]+){0,4}에서\s/.test(first) ? `${n}의 ${t}` : `${n}에서 ${t}`;
}
