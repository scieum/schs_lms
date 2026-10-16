// T3 프로그램 등록 자동 입력: 계획서·기안문에서 폼 칸을 뽑는 순수 규칙.
// AI 가 꺼져 있을 때(데모)의 대체 경로이자, AI 결과를 폼 값으로 바꿀 때(대상 반 매핑·날짜 검사) 같이 쓴다.
import { CURRICULUM_2022, normalizeSubjectName } from "./curriculum";
import type { DraftCategory } from "./length";
import type { EvidenceSource } from "./program";

export interface PlanFields {
  title: string | null;
  area: DraftCategory | null;
  subject: string | null;
  startDate: string | null;
  endDate: string | null;
  overview: string | null;
  /** 계획서에 적힌 대상 표현 (예: "2학년 1~3반") */
  targetText: string | null;
  /** 폼의 반 키 ("2-1") — targetText 를 학교 반 목록에 맞춘 것 */
  targetClasses: string[];
  extraQuestions: string[];
  docKinds: string[];
  source: EvidenceSource | null;
}
export type PlanKey = keyof PlanFields;
/** 칸마다 어디서 읽었는지 (짧은 근거) */
export type PlanFrom = Partial<Record<PlanKey, string>>;
export interface PlanRead {
  fields: PlanFields;
  from: PlanFrom;
}

export const EMPTY_PLAN: PlanFields = {
  title: null, area: null, subject: null, startDate: null, endDate: null, overview: null,
  targetText: null, targetClasses: [], extraQuestions: [], docKinds: [], source: null,
};

export const PLAN_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"] as const;
export const PLAN_MAX_BYTES = 10 * 1024 * 1024;
export const PLAN_MAX_FILES = 5;

/** 올린 파일 검사. HWP 는 직접 못 읽으니 안내 문구를 돌려준다 */
export function checkPlanFile(f: { name: string; type: string; size: number }): string | null {
  if (/\.(hwp|hwpx)$/i.test(f.name)) return `${f.name}: 한글 파일은 바로 읽지 못해요. PDF로 저장하거나 캡처해서 올려 주세요`;
  if (!(PLAN_FILE_TYPES as readonly string[]).includes(f.type)) return `${f.name}: PDF·JPG·PNG·WEBP만 올릴 수 있어요`;
  if (f.size > PLAN_MAX_BYTES) return `${f.name}: 10MB 이하만 올릴 수 있어요`;
  return null;
}

// ---------- 날짜 ----------

const pad = (n: number) => String(n).padStart(2, "0");
/** 실제 있는 날짜면 YYYY-MM-DD, 아니면 null */
export function ymd(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}
export const isYmd = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)) === s;

const DAYNAME = String.raw`(?:\s*\(\s*[월화수목금토일]\s*\))?`;
const D1 = String.raw`(?<!\d)(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)\s*(?:일|\.)?` + DAYNAME;
const SEP = String.raw`\s*(?:~|∼|～|〜|–|—|-|부터)\s*`;
const D2 = String.raw`(?:(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*)?(\d{1,2})(?!\d)\s*(?:일|\.)?` + DAYNAME;
const RANGE = new RegExp(D1 + SEP + D2);
const SINGLE = new RegExp(D1);

/**
 * 기간 읽기: "2026.10.13~10.20", "2026. 10. 13.(화) ~ 10. 20.(화)", "10월 13일 ~ 20일", "2026-10-13 – 2026-10-20".
 * 연도가 없으면 year 를 쓰고, 끝 달이 시작 달보다 앞이면 다음 해로 본다.
 * 범위가 없으면 "기간·일시·일정" 줄의 날짜 하나를 시작=끝으로 본다.
 */
