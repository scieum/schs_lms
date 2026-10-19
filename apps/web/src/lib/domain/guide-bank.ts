// 기재요령 찾아보기 (Figma N43 ①): 규칙 검색 · 이 글에서 찾기 · AI 정리 인용 거르기 — 모두 순수 함수.
// 답은 인용 모음(guide-bank.json) 안에서만 나온다. 없으면 [] → 화면은 "기재요령에서 찾지 못했어요".

import { FORBIDDEN_RULES, phraseAt } from "./forbidden";
import { GUIDE, type GuideEntry, type GuideSection, type GuideVerdict } from "./guide-data";

export { GUIDE, guideEntry, guideSource, GUIDE_URL, type GuideEntry, type GuideSection, type GuideVerdict } from "./guide-data";

/** 판정 태그 (N43 기재요령 답) */
export const VERDICT_LABEL: Record<GuideVerdict, string> = { 불가: "쓸 수 없음", 가능: "쓸 수 있음", 조건: "조건 있음" };

/** 자주 묻는 질문 칩 (N43 질문 칩) — 원문에서 답을 확인한 것만 (기대 1위 id) */
export const GUIDE_FAQ: readonly { q: string; id: string }[] = [
  { q: "대회명 써도 돼요?", id: "award" },
  { q: "진로 몇 자?", id: "len-career" },
  { q: "부모 직업?", id: "parent" },
  { q: "교외 활동?", id: "outside" },
  { q: "영어 단어 써도 돼요?", id: "english" },
];

/** 항목별로 보기 (유의사항은 늘 첫 줄) */
export const GUIDE_SECTIONS: readonly { section: GuideSection; label: string }[] = [
  { section: "작성 시 유의사항", label: "작성 시 유의사항 · 쓸 수 없는 것" },
  { section: "교과학습발달상황", label: "교과학습발달상황 · 세특" },
  { section: "창의적 체험활동", label: "창의적 체험활동" },
  { section: "행동특성 및 종합의견", label: "행동특성 및 종합의견" },
  { section: "분량", label: "입력 분량 · 글자 수" },
];

/** 편집기 영역 → 먼저 보일 항목 */
export type GuideArea = "세특" | "자율·자치" | "동아리" | "진로" | "행발" | "누가기록" | "초안";
export function areaSection(area?: GuideArea | null): GuideSection | null {
  if (!area) return null;
  if (area === "세특") return "교과학습발달상황";
  if (area === "행발") return "행동특성 및 종합의견";
  return "창의적 체험활동";
}

/** 항목 순서: 유의사항 → 지금 영역에 맞는 항목 → 나머지 */
export function sectionOrder(area?: GuideArea | null) {
  const first = areaSection(area);
  const [head, ...rest] = GUIDE_SECTIONS;
  const mine = rest.filter((s) => s.section === first);
  return [head, ...mine, ...rest.filter((s) => s.section !== first)];
}

/** 항목의 쪽 범위 ("18–19쪽" · "208쪽") */
export function sectionPages(section: GuideSection): string {
  const ps = GUIDE.entries.filter((e) => e.section === section).map((e) => e.page);
  if (!ps.length) return "";
  const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo === hi ? `${lo}쪽` : `${lo}–${hi}쪽`;
}

export const sectionEntries = (section: GuideSection) => GUIDE.entries.filter((e) => e.section === section);

// ---------- 규칙 검색 ----------

// 끝말·조사: 질문 모양만 다른 말을 같게 본다
const TAIL = /(써도|적어도|넣어도|기재해도|입력해도|돼요|되요|되나요|됩니까|되는지|될까요|가능한가요|가능해요|가능|인가요|이에요|예요|해요|하나요|할까요|어떻게|뭐|무엇|몇)/g;
const JOSA_END = /(은|는|이|가|을|를|의|에|도|만|로|으로|에서|이나|나|과|와|랑)$/;

