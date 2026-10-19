// 자동 검사 (Figma N23 · N34): 본문을 검사해 "못 지난 항목은 한 행씩(무엇이 걸렸는지와 함께)", "지난 항목은 한 줄"로 돌려준다.
// N34: 행마다 걸린 말(구) · 왜 · 기재요령 근거 · 고칠 말 · 본문 밑줄 자리(ranges).
// 세특·창체·행발 편집과 초안 검토가 같이 쓴다 (서버·클라이언트 공용 순수 함수). 화면은 components/writing/auto-checks.tsx.

import { applyFix, findForbidden, type ForbiddenBasis, type ForbiddenFix } from "./forbidden";
import { UNIT_LABEL, type LengthRange, checkLength } from "./length";
import { styleIssues, type StyleIssue } from "./neis-style";
import { badEndings, fixEnding } from "./writing";

export type CheckLevel = "block" | "warn";
export type TextRange = { start: number; end: number };
export type CheckRow = {
  key: string;
  level: CheckLevel;
  label: string;
  /** 설명 줄: 걸린 말(굵게) + 나머지 */
  hit?: string;
  detail: string;
  /** 본문에서 찾을 말 (행을 펼치면 그 자리로) — 분량 행은 없음 */
  find?: string;
  /** 펼침 "왜" 한 줄 */
  why: string;
  /** 펼침 "걸린 말" (걸린 말이 든 구) */
  phrase?: string;
  /** 기재요령 근거 (원문을 확인한 것만) */
  basis?: ForbiddenBasis;
  /** 규칙으로 고칠 말 (to=null 이면 빼기). 없으면 AI로 고치기에서 같이 고친다 */
  fix?: ForbiddenFix;
  /** 본문 밑줄 자리 (원래 본문 기준) */
  ranges: TextRange[];
};
export type AutoCheck = {
  status: "empty" | "pass" | "check" | "block";
  rows: CheckRow[];
  passed: string[];
  value: number;
  /** 최대를 넘은 양 (넘지 않으면 0) */
  over: number;
};

/** 초안 검토에서만 더 보는 것 (근거 자료와 이어졌는지) */
export type DraftExtra = { evidence: { ok: boolean; hits: number }; specific: { ok: boolean; grounded: number; total: number } };

const STYLE_DETAIL: Partial<Record<StyleIssue, { re?: RegExp; detail: string; why: string; drop?: boolean }>> = {
  "학생 주어": { re: /(?:\S+\s)?학생(?:은|이|는|이가)(?=\s)/, detail: "으로 시작하는 문장", why: "생기부 문장은 주어 없이 써요", drop: true },
  "그는·그가·그의": { re: /(?:^|\s)그(?:는|가|의)(?=\s)/, detail: " → 주어를 빼 주세요", why: "생기부 문장은 주어 없이 써요", drop: true },
  "가운데 점": { re: /[·ㆍ]/, detail: " 대신 '와/과'로 풀어 써 주세요", why: "나이스 문장에는 가운데 점 대신 '와/과' 같은 조사로 이어요" },
  "따옴표 문장": { detail: "따옴표로만 된 문장을 풀어 써 주세요", why: "따옴표로만 된 문장은 풀어서 써요" },
  // 문장을 나누라고 하면 AI로 고치기가 짧은 문장을 늘린다 (2026-10-19 "문장이 끊긴다") — 쉼표만 연결어로 바꾸게 한다
  "쉼표 과다": { detail: "쉼표 3개 이상인 문장의 쉼표를 줄여 주세요", why: "쉼표 대신 '와/과'나 '~하고' '~하며'로 이어 한 문장으로 써요" },
};