export function parseDateRange(text: string, year: number): { start: string; end: string; match: string } | null {
  for (const line of text.split(/\n/)) {
    const m = line.match(RANGE);
    if (!m) continue;
    const y1 = m[1] ? +m[1] : year;
    const start = ymd(y1, +m[2], +m[3]);
    if (!start) continue;
    const mo2 = m[5] ? +m[5] : +m[2];
    let y2 = m[4] ? +m[4] : y1;
    if (!m[4] && mo2 < +m[2]) y2 += 1;
    const end = ymd(y2, mo2, +m[6]);
    if (end && end >= start) return { start, end, match: m[0].trim() };
  }
  for (const line of text.split(/\n/)) {
    if (!/기간|일시|일정|날짜|운영일/.test(line)) continue;
    const m = line.match(SINGLE);
    const d = m && ymd(m[1] ? +m[1] : year, +m[2], +m[3]);
    if (d) return { start: d, end: d, match: m![0].trim() };
  }
  return null;
}

// ---------- 대상 반 ----------

const sortKeys = (keys: Iterable<string>) => [...new Set(keys)].sort((a, b) => {
  const [ga, ca] = a.split("-").map(Number);
  const [gb, cb] = b.split("-").map(Number);
  return ga - gb || ca - cb;
});

/**
 * "2학년 1~3반", "2학년 1, 2반", "1학년 전체", "전교생" → 학교 반 키("2-1") 목록.
 * classes 에 없는 반은 뺀다.
 */
export function targetClassesFromText(text: string | null | undefined, classes: string[]): { keys: string[]; match: string | null } {
  const t = (text ?? "").replace(/\s+/g, " ");
  const have = new Set(classes);
  const out: string[] = [];
  const hits: string[] = [];
  if (/전교생|전\s?학년|전체\s?학생|전\s?학급/.test(t)) {
    hits.push(t.match(/전교생|전\s?학년|전체\s?학생|전\s?학급/)![0]);
    out.push(...classes);
  }
  for (const m of t.matchAll(/([1-3])\s*학년\s*(\d{1,2})\s*(?:~|∼|-|–|부터)\s*(\d{1,2})\s*반/g)) {
    hits.push(m[0]);
    for (let c = +m[2]; c <= +m[3]; c++) out.push(`${m[1]}-${c}`);
  }
  for (const m of t.matchAll(/([1-3])\s*학년\s*((?:\d{1,2}\s*[,·、및]\s*)*\d{1,2})\s*반(?!\s*(?:~|∼|-|–))/g)) {
    if (hits.some((h) => h.includes(m[0]) || m[0].includes(h))) continue;
    hits.push(m[0]);
    for (const c of m[2].split(/[,·、및]/)) out.push(`${m[1]}-${+c.trim()}`);
  }
  for (const m of t.matchAll(/([1-3])\s*학년\s*(?:전체|전원|전\s?학급|학생\s?전체|모든\s?반)/g)) {
    hits.push(m[0]);
    out.push(...classes.filter((k) => k.startsWith(`${m[1]}-`)));
  }
  for (const m of t.matchAll(/(?<!\d)([1-3])\s*-\s*(\d{1,2})\s*반/g)) {
    hits.push(m[0]);
    out.push(`${m[1]}-${+m[2]}`);
  }
  const keys = sortKeys(out.filter((k) => have.has(k)));
  return { keys, match: hits.length ? hits.join(", ") : null };
}

export const classesLabel = (keys: string[]) => {
  const by = new Map<string, number[]>();
  for (const k of keys) {
    const [g, c] = k.split("-");
    by.set(g, [...(by.get(g) ?? []), +c]);
  }
  return [...by.entries()].map(([g, cs]) => `${g}학년 ${cs.join("·")}반`).join(", ");
};

// ---------- 제목·영역·과목·서류 ----------

/** 계획서 제목을 프로그램 이름으로: 학년도·"운영 계획(안)"·"(최종)" 같은 꼬리를 뗀다 */
export function cleanTitle(raw: string): string {
  let s = raw
    .replace(/\.[A-Za-z0-9]{2,5}$/, "")
    .replace(/[_]+/g, " ")
    .replace(/[([](?:최종|수정|수정본|최종본|안|초안|붙임\s*\d*|v\d+)[)\]]/gi, " ")
    .replace(/(?<!\d)\d{6,8}(?!\d)/g, " ")
    .replace(/^\s*(?:붙임\s*\d*\.?|제\s*목\s*[:：]?)\s*/, "")
    .replace(/\s*\d{4}\s*학년도\s*/g, " ")
    .replace(/^\s*\d{4}\s*년?\s+/, "");
  s = s.replace(/\s*(?:운영|실시|추진|시행|활동)?\s*(?:계획서?|기안문?|안내문?|알림|공문)\s*(?:\(안\))?\s*$/, "");
  s = s.replace(/\s*(?:운영|실시|추진|시행)\s*$/, "");
  return s.replace(/\s+/g, " ").trim().slice(0, 60);
}