/** 질문 정규화: 소문자 · 공백/기호 지움 · 질문 끝말 지움 */
export function normalizeQuestion(q: string): string {
  return q.normalize("NFC").toLowerCase().replace(/[\s?？!.,·・･~"'“”‘’()]/g, "").replace(TAIL, "");
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s·・･"'“”‘’]/g, "");

/** 질문 낱말 (조사 뗌, 2자 이상) */
function words(q: string): string[] {
  return q.normalize("NFC").toLowerCase().split(/[\s?？!.,·・･~"'“”‘’()]+/)
    .map((w) => w.replace(TAIL, "").replace(JOSA_END, ""))
    .filter((w) => w.length >= 2);
}

export type GuideHit = { entry: GuideEntry; score: number };

/** 이 점수부터 답으로 본다 (낱말 하나가 주제어에 걸린 정도) */
export const GUIDE_MIN_SCORE = 20;
const MAX_RESULTS = 4;

function scoreEntry(e: GuideEntry, nq: string, ws: string[]): number {
  if (!nq) return 0;
  let s = 0;
  const qs = e.questions.map(normalizeQuestion).filter(Boolean);
  if (qs.includes(nq)) s += 100;
  else if (qs.some((x) => x.length >= 2 && nq.length >= 2 && (x.includes(nq) || nq.includes(x)))) s += 50;
  let kw = 0;
  for (const k of e.keywords) {
    const nk = norm(k);
    if (nk.length >= 2 && nq.includes(nk)) kw += 20;
    else if (ws.some((w) => w.length >= 2 && nk.includes(w))) kw += 8;
  }
  s += Math.min(kw, 60);
  const quote = norm(e.quote) + norm(e.topic);
  s += Math.min(ws.filter((w) => w.length >= 2 && quote.includes(w)).length * 5, 15);
  return s;
}

/** 모든 항목 점수 (0점 빼고, 높은 순 · 같은 점수는 인용 모음 순서) */
function scored(q: string, area?: GuideArea | null): GuideHit[] {
  const nq = normalizeQuestion(q);
  const ws = words(q);
  const sec = areaSection(area);
  return GUIDE.entries
    .map((entry, i) => {
      let score = scoreEntry(entry, nq, ws);
      if (score > 0 && sec && entry.section === sec) score += 5;
      return { entry, score, i };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ entry, score }) => ({ entry, score }));
}

/**
 * 규칙 검색: questions 일치 > keywords 포함 > 원문 낱말 겹침, 지금 영역 항목 가산.
 * 문턱(GUIDE_MIN_SCORE) 아래면 [] — 찾지 못함. 1위 점수의 절반 넘는 것만 최대 4개.
 */
export function searchGuide(q: string, area?: GuideArea | null): GuideHit[] {
  const all = scored(q, area).filter((h) => h.score >= GUIDE_MIN_SCORE);
  if (!all.length) return [];
  const top = all[0].score;
  return all.filter((h) => h.score * 2 >= top).slice(0, MAX_RESULTS);
}

/** 찾지 못함의 "비슷한 주제": 문턱 아래로라도 걸린 항목 (최대 3) — 없으면 자주 묻는 질문에서 */
export function nearGuide(q: string, area?: GuideArea | null): GuideEntry[] {
  const hits = scored(q, area).filter((h) => h.score < GUIDE_MIN_SCORE).slice(0, 3).map((h) => h.entry);
  return hits;
}

/** 항목을 칩으로 다시 물을 말 */
export const askOf = (e: GuideEntry) => e.questions[0] ?? e.topic;

// ---------- 이 글에서 찾기 ----------

/** forbidden.ts 규칙에 없는 찾기 (기재요령 항목 전용) */
export const FIND_EXTRA: Record<string, RegExp> = {
  /** "과학탐구대회" · "경진대회" (대회라는 말 자체) */
  contest: /[가-힣A-Za-z0-9]{0,12}(?:경진)?대회/g,
  /** "드론 자격증" · "컴활 1급" */
  cert: /[가-힣A-Za-z0-9]{0,12}자격증/g,
  /** 영문 낱말 (2자 이상) */
  english: /[A-Za-z][A-Za-z0-9+.\-]*[A-Za-z0-9]/g,
};

export type FoundRange = { start: number; end: number; word: string };

/** 원문 항목의 find 규칙으로 글에서 찾은 자리 (겹치면 앞 · 긴 것 하나, 본문 순서) — AI 없음 */
export function findInText(entry: Pick<GuideEntry, "find">, text: string): FoundRange[] {
  const found: FoundRange[] = [];
  for (const id of entry.find ?? []) {
    const rule = FORBIDDEN_RULES.find((r) => r.id === id);
    const re = rule?.pattern ?? FIND_EXTRA[id];
    if (!re) continue;
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      const raw = m[0];
      const word = raw.trim();
      if (!word) continue;
      const index = (m.index ?? 0) + raw.indexOf(word);
      // 규칙이면 걸린 말이 든 어절(조사 뗌) · wide 면 "주최" 뒤까지
      const phrase = rule ? phraseAt(text, index, word, rule.wide) : word;
      const start = rule ? text.indexOf(phrase, Math.max(0, index - phrase.length)) : index;
      const s = start >= 0 && start <= index ? start : index;
      found.push({ start: s, end: s + phrase.length, word: phrase });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: FoundRange[] = [];
  for (const f of found) {
    const last = out[out.length - 1];
    if (last && f.start < last.end) continue;
    out.push(f);
  }
  return out;
}

// ---------- AI 정리 (서버가 인용 확인) ----------

export type GuideSentence = { text: string; cites: string[] };

/**
 * AI 문장 거르기: cites 가 후보 id 의 부분집합이고 1개 이상인 문장만 남긴다. 문장은 한 줄로 다듬고 너무 긴 것은 버린다.
 * 남는 문장이 없으면 [] → 화면은 AI 정리 상자를 숨긴다.
 */
export function keepCited(sentences: readonly GuideSentence[], candidateIds: readonly string[]): GuideSentence[] {
  const ok = new Set(candidateIds);
  const out: GuideSentence[] = [];
  for (const s of sentences) {
    const text = String(s.text ?? "").replace(/\s*\[\d+\]/g, "").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
    const cites = [...new Set((s.cites ?? []).map(String))];
    if (!text || text.length > 160) continue;
    if (!cites.length || !cites.every((c) => ok.has(c))) continue;
    out.push({ text, cites });
  }
  return out.slice(0, 4);
}

/** AI에 보낼 질문: 학교 학생 이름과 같은 말은 "학생"으로 (질문 칸에 이름을 쳐도 보내지 않는다) */
export function scrubQuestion(q: string, names: readonly string[]): string {
  let out = q.normalize("NFC").slice(0, 120).replace(/\d{5}/g, "학번");
  for (const n of [...names].filter((x) => x && x.length >= 2).sort((a, b) => b.length - a.length)) {
    out = out.split(n).join("학생");
  }
  return out;
}
