import { activityTag, stripActivity } from "./activity-name";

// 조각 모으기 (Figma N52 a): 최근 조각 묶기 · 학생별 조각 수 정렬. 화면 · 서버가 같이 쓴다 (AI 없음).

/** pieces: 학생별 조각 창(N77)에 보일 조각 — count 와 같은 목록 (세특 = memoPieces, 동아리 · 담임 = logPieces) */
export type CollectStudent = { id: string; no: string; name: string; count: number; pieces?: StudentPiece[] };
/** id: "memo-<기록 id>" | "log-<기록 id>" (지우기에 쓴다) · mine: 지금 선생님이 쓴 조각 */
export type StudentPiece = { id: string; source: string; date: string | null; text: string; mine?: boolean };
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

// 학생별 조각 창 (N77): 종류 칩(전체 · 메모 n …) · 날짜별 묶음(새 날짜부터, 날짜 없는 조각은 맨 뒤)

/** 있는 종류만, 많은 순(같으면 처음 나온 순) */
/** 학생 칸에 조각 수 · 조각 목록을 함께 (조각 수 = 창에 보이는 조각 수) */
export const withPieces = (pieces: StudentPiece[]) => ({ count: pieces.length, pieces });

export function pieceKinds(pieces: StudentPiece[]): { source: string; n: number }[] {
  const n = new Map<string, number>();
  for (const p of pieces) n.set(p.source, (n.get(p.source) ?? 0) + 1);
  return [...n].map(([source, k]) => ({ source, n: k })).sort((a, b) => b.n - a.n);
}

export function piecesByDay(pieces: StudentPiece[], source: string | null): { date: string | null; items: StudentPiece[] }[] {
  const out = new Map<string, StudentPiece[]>();
  for (const p of pieces) {
    if (source && p.source !== source) continue;
    const k = p.date ?? "";
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  return [...out].sort(([a], [b]) => (!a ? 1 : !b ? -1 : b.localeCompare(a))).map(([d, items]) => ({ date: d || null, items }));
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-10-26" → "10.26 (월)" */
export function dayLabel(date: string | null): string {
  if (!date) return "날짜 없음";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const w = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${m[2]}.${m[3]} (${WEEK[w]})`;
}
