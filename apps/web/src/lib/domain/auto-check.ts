// 자동 검사 (Figma N23): 본문을 검사해 "못 지난 항목은 한 행씩(무엇이 걸렸는지와 함께)", "지난 항목은 한 줄"로 돌려준다.
// 세특·창체·행발 편집과 초안 검토가 같이 쓴다. 화면은 components/writing/auto-checks.tsx.

import { findForbidden } from "./forbidden";
import { UNIT_LABEL, type LengthRange, checkLength } from "./length";
import { styleIssues, type StyleIssue } from "./neis-style";
import { badEndings } from "./writing";

export type CheckLevel = "block" | "warn";
export type CheckRow = {
  key: string;
  level: CheckLevel;
  label: string;
  /** 설명 줄: 걸린 말(굵게) + 나머지 */
  hit?: string;
  detail: string;
  /** 본문에서 찾을 말 ("찾기") — 분량 행은 없음 */
  find?: string;
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

const STYLE_DETAIL: Partial<Record<StyleIssue, { re?: RegExp; detail: string }>> = {
  "학생 주어": { re: /(?:\S+\s)?학생(?:은|이|는|이가)(?=\s)/, detail: "으로 시작하는 문장" },
  "그는·그가·그의": { re: /(?:^|\s)그(?:는|가|의)(?=\s)/, detail: " → 주어를 빼 주세요" },
  "가운데 점": { re: /[·ㆍ]/, detail: " 대신 쉼표로 써 주세요" },
  "따옴표 문장": { detail: "따옴표로만 된 문장을 풀어 써 주세요" },
  "쉼표 과다": { detail: "쉼표가 3개 넘는 문장을 나눠 주세요" },
};

/** 문장 끝을 보여 주기 (…설계하였다.) */
const tail = (s: string, n = 12) => (s.length > n ? `…${s.slice(-n)}` : s);

/** identity: 본문에서 찾은 학번·실명 (편집기는 writing.findIdentity, 초안 검토는 checkDraft 의 found) */
export function autoCheck(text: string, range: LengthRange, identity: string[], extra?: DraftExtra): AutoCheck {
  const body = text.trim();
  const len = checkLength(body, range);
  const u = range.unit === "bytes" ? "B" : UNIT_LABEL[range.unit];
  const over = Math.max(0, len.value - range.max);
  if (!body) return { status: "empty", rows: [], passed: [], value: 0, over: 0 };

  const rows: CheckRow[] = [];
  const passed: string[] = [];
  const forbidden = findForbidden(body);

  for (const h of forbidden.filter((x) => x.level === "ban")) rows.push({ key: `ban-${h.word}`, level: "block", label: `금칙어 '${h.word}'`, detail: h.reason, find: h.word });

  if (len.reason === "too_long") rows.push({ key: "len", level: "warn", label: `분량 초과 ${over.toLocaleString()}${u}`, detail: `${range.max.toLocaleString()}${u} 안으로 줄여 주세요` });
  else if (len.reason === "too_short") rows.push({ key: "len", level: "warn", label: `최소 ${range.min.toLocaleString()}${u}`, detail: `${(range.min - len.value).toLocaleString()}${u} 더 써 주세요` });
  else passed.push("글자수");

  const ids = [...new Set(identity)];
  if (ids.length) rows.push({ key: "id", level: "warn", label: `학번·실명 ${ids.length}건`, hit: `'${ids[0]}'`, detail: " → 이름을 빼 주세요", find: ids[0] });
  else passed.push("학번·실명");

  const bad = badEndings(body);
  if (bad.length) rows.push({ key: "end", level: "warn", label: `어미 ${bad.length}문장`, hit: tail(bad[0]), detail: " → '~함.'으로", find: bad[0] });
  else passed.push("어미");

  // 어미·마침표는 위 행이 본다
  const style = styleIssues(body).filter((i) => i !== "서술형 어미" && i !== "마침표 없음");
  for (const issue of style) {
    const d = STYLE_DETAIL[issue];
    const m = d?.re ? body.match(d.re)?.[0].trim() : undefined;
    rows.push({ key: `style-${issue}`, level: "warn", label: issue, hit: m ? `'${m}'` : undefined, detail: d?.detail ?? "문체 규칙을 확인해 주세요", find: m });
  }
  if (!style.length) passed.push("문체");

  const warn = forbidden.filter((x) => x.level !== "ban");
  for (const h of warn) rows.push({ key: `warn-${h.word}`, level: "warn", label: `금칙어 확인 '${h.word}'`, detail: h.reason, find: h.word });
  if (!forbidden.length) passed.push("금칙어");

  if (extra) {
    if (extra.evidence.ok) passed.push(`근거 반영 ${extra.evidence.hits}개`);
    else rows.push({ key: "evidence", level: "warn", label: `근거 반영 ${extra.evidence.hits}개`, detail: "근거 자료의 말이 초안에 없어요" });
    const sp = `학생 근거 문장 ${extra.specific.grounded}/${extra.specific.total}`;
    if (extra.specific.ok) passed.push(sp);
    else rows.push({ key: "specific", level: "warn", label: sp, detail: "근거 자료와 이어진 문장을 늘려 주세요" });
  }

  const status = rows.some((r) => r.level === "block") ? "block" : rows.length ? "check" : "pass";
  return { status, rows, passed, value: len.value, over };
}
