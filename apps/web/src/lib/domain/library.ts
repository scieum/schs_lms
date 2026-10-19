// 문장 보관함 (Figma N35 ②): 교사 개인 보관함. 본문에서 고른 문장 · AI 결과(다른 버전 · 순화 · 고친 글 · 초안)를
// 이름·학번을 지우고 저장한다. 학생 정보는 남기지 않는다(학생 id·이름·학번 열 없음). 순수 함수 — 서버·화면 공용.

export const LIBRARY_AREAS = ["세특", "창체", "행발", "동아리"] as const;
export type LibraryArea = (typeof LIBRARY_AREAS)[number];
export const isLibraryArea = (v: unknown): v is LibraryArea => typeof v === "string" && (LIBRARY_AREAS as readonly string[]).includes(v);

export const LIBRARY_SOURCES = ["body", "variant", "soften", "fix", "draft"] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];
/** 카드 메타 줄 출처 태그 (본문에서 고른 것은 태그 없음) */
export const SOURCE_TAG: Record<LibrarySource, string | null> = { body: null, variant: "AI 다른 버전", soften: "순화", fix: "AI 고친 글", draft: "AI 초안" };

export const LIBRARY_TEXT_MIN = 2;
export const LIBRARY_TEXT_MAX = 600;
export const TAG_MAX = 5;
export const TAG_LEN = 12;

export type LibraryEntry = {
  id: string;
  area: LibraryArea;
  subject: string | null;
  text: string;
  tags: string[];
  source: LibrarySource;
  useCount: number;
  createdAt: string;
};

export type LibrarySort = "recent" | "used" | "abc";
export const SORT_LABEL: Record<LibrarySort, string> = { recent: "최근 넣은 순", used: "많이 넣은 순", abc: "가나다" };

export type Range = { start: number; end: number };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const JOSA = "(?:\\s*학생)?(?:이는|이가|이의|에게|은|는|이|가|의|을|를)?\\s*";

/**
 * 이름·학번·"○○는" 주어 꼴을 지운다. removed = 지운 자리(원래 글 기준, 미리보기 취소선).
 * names 는 실명(성 뺀 두 글자 이름도 함께 지움), numbers 는 학번(다섯 자리 등). 지운 뒤 공백·문장 앞 조사를 정리한다.
 */
export function stripIdentity(text: string, names: string[] = [], numbers: string[] = []): { text: string; removed: Range[] } {
  const pats: RegExp[] = [];
  for (const raw of names) {
    const n = String(raw ?? "").replace(/\s/g, "");
    if (n.length < 2) continue;
    pats.push(new RegExp(`${esc(n)}${JOSA}`, "g"));
    const given = n.slice(1);
    if (n.length >= 3 && given.length >= 2) pats.push(new RegExp(`${esc(given)}(?=\\s*(?:학생|이는|이가|이의|이|은|는|가|의|을|를|에게))${JOSA}`, "g"));
  }
  for (const raw of numbers) {
    const n = String(raw ?? "").trim();
    if (n.length >= 3) pats.push(new RegExp(`(?<!\\d)${esc(n)}(?!\\d)${JOSA}`, "g"));
  }
  // 가린 이름("○○는", "OO가")과 "N학년 N반 N번"
  pats.push(new RegExp(`[○◯〇]{1,3}${JOSA}`, "g"));
  pats.push(/\d\s*학년\s*\d{1,2}\s*반\s*\d{1,2}\s*번\s*/g);

  const spans: Range[] = [];
  for (const re of pats) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (end > start && !spans.some((s) => start < s.end && s.start < end)) spans.push({ start, end });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const s of spans) {
    out += text.slice(at, s.start);
    at = s.end;
  }
  out += text.slice(at);
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,])/g, "$1").replace(/(^|[.!?]\s+)(?:은|는|이|가|의|을|를|에게)\s+/g, "$1").trim();
  // 지운 자리 표시는 공백을 빼고 글자만 (미리보기 취소선)
  const removed = spans.map((s) => ({ start: s.start, end: s.start + text.slice(s.start, s.end).trimEnd().length })).filter((s) => s.end > s.start);
  return { text: out, removed };
}

/** 태그: "#" 떼고 공백 정리 · 12자 · 같은 것 한 번 · 최대 5개 */
export function normalizeTags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : [];
  const out: string[] = [];
  for (const t of list) {
    const s = String(t ?? "").replace(/^#+/, "").replace(/[#,]/g, "").replace(/\s+/g, " ").trim().slice(0, TAG_LEN);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= TAG_MAX) break;
  }
  return out;
}

/** 보관함 찾기 · 영역 · 태그 · 정렬 (개인 수백 개라 메모리에서) */
export function filterLibrary(list: LibraryEntry[], f: { q?: string; area?: LibraryArea | null; tag?: string | null; sort?: LibrarySort } = {}): LibraryEntry[] {
  const q = (f.q ?? "").trim().replace(/^#/, "").toLowerCase();
  const out = list.filter((e) => (!f.area || e.area === f.area) && (!f.tag || e.tags.includes(f.tag)) && (!q || e.text.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)) || (e.subject ?? "").toLowerCase().includes(q)));
  const sort = f.sort ?? "recent";
  return out.sort((a, b) =>
    sort === "used" ? b.useCount - a.useCount || b.createdAt.localeCompare(a.createdAt)
      : sort === "abc" ? a.text.localeCompare(b.text, "ko")
        : b.createdAt.localeCompare(a.createdAt));
}

/** 많이 쓴 태그 순 */
export function tagCounts(list: LibraryEntry[]): { tag: string; n: number }[] {
  const m = new Map<string, number>();
  for (const e of list) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, "ko"));
}

/** 영역별 개수 */
export function areaCounts(list: LibraryEntry[]): Record<LibraryArea, number> {
  const c = { 세특: 0, 창체: 0, 행발: 0, 동아리: 0 } as Record<LibraryArea, number>;
  for (const e of list) c[e.area]++;
  return c;
}

/** 편집 영역 → 보관함 영역 (자율·자치·진로는 창체) */
export function libraryAreaOf(area: string): LibraryArea {
  if (area === "세특" || area.startsWith("세특")) return "세특";
  if (area === "행발") return "행발";
  if (area === "동아리" || area === "창체-동아리") return "동아리";
  return "창체";
}

/** 커서 자리(없으면 끝)에 넣기 — 앞뒤 공백 하나 */
export function insertAt(body: string, text: string, at: number | null): { text: string; caret: number } {
  const t = text.trim();
  const pos = at == null || at < 0 || at > body.length ? body.length : at;
  const before = body.slice(0, pos);
  const after = body.slice(pos);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const tail = after && !/^\s/.test(after) ? " " : "";
  return { text: `${before}${lead}${t}${tail}${after}`, caret: pos + lead.length + t.length };
}

/** 카드 날짜 "10.18" (오늘이면 "방금") */
export function libraryDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (now.getTime() - d.getTime() < 60 * 60 * 1000) return "방금";
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}