const HEADER_LINE = /^(?:기\s*안\s*문?|내\s*부\s*결\s*재|결\s*재|수\s*신|경\s*유|발\s*신|시\s*행|접\s*수|문서\s*번호|담\s*당|교\s*장|교\s*감|부\s*장|붙\s*임|협\s*조|.*고등학교\s*$)/;

/** 본문에서 제목 줄 찾기: "제목 …" 줄이 먼저, 없으면 한글 4자 이상인 첫 줄 */
export function findTitleLine(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const subject = lines.map((l) => l.match(/^제\s*목\s*[:：]?\s*(.{4,})$/)).find(Boolean);
  if (subject) return subject[1];
  return lines.find((l) => !HEADER_LINE.test(l) && (l.match(/[가-힣]/g) ?? []).length >= 4 && l.length <= 80) ?? null;
}

const AREA_WORDS: [DraftCategory, RegExp][] = [
  ["창체-동아리", /동아리/g],
  ["창체-진로", /진로/g],
  ["창체-자율", /자율|자치|학급\s?활동|학생회|봉사/g],
  ["세특", /세특|교과|수업|과목|수행\s?평가|단원/g],
];

/** 기록 영역 추정: 낱말 수가 가장 많은 영역 (과목 이름이 있으면 교과세특) */
export function guessArea(text: string, subject: string | null): DraftCategory | null {
  let best: DraftCategory | null = null;
  let n = 0;
  for (const [a, re] of AREA_WORDS) {
    const c = (text.match(re) ?? []).length + (a === "세특" && subject ? 2 : 0);
    if (c > n) [best, n] = [a, c];
  }
  return best;
}

const SUBJECT_KEYS = (() => {
  const m = new Map<string, string>();
  for (const s of CURRICULUM_2022) {
    m.set(normalizeSubjectName(s.name), s.name);
    const base = s.name.replace(/\s*(?:[12]|Ⅰ|Ⅱ)$/, "");
    if (base !== s.name && base.length >= 2) m.set(normalizeSubjectName(base), base);
  }
  for (const extra of ["통합과학", "과학탐구실험", "물리학", "화학", "생명과학", "지구과학", "정보", "국어", "수학", "영어", "한국사"]) m.set(normalizeSubjectName(extra), extra);
  return [...m.entries()].sort((a, b) => b[0].length - a[0].length);
})();

/** 2022 개정 과목 이름 중 본문에 있는 가장 긴 것 */
export function findSubject(text: string): string | null {
  const flat = normalizeSubjectName(text);
  for (const [key, name] of SUBJECT_KEYS) if (key.length >= 2 && flat.includes(key)) return name;
  return null;
}

const DOC_WORDS: [RegExp, string][] = [
  [/탐구\s?보고서/, "탐구 보고서"],
  [/(?<!탐구\s?)보고서/, "보고서"],
  [/활동지/, "활동지"],
  [/소감문/, "소감문"],
  [/포트폴리오/, "포트폴리오"],
  [/발표\s?자료|PPT|ppt/, "발표 자료"],
  [/산출물/, "산출물"],
  [/활동\s?일지|성찰\s?일지/, "활동 일지"],
];

export function findDocKinds(text: string): string[] {
  return DOC_WORDS.filter(([re]) => re.test(text)).map(([, k]) => k);
}

/** 근거 자료 방식: 설문·서류 낱말로 추정 */
export function guessSource(text: string, docKinds: string[]): EvidenceSource | null {
  const survey = /설문|응답|자기\s?평가지/.test(text);
  const docs = docKinds.length > 0 && /제출|올리|업로드|수합/.test(text);
  return survey && docs ? "both" : docs ? "docs" : survey ? "survey" : null;
}

