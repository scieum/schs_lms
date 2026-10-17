// AI 기록 쓰기: 세특·창체 특기사항(자율·자치/동아리/진로)·행발(행동특성 및 종합의견).
// 순수 규칙만 둔다 — 분량, 실명·학번 가리기, NEIS 어미 검사, 키 없을 때 쓰는 예시 초안.
import { checkLength, measure, MIN_RATIO, type LengthRange, type LengthSetting, type LengthUnit } from "./length";
import { canLog, type ActivityArea } from "./activity";
import type { Student, Viewer } from "./types";

export const RECORD_AREAS = ["자율·자치", "동아리", "진로", "행발"] as const;
export type RecordArea = (typeof RECORD_AREAS)[number];

export function isRecordArea(v: string | undefined | null): v is RecordArea {
  return !!v && (RECORD_AREAS as readonly string[]).includes(v);
}

/** 화면 이름 */
export const RECORD_LABEL: Record<RecordArea, string> = {
  "자율·자치": "자율·자치 특기사항",
  동아리: "동아리 특기사항",
  진로: "진로 특기사항",
  행발: "행동특성 및 종합의견",
};

/** NEIS 입력 한도(바이트, 학년 단위). 2026 기재요령 208쪽: 자율·자치·동아리·진로 500자(1500B), 행동특성 및 종합의견 300자(900B) */
export const RECORD_MAX_BYTES: Record<RecordArea, number> = {
  "자율·자치": 1500,
  동아리: 1500,
  진로: 1500,
  행발: 900,
};

export function recordMax(area: RecordArea, unit: LengthUnit): number {
  const b = RECORD_MAX_BYTES[area];
  return unit === "bytes" ? b : Math.floor(b / 3);
}

/** length.ts 의 resolveLength 와 같은 규칙(한도 넘으면 한도로, 하한 = 최대 × MIN_RATIO) */
export function resolveRecordLength(area: RecordArea, setting?: Partial<LengthSetting>): LengthRange {
  const unit = setting?.unit ?? "bytes";
  const limit = recordMax(area, unit);
  const asked = setting?.max && setting.max > 0 ? Math.floor(setting.max) : limit;
  const max = Math.min(asked, limit);
  return { unit, max, min: Math.ceil(max * MIN_RATIO), capped: asked > limit };
}

// ---------- 저장 기록 ----------

export type RecordStatus = "draft" | "confirmed";

export interface RecordDraft {
  id: string;
  area: RecordArea;
  studentId: string;
  authorId: string;
  year: number;
  semester: 1 | 2 | null;
  content: string;
  unit: LengthUnit;
  max: number;
  status: RecordStatus;
  createdAt: string;
}

