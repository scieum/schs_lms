// 글 짓기 (Figma N52): 한 학생씩 — 왼쪽 그 학생 조각(고르기 · 꼭 · 순서 · 출처 · 기간) · 오른쪽 글.
// 화면에 안 보이는 순수 규칙만 여기에 둔다 (학생 넘기기 · 출처 칩 수 · 조각 거르기 · 고른 조각 기억).

import type { MergePiece, PieceSource } from "./merge";

/** 글 짓기 묶음 (주소 · sessionStorage 이름) */
export type ComposeGroup = "setuk" | "club" | "homeroom";

// ---------- 학생 넘기기 (N52 학생 넘기기) ----------

/** 지금 학생의 자리 "3 / 24" (없으면 0) */
export function studentPos(ids: readonly string[], current: string): { index: number; total: number } {
  return { index: ids.indexOf(current) + 1, total: ids.length };
}

/** 이전(-1) · 다음(+1) 학생 id — 끝이면 null (돌지 않는다) */
export function studentStep(ids: readonly string[], current: string, dir: -1 | 1): string | null {
  const i = ids.indexOf(current);
  if (i < 0) return null;
  return ids[i + dir] ?? null;
}

// ---------- 출처 칩 (N52 조각 칸) ----------

/** 묶음마다 칩 순서 — 세특 "메모 · 차시 · 공통 활동", 동아리 "누가기록 · 공통 활동 · 메모", 담임 "누가기록 · 메모". 그 밖의 출처는 뒤에 */
export const SOURCE_ORDER: Record<ComposeGroup, PieceSource[]> = {
  setuk: ["메모", "차시", "공통 활동", "자료 요약", "보관함"],
  club: ["누가기록", "공통 활동", "메모", "차시", "자료 요약", "보관함"],
  homeroom: ["누가기록", "메모", "특색 활동", "공통 활동", "차시", "자료 요약", "보관함"],
};

export type SourceFilter = "전체" | PieceSource;
export type SourceChip = { key: SourceFilter; n: number };

/** "전체 5 · 메모 3 · 차시 1 · 공통 활동 1" — 수가 0인 칩은 숨긴다 (전체는 늘) */
export function sourceChips(pieces: readonly Pick<MergePiece, "source">[], group: ComposeGroup): SourceChip[] {
  const count = new Map<PieceSource, number>();
  for (const p of pieces) count.set(p.source, (count.get(p.source) ?? 0) + 1);
  const order = [...SOURCE_ORDER[group], ...[...count.keys()].filter((s) => !SOURCE_ORDER[group].includes(s))];
  return [{ key: "전체", n: pieces.length }, ...order.filter((s) => (count.get(s) ?? 0) > 0).map((s) => ({ key: s, n: count.get(s)! }))];
}

// ---------- 기간 (기간 전체 ▾) ----------