/** 개요: "목적·내용·방법" 줄에서 3줄까지 */
export function findOverview(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.replace(/^\s*(?:\(?\d{1,2}[.)]|\(?[가나다라마바사아자차카타파하][.)]|[①-⑩□■○●◦•\-–·])\s*/, "").trim());
  const picked = lines.filter((l) => /목적|내용|방법|개요/.test(l) && l.replace(/^(?:목적|내용|방법|개요)\s*[:：]?\s*/, "").length >= 8)
    .map((l) => l.replace(/^(?:운영\s?|활동\s?)?(?:목적|내용|방법|개요)\s*[:：]?\s*/, ""))
    .slice(0, 3);
  return picked.length ? picked.join("\n").slice(0, 1000) : null;
}

const snip = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * 규칙으로 계획서 칸 뽑기 (AI 없음). segments 는 앞에 있는 것이 먼저 쓰인다.
 * 예: [{label:"파일 이름", text:"2026 과학탐구발표 운영계획(안).pdf"}, {label:"PDF 정보", text:"…"}]
 */
export function extractPlanHints(segments: { label: string; text: string }[], opts: { year: number; classes: string[] }): PlanRead {
  const f: PlanFields = { ...EMPTY_PLAN, targetClasses: [], extraQuestions: [], docKinds: [] };
  const from: PlanFrom = {};
  const all = segments.map((s) => s.text).join("\n");
  for (const seg of segments) {
    const text = seg.label === "파일 이름" ? seg.text.replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/_/g, " ") : seg.text;
    if (!f.title) {
      const line = seg.label === "파일 이름" ? text : findTitleLine(text);
      const t = line ? cleanTitle(line) : "";
      if (t.length >= 2) [f.title, from.title] = [t, `${seg.label}: "${snip(line!)}"`];
    }
    if (!f.startDate) {
      const r = parseDateRange(text, opts.year);
      if (r) [f.startDate, f.endDate, from.startDate, from.endDate] = [r.start, r.end, `${seg.label}: "${r.match}"`, `${seg.label}: "${r.match}"`];
    }
    if (!f.targetClasses.length) {
      const t = targetClassesFromText(text, opts.classes);
      if (t.keys.length) [f.targetClasses, f.targetText, from.targetClasses] = [t.keys, t.match, `${seg.label}: "${t.match}"`];
    }
    if (!f.subject) {
      const s = findSubject(text);
      if (s) [f.subject, from.subject] = [s, `${seg.label}: "${s}"`];
    }
    if (!f.overview) {
      const o = findOverview(text);
      if (o) [f.overview, from.overview] = [o, `${seg.label}: 목적·내용 줄`];
    }
  }
  f.area = guessArea(all, f.subject);
  if (f.area) from.area = f.subject && f.area === "세특" ? `과목 "${f.subject}"` : "본문 낱말";
  f.docKinds = findDocKinds(all);
  if (f.docKinds.length) from.docKinds = "본문 낱말";
  f.source = guessSource(all, f.docKinds);
  if (f.source) from.source = "설문·제출 낱말";
  return { fields: f, from };
}

/** 앞의 결과(AI)에 빈 칸만 뒤의 결과(규칙)로 채운다 */
export function mergePlan(primary: PlanRead, fallback: PlanRead): PlanRead {
  const fields = { ...primary.fields };
  const from = { ...primary.from };
  for (const k of Object.keys(fields) as PlanKey[]) {
    const v = fields[k];
    const empty = v === null || (Array.isArray(v) && v.length === 0);
    const fb = fallback.fields[k];
    if (empty && fb !== null && !(Array.isArray(fb) && fb.length === 0)) {
      (fields as Record<PlanKey, unknown>)[k] = fb;
      if (fallback.from[k]) from[k] = fallback.from[k];
      if (k === "targetClasses") fields.targetText = fallback.fields.targetText;
    }
  }
  return { fields, from };
}