/** 문장 끝을 보여 주기 (…설계하였다.) */
const tail = (s: string, n = 12) => (s.length > n ? `…${s.slice(-n)}` : s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 글에서 s 가 나오는 모든 자리 */
export function rangesOf(text: string, s: string | undefined): TextRange[] {
  if (!s) return [];
  const out: TextRange[] = [];
  for (let i = text.indexOf(s); i >= 0; i = text.indexOf(s, i + s.length)) out.push({ start: i, end: i + s.length });
  return out;
}

/**
 * identity: 본문에서 찾은 학번·실명 (편집기는 writing.findIdentity, 초안 검토는 checkDraft 의 found).
 * context: 과목명(세특) — 고칠 말 "○○ 탐구 활동"에 쓴다.
 */
export function autoCheck(text: string, range: LengthRange, identity: string[], extra?: DraftExtra, context?: string): AutoCheck {
  const body = text.trim();
  const len = checkLength(body, range);
  const u = range.unit === "bytes" ? "B" : UNIT_LABEL[range.unit];
  const over = Math.max(0, len.value - range.max);
  if (!body) return { status: "empty", rows: [], passed: [], value: 0, over: 0 };

  const rows: CheckRow[] = [];
  const passed: string[] = [];
  const forbidden = findForbidden(text, context);

  for (const h of forbidden.filter((x) => x.level === "ban")) {
    rows.push({ key: `ban-${h.word}`, level: "block", label: `금칙어 '${h.word}'`, detail: h.short, why: h.reason, find: h.phrase, phrase: h.phrase, basis: h.basis, fix: h.fix, ranges: rangesOf(text, h.phrase) });
  }

  if (len.reason === "too_long") rows.push({ key: "len", level: "warn", label: `분량 초과 ${over.toLocaleString()}${u}`, detail: `${range.max.toLocaleString()}${u} 안으로 줄여 주세요`, why: `${range.max.toLocaleString()}${u} 안으로 줄여 주세요`, ranges: [] });
  else if (len.reason === "too_short") rows.push({ key: "len", level: "warn", label: `최소 ${range.min.toLocaleString()}${u}`, detail: `${(range.min - len.value).toLocaleString()}${u} 더 써 주세요`, why: `${(range.min - len.value).toLocaleString()}${u} 더 써 주세요`, ranges: [] });
  else passed.push("글자수");

  const ids = [...new Set(identity)];
  if (ids.length) {
    const from = text.match(new RegExp(`${esc(ids[0])}(?:은|는|이가|이|가|의)?\\s*`))?.[0] ?? ids[0];
    rows.push({
      key: "id", level: "warn", label: `학번·실명 ${ids.length}건`, hit: `'${ids[0]}'`, detail: " → 이름을 빼 주세요",
      why: "생기부에는 학생 이름·학번을 쓰지 않아요", find: ids[0], phrase: ids[0], fix: { from, to: null }, ranges: ids.flatMap((s) => rangesOf(text, s)),
    });
  } else passed.push("학번·실명");

  const bad = badEndings(body);
  if (bad.length) {
    const fixed = fixEnding(bad[0]);
    const last = (s: string) => s.split(/\s+/).pop() ?? s;
    rows.push({
      key: "end", level: "warn", label: `어미 ${bad.length}문장`, hit: tail(bad[0]), detail: " → '~함.'으로",
      why: "문장은 '~함.' '~임.'처럼 명사형으로 끝내요", find: bad[0], phrase: last(bad[0]),
      fix: fixed ? { from: last(bad[0]), to: last(fixed) } : undefined,
      ranges: bad.flatMap((s) => {
        const at = text.indexOf(s);
        const w = last(s);
        return at < 0 ? [] : [{ start: at + s.length - w.length, end: at + s.length }];
      }),
    });
  } else passed.push("어미");

  // 어미·마침표는 위 행이 본다
  const style = styleIssues(body).filter((i) => i !== "서술형 어미" && i !== "마침표 없음");
  for (const issue of style) {
    const d = STYLE_DETAIL[issue];
    const raw = d?.re ? text.match(d.re)?.[0] : undefined;
    const m = raw?.trim();
    const from = m ? text.match(new RegExp(`${esc(m)}\\s*`))?.[0] : undefined;
    rows.push({
      key: `style-${issue}`, level: "warn", label: issue, hit: m ? `'${m}'` : undefined, detail: d?.detail ?? "문체 규칙을 확인해 주세요",
      why: d?.why ?? "문체 규칙을 확인해 주세요", find: m, phrase: m, fix: d?.drop && from ? { from, to: null } : undefined, ranges: rangesOf(text, m),
    });
  }
  if (!style.length) passed.push("문체");

  const warn = forbidden.filter((x) => x.level !== "ban");
  for (const h of warn) rows.push({ key: `warn-${h.word}`, level: "warn", label: `금칙어 확인 '${h.word}'`, detail: h.short, why: h.reason, find: h.phrase, phrase: h.phrase, basis: h.basis, fix: h.fix, ranges: rangesOf(text, h.phrase) });
  if (!forbidden.length) passed.push("금칙어");

  if (extra) {
    if (extra.evidence.ok) passed.push(`근거 반영 ${extra.evidence.hits}개`);
    else rows.push({ key: "evidence", level: "warn", label: `근거 반영 ${extra.evidence.hits}개`, detail: "근거 자료의 말이 초안에 없어요", why: "근거 자료의 말이 초안에 없어요", ranges: [] });
    const sp = `학생 근거 문장 ${extra.specific.grounded}/${extra.specific.total}`;
    if (extra.specific.ok) passed.push(sp);
    else rows.push({ key: "specific", level: "warn", label: sp, detail: "근거 자료와 이어진 문장을 늘려 주세요", why: "근거 자료와 이어진 문장을 늘려 주세요", ranges: [] });
  }

  const status = rows.some((r) => r.level === "block") ? "block" : rows.length ? "check" : "pass";
  return { status, rows, passed, value: len.value, over };
}

/** 본문에서 고칠 행 (분량·근거 행은 본문 말이 아니라 빼고 센다) */
export const fixableRows = (c: AutoCheck) => c.rows.filter((r) => r.key !== "len" && r.key !== "evidence" && r.key !== "specific");

/** 규칙 고칠 말을 모두 적용 (AI가 꺼졌을 때 "AI로 고치기"의 자동 결과) */
export function applyRuleFixes(text: string, rows: CheckRow[]): string {
  let out = text;
  for (const r of rows) if (r.fix) out = applyFix(out, r.fix);
  // 어미 행은 첫 문장만 고칠 말을 보여 주지만, 한 번에 고칠 때는 규칙으로 바뀌는 문장을 모두
  for (const s of badEndings(out)) {
    const f = fixEnding(s);
    if (f) out = out.replace(s, f);
  }
  return out;
}
