// 활동명 (Figma N27): 기록을 쓸 때 활동명을 먼저 받고, 조각·요약은 "[활동명] …", 생기부 초안은 "활동명에서 …"로 시작한다.

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

/** 생기부 초안 첫 문장이 활동명으로 시작하지 않으면 "활동명에서 "를 붙인다 (본문 안 대괄호 머리말은 뗀다) */
export function leadWithActivity(name: string | null | undefined, text: string): string {
  const n = cleanActivity(name);
  const t = text.trim().replace(/^\[[^\]]*\]\s*/, "");
  if (!n || !t) return t;
  const first = t.split(/(?<=\.)\s/)[0] ?? t;
  return first.includes(n) ? t : `${n}에서 ${t}`;
}