export const PERIODS = ["전체", "이번 달", "1학기", "2학기"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { 전체: "기간 전체", "이번 달": "이번 달", "1학기": "1학기", "2학기": "2학기" };

/** 날짜(YYYY-MM-DD, 없으면 오늘)가 기간 안인지. 1학기 = 3~8월, 2학기 = 9~2월 (학년도 기준) */
export function inPeriod(date: string | null, period: Period, today: string): boolean {
  if (period === "전체") return true;
  const d = date ?? today;
  const month = Number(d.slice(5, 7));
  if (period === "이번 달") return d.slice(0, 7) === today.slice(0, 7);
  // 학년도: 3월 ~ 다음 해 2월
  const yearOf = (s: string) => { const y = Number(s.slice(0, 4)); return Number(s.slice(5, 7)) <= 2 ? y - 1 : y; };
  if (yearOf(d) !== yearOf(today)) return false;
  return period === "1학기" ? month >= 3 && month <= 8 : month >= 9 || month <= 2;
}

/** 출처 · 기간으로 거른 조각 (순서는 그대로) */
export function filterPieces<T extends Pick<MergePiece, "source" | "date">>(pieces: readonly T[], f: { source: SourceFilter; period: Period; today: string }): T[] {
  return pieces.filter((p) => (f.source === "전체" || p.source === f.source) && inPeriod(p.date, f.period, f.today));
}

// ---------- 고른 조각 (보내는 것 = 보이는 것 중 고른 것) ----------

/** 보이는 조각 중 고른 것 (이것만 AI에 보낸다) — 거른 칩 밖에 숨은 조각은 보내지 않는다 */
export function pickedVisible<T extends Pick<MergePiece, "id">>(visible: readonly T[], selected: ReadonlySet<string>): T[] {
  return visible.filter((p) => selected.has(p.id));
}

/** 바닥 줄 "고른 조각 4개 · 218자" (활동명 머리말까지 글자 수) */
export function pickedSummary(picked: readonly Pick<MergePiece, "text">[]): { count: number; chars: number } {
  return { count: picked.length, chars: picked.reduce((n, p) => n + p.text.trim().length, 0) };
}

/** 주 버튼 글 (N52): 아직 안 썼으면 "글 쓰기", 쓴 뒤 "다시 쓰기", 더하기는 "이어 쓰기" */
export function mainLabel(n: number, mode: "new" | "append", wrote: boolean): string {
  return `고른 조각 ${n}개로 ${mode === "append" ? "이어 쓰기" : wrote ? "다시 쓰기" : "글 쓰기"}`;
}

// ---------- 고른 조각 기억 (이 탭 sessionStorage) ----------

/** `schs.compose.<묶음>.<학생 id>` — 이름 · 학번은 넣지 않는다 (C3) */
export const pickKey = (scope: string, studentId: string) => `schs.compose.${scope}.${studentId}`;

/** 뺀 조각 · 교사가 정한 순서. 새로 생긴 조각은 저절로 고름(처음이면 전부 고름) */
export type StoredPick = { excluded: string[]; order: string[] };

export function encodePick(p: StoredPick): string {
  return JSON.stringify({ excluded: p.excluded, order: p.order });
}

/** 읽은 값 → 지금 있는 조각에 맞춘 기억 (깨졌거나 없으면 전부 고름 · 순서 없음) */
export function decodePick(raw: string | null | undefined, ids: readonly string[]): StoredPick {
  const has = new Set(ids);
  try {
    const v = JSON.parse(raw ?? "null") as Partial<StoredPick> | null;
    const ok = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && has.has(x)) : []);
    return { excluded: ok(v?.excluded), order: ok(v?.order) };
  } catch {
    return { excluded: [], order: [] };
  }
}

/** 교사가 정한 순서대로 (정하지 않은 것은 원래 순서로 뒤에) */
export function applyOrder<T extends { id: string }>(pieces: readonly T[], order: readonly string[]): T[] {
  const rank = (id: string, i: number) => { const r = order.indexOf(id); return r < 0 ? order.length + i : r; };
  return pieces.map((p, i) => ({ p, r: rank(p.id, i) })).sort((a, b) => a.r - b.r).map((x) => x.p);
}

/** 위(-1) · 아래(+1)로 한 칸 — 바뀐 전체 순서 */
export function moveId(ids: readonly string[], id: string, dir: -1 | 1): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------- 학생 상태 칩 ----------

export type ComposeStatus = "확정" | "작성 중" | "미작성";
/** 처음 고를 학생: 주소 학생 → 확정 안 된 첫 학생 → 첫 학생 */
export function firstStudent<T extends { id: string; status: ComposeStatus }>(list: readonly T[], want?: string): T | undefined {
  return list.find((s) => s.id === want) ?? list.find((s) => s.status !== "확정") ?? list[0];
}

export const STATUS_CHIP: Record<ComposeStatus, string> = {
  확정: "bg-ok-soft text-[#00A05D]",
  "작성 중": "bg-wait-soft text-[#9A6400]",
  미작성: "bg-soft text-mute",
};

// ---------- 담임 탭 ----------

export const HOMEROOM_TABS = [
  { key: "behavior", area: "행발", label: "행발" },
  { key: "autonomy", area: "자율·자치", label: "자율·자치" },
  { key: "career", area: "진로", label: "진로" },
] as const;
export type HomeroomTab = (typeof HOMEROOM_TABS)[number]["key"];
export type HomeroomArea = (typeof HOMEROOM_TABS)[number]["area"];

export function homeroomTab(raw: string | null | undefined): (typeof HOMEROOM_TABS)[number] {
  return HOMEROOM_TABS.find((t) => t.key === raw) ?? HOMEROOM_TABS[0];
}

/** 옛 /teacher/write?area= → 새 글 짓기 주소 (쿼리 그대로, area 는 뺀다). 행발 · 자율·자치 · 진로 · 동아리가 아니면 null */
export function writeRedirect(q: Record<string, string | undefined>): string | null {
  const { area, ...rest } = q;
  const keep = (extra: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...extra, ...rest })) if (v != null && v !== "") sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  };
  if (area === "동아리") return `/teacher/club/compose${keep({})}`;
  const tab = HOMEROOM_TABS.find((t) => t.area === area);
  if (tab) return `/homeroom/compose${keep({ tab: tab.key })}`;
  return null;
}

/** 쿼리를 그대로 붙인 주소 (옛 주소 넘기기) */
export function withQuery(path: string, q: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v != null) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}
