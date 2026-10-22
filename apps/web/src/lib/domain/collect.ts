import { activityTag, stripActivity } from "./activity-name";

// 조각 모으기 (Figma N52 a): 최근 조각 묶기 · 학생별 조각 수 정렬. 화면 · 서버가 같이 쓴다 (AI 없음).

export type CollectStudent = { id: string; no: string; name: string; count: number };
/** ids: 그 줄에 묶인 기록 id (지우기에 쓴다) */
export type RecentPiece = { key: string; date: string; activity: string; text: string; who: string; n: number; ids: string[] };

/**
 * 여러 학생에게 한 번에 남긴 같은 조각은 한 줄로 ("학생A 외 2명"). 같은 날 · 같은 글이면 같은 조각으로 본다.
 * 새 것부터, limit 줄까지.
 */
export function recentPieces(items: { id?: string; studentId: string; date: string; content: string }[], nameOf: (id: string) => string | undefined, limit = 4): RecentPiece[] {
  const groups = new Map<string, { date: string; content: string; ids: string[]; recs: string[] }>();
  for (const it of items) {
    const key = `${it.date}|${it.content.trim()}`;
    const g = groups.get(key);
    if (g) { if (!g.ids.includes(it.studentId)) g.ids.push(it.studentId); if (it.id) g.recs.push(it.id); }
    else groups.set(key, { date: it.date, content: it.content.trim(), ids: [it.studentId], recs: it.id ? [it.id] : [] });
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].date.localeCompare(a[1].date))
    .slice(0, limit)
    .map(([key, g]) => {
      const names = g.ids.map(nameOf).filter((x): x is string => !!x);
      const who = names.length === 0 ? `${g.ids.length}명` : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}명`;
      return { key, date: g.date, activity: activityTag(g.content) ?? "", text: stripActivity(g.content), who, n: g.ids.length, ids: g.recs };
    });
}

/** 학생별 조각: 적은 순(같으면 번호 순) 또는 번호 순 */
export function sortStudents(list: CollectStudent[], by: "few" | "no"): CollectStudent[] {
  return [...list].sort((a, b) => (by === "few" ? a.count - b.count : 0) || a.no.localeCompare(b.no));
}

/** 오늘 남긴 조각 줄 수 (최근 조각 머리 "오늘 n") */
export const todayCount = (list: RecentPiece[], today: string) => list.filter((r) => r.date === today).length;

/** 학생 찾기 (2026-10-22): 학번 · 이름 일부로 (띄어 쓴 말은 모두 맞아야). 빈 말이면 그대로 */
export function findStudents<T extends { no: string; name: string }>(list: T[], q: string): T[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => words.every((w) => s.no.includes(w) || s.name.toLowerCase().includes(w)));
}