/** 교사 관찰 메모. scope = "행발" | "자율·자치" | "동아리" | "진로" | "세특:<과목ID>". 추가만 하고 마지막 것이 지금 메모 */
export interface RecordMemo {
  id: string;
  scope: string;
  studentId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export function latestRecordByStudent(records: RecordDraft[]): Map<string, RecordDraft> {
  const m = new Map<string, RecordDraft>();
  for (const r of records) {
    const prev = m.get(r.studentId);
    if (!prev || prev.createdAt < r.createdAt) m.set(r.studentId, r);
  }
  return m;
}

export function latestMemoByStudent(memos: RecordMemo[]): Map<string, RecordMemo> {
  const m = new Map<string, RecordMemo>();
  for (const r of memos) {
    const prev = m.get(r.studentId);
    if (!prev || prev.createdAt < r.createdAt) m.set(r.studentId, r);
  }
  return m;
}

export type RecordStatusLabel = "미작성" | "작성 중" | "확정";
export function recordStatus(r: { content: string; status: RecordStatus } | undefined): RecordStatusLabel {
  if (!r || !r.content.trim()) return "미작성";
  return r.status === "confirmed" ? "확정" : "작성 중";
}

/** 이 학생의 이 영역 기록을 쓸 수 있나. 행발은 담임 반, 창체는 activity.canLog 와 같다 */
export function canWriteRecord(
  v: Viewer,
  area: RecordArea,
  student: Student,
  club?: { advisorId: string; memberIds: Set<string> },
): boolean {
  const as: ActivityArea = area === "행발" ? "자율·자치" : area; // 행발 = 담임 반 규칙
  return canLog(v, as, student, club);
}

// ---------- 실명·학번 가리기 ----------

type Who = Pick<Student, "name" | "studentNo" | "grade" | "classNo" | "number">;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function identityPatterns(s: Who): RegExp[] {
  const out: RegExp[] = [];
  const name = s.name.replace(/\s/g, "");
  if (name.length >= 2) {
    out.push(new RegExp(`${esc(name)}(?:\\s*학생)?`, "g"));
    // 성 뺀 이름(2글자 이상)도 가린다: "민준이는", "민준 학생"
    const given = name.slice(1);
    if (given.length >= 2) out.push(new RegExp(`${esc(given)}(?=\\s*(?:학생|이는|이가|이의|이|은|는|가|의|을|를|에게))`, "g"));
  }
  if (s.studentNo) out.push(new RegExp(`(?<!\\d)${esc(s.studentNo)}(?!\\d)`, "g"));
  out.push(new RegExp(`${s.grade}\\s*학년\\s*${s.classNo}\\s*반\\s*${s.number}\\s*번`, "g"));
  out.push(new RegExp(`(?<!\\d)${s.grade}\\s*-\\s*${s.classNo}\\s*-\\s*${s.number}(?!\\d)`, "g"));
  return out;
}

/** 글에 들어 있는 이 학생의 이름·학번 */
export function findIdentity(text: string, s: Who): string[] {
  // 겹치는 일치(이름 전체 + 성 뺀 이름)는 한 번만 센다
  const spans: [number, number, string][] = [];
  for (const re of identityPatterns(s)) {
    for (const m of text.matchAll(re)) {
      const a = m.index ?? 0;
      const b = a + m[0].length;
      if (!spans.some(([x, y]) => a < y && x < b)) spans.push([a, b, m[0]]);
    }
  }
  return spans.sort((p, q) => p[0] - q[0]).map(([, , t]) => t);
}

/**
 * 이름·학번을 지운다(replacement 를 주면 그 값으로 바꾼다 — AI에 보낼 때는 가명ID).
 * 지운 뒤 생긴 이중 공백·문장 앞 조사는 다듬는다.
 */
export function scrubIdentity(text: string, s: Who, replacement = ""): { text: string; removed: number } {
  let removed = 0;
  let out = text;
  for (const re of identityPatterns(s)) {
    out = out.replace(re, () => {
      removed++;
      return replacement;
    });
  }
  if (!replacement && removed) {
    out = out
      .replace(/(^|[.!?]\s*)(?:은|는|이|가|의|을|를|에게)\s+/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([.,])/g, "$1")
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .trim();
  }
  return { text: out, removed };
}

// ---------- NEIS 어미 ----------

/** 문장 나누기: 마침표·물음표·느낌표 뒤 또는 줄바꿈 */
export function sentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 받침이 ㅁ 인 한글 음절(함·임·음·됨·봄…)로 끝나고 마침표가 찍혔나 */
function endsNeis(s: string): boolean {
  const m = s.match(/([가-힣])\.$/);
  if (!m) return false;
  return (m[1].charCodeAt(0) - 0xac00) % 28 === 16;
}

/** NEIS 어미("~함." 같은 명사형 종결)가 아닌 문장 */
export function badEndings(text: string): string[] {
  return sentences(text).filter((s) => !endsNeis(s));
}

const ENDINGS: [RegExp, string][] = [
  [/했다$|하였다$|합니다$|했습니다$|하였습니다$|한다$|하고 있다$|함$/, "함"],
  [/였다$|이었다$|이다$|입니다$|임$/, "임"],
  [/되었다$|됐다$|된다$|됩니다$|됨$/, "됨"],
  [/보였다$|보인다$|보입니다$|보임$/, "보임"],
  [/있다$|있었다$|있습니다$|있음$/, "있음"],
  [/없다$|없었다$|없습니다$|없음$/, "없음"],
];

/** 한 문장을 NEIS 어미로 다듬는다. 이미 맞으면 그대로 */
export function toNeisSentence(raw: string): string {
  const s = raw.trim().replace(/[\s.!?·,;:~-]+$/, "");
  if (!s) return "";
  if (endsNeis(`${s}.`)) return `${s}.`;
  for (const [re, end] of ENDINGS) {
    if (re.test(s)) return `${s.replace(re, end)}.`;
  }
  // 명사·키워드로 끝나면 "~함." 을 붙인다 (예: "실험 설계 주도" → "실험 설계 주도함.")
  return `${s}함.`;
}

/** 범위를 넘으면 뒤 문장부터 뺀다. 한 문장도 안 들어가면 글자 단위로 자른다 */
export function fitToMax(text: string, range: Pick<LengthRange, "unit" | "max">): string {
  if (measure(text, range.unit) <= range.max) return text;
  const parts = sentences(text);
  while (parts.length > 1 && measure(parts.join(" "), range.unit) > range.max) parts.pop();
  let out = parts.join(" ");
  while (out && measure(out, range.unit) > range.max) out = out.slice(0, -1);
  return out;
}

// ---------- 키 없을 때 쓰는 예시 초안 ----------

/** 메모 한 칸을 문장 조각으로: 줄바꿈·쉼표·마침표·가운뎃점으로 나눈다 */
export function memoFragments(memo: string): string[] {
  return memo
    .split(/\n|[,，]|(?<=[.!?])\s+|\s*·\s*|\s*\/\s*/)
    .map((x) => x.trim().replace(/^[-*•\d.)\s]+/, ""))
    .filter((x) => x.length >= 2);
}

/**
 * AI 키가 없을 때 쓰는 결정적 예시 초안: 메모 조각 + 누가기록을 이어 붙이고 "~함."으로 다듬는다.
 * 같은 입력이면 언제나 같은 결과다. 화면에는 "예시"로 표시한다.
 */
export function sampleDraft(input: { memo: string; logs: string[]; careerGoal?: string | null; range: Pick<LengthRange, "unit" | "max"> }): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    for (const s of sentences(raw)) {
      const t = toNeisSentence(s);
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  };
  for (const f of memoFragments(input.memo)) push(f);
  for (const l of input.logs) push(l);
  if (input.careerGoal?.trim() && out.length) push(`${input.careerGoal.trim()} 분야로 관심을 넓혀 가는 모습을 보임`);
  return fitToMax(out.join(" "), input.range);
}

// ---------- 자동 검사 (T4 "자동 검사") ----------

export interface RecordCheck {
  length: ReturnType<typeof checkLength>;
  identity: number;
  badEndings: number;
  ok: boolean;
}

export function checkRecord(text: string, range: LengthRange, s: Who): RecordCheck {
  const length = checkLength(text, range);
  const identity = findIdentity(text, s).length;
  const bad = text.trim() ? badEndings(text).length : 0;
  return { length, identity, badEndings: bad, ok: length.ok && identity === 0 && bad === 0 };
}

/** 학기: 3~8월 1학기, 그 밖 2학기 */
export function semesterOf(now = new Date()): 1 | 2 {
  const m = now.getMonth() + 1;
  return m >= 3 && m <= 8 ? 1 : 2;
}

/** "AI 초안" 버튼 결과 (세특·특기사항·행발 공통) */
export type AiDraftResult = { ok: true; text: string; sample: boolean; notice?: string } | { ok: false; error: string };

// ---------- 키워드로 쓰기: 속초고 세특 프롬프트 입력 형식 ----------

/** 노션 프롬프트 입력 형식의 한 활동: (주제) / (활동) / (키워드) */
export interface KeywordBlock {
  topic: string;
  activity: string;
  keywords: string;
}

const MEMO_LABEL = /^\s*\((주제|활동|키워드)\)\s*/;

/** 칸 입력 → 프롬프트 입력 형식 글. 빈 칸은 빼고, 활동 블록은 빈 줄로 나눈다 */
export function composeKeywordMemo(blocks: KeywordBlock[]): string {
  return blocks
    .map((b) =>
      [["주제", b.topic], ["활동", b.activity], ["키워드", b.keywords]]
        .map(([k, v]) => [k, v.replace(/\s+/g, " ").trim()])
        .filter(([, v]) => v)
        .map(([k, v]) => `(${k}) ${v}`)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
}

/** 프롬프트 입력 형식 글 → 칸 (형식이 아니면 null) */
export function parseKeywordMemo(memo: string): KeywordBlock[] | null {
  if (!/^\s*\((주제|활동|키워드)\)/m.test(memo)) return null;
  const blocks: KeywordBlock[] = [];
  let cur: KeywordBlock | null = null;
  for (const line of memo.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(MEMO_LABEL);
    if (!m) {
      if (!line.trim()) cur = null;
      continue;
    }
    const key = m[1] === "주제" ? "topic" : m[1] === "활동" ? "activity" : "keywords";
    if (!cur || cur[key]) {
      cur = { topic: "", activity: "", keywords: "" };
      blocks.push(cur);
    }
    cur[key] = line.replace(MEMO_LABEL, "").trim();
  }
  return blocks.length ? blocks : null;
}

/** 받침이 있나 (을/를 고르기) */
function hasBatchim(word: string): boolean {
  const c = word.trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/**
 * 키 없을 때 예시 초안용: 형식 글을 평범한 메모로. (주제)와 (활동)은 "○○을 주제로 ~" 한 문장으로 잇고,
 * (키워드)는 평가 강조어라 문장으로 만들지 않는다. 형식이 아니면 그대로 돌려준다.
 */
export function plainMemo(memo: string): string {
  const blocks = parseKeywordMemo(memo);
  if (!blocks) return memo;
  return blocks
    .map((b) => {
      const act = b.activity.replace(/[.\s]+$/, "");
      if (b.topic && act) return `${b.topic}${hasBatchim(b.topic) ? "을" : "를"} 주제로 ${act}`;
      return act || (b.topic ? `${b.topic}${hasBatchim(b.topic) ? "을" : "를"} 주제로 탐구함` : "");
    })
    .filter(Boolean)
    .join("\n");
}
