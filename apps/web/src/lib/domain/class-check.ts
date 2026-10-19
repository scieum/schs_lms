// 반 전체 검사 (Figma N35 ①): 분반·프로그램·담임 반 학생 모두의 지금 글을 규칙 검사(N23 autoCheck)로 한 번에.
// AI 없음, 순수 함수 — 서버 액션이 부르고 화면(class-check-panel)이 그린다. 검사 기록은 남기지 않고 매번 새로 계산한다.

import { autoCheck, isNoSourceRow, isSpellRow, type CheckMore, type CheckRow } from "./auto-check";
import { PROVENANCE_DEFAULTS } from "./provenance";
import type { LengthRange } from "./length";

export type ClassStatus = "block" | "warn" | "pass" | "empty";

export type ClassCheckInput = {
  id: string;
  /** 표에 보일 이름 (화면에만, 검사에는 쓰지 않음) */
  label: string;
  text: string;
  range: LengthRange;
  /** 본문에서 찾은 이 학생의 이름·학번 (writing.findIdentity) */
  identity: string[];
  /** 비슷한 문장 (N34 similarPairs): 겹친 학생 수 · 가장 많이 겹친 학생 이름과 곳 수 */
  similar?: { count: number; with?: string; spots?: number };
  /** 확정한 학생 — 결과에는 보이고 AI 고치기에서는 뺀다 */
  locked?: boolean;
  /** 세특 과목명 (고칠 말 "○○ 탐구 활동") */
  context?: string;
  /** N38: 근거 없는 문장 (AI 원안이 있을 때만) */
  more?: CheckMore;
  /** N38: AI 원안에서 고친 비율 (원안이 없으면 null) · 기준 */
  editRatio?: number | null;
  editRatioMin?: number;
};

export type ClassCheckRow = {
  id: string;
  label: string;
  status: ClassStatus;
  /** 가장 큰 문제 + 나머지 걸린 곳 수 */
  top: { label: string; more: number } | null;
  /** 걸린 곳 수 (비슷한 문장 포함) */
  issues: number;
  /** 지금 분량 (range 단위) · 넘었는지 */
  bytes: number;
  over: boolean;
  locked: boolean;
  /** N38: 근거 없는 문장 수 · 맞춤법 걸린 곳 수 · 수정 비율(모르면 null) · 기준 미만 */
  nosource: number;
  spell: number;
  editRatio: number | null;
  lowEdit: boolean;
  /** AI로 고칠 수 있는 걸린 곳 (근거 없음 · 맞춤법 빼고) — 대기열 대상 */
  fixable: number;
};

export type ClassTotals = Record<ClassStatus, number>;
export type ClassCheckResult = { rows: ClassCheckRow[]; totals: ClassTotals };

/** 받침이 있으면 "과", 없으면 "와" (학생A와 · 민준과) */
export function withJosa(name: string): string {
  const c = name.trim().slice(-1);
  const code = c.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${name}와`;
  return `${name}${code % 28 ? "과" : "와"}`;
}

const q = (s: string) => `‘${s}’`;
const lastWord = (s: string) => s.trim().split(/\s+/).pop() ?? s;

/** 가장 큰 문제 고르는 순서: 막음(금칙어·학번/실명) → 분량 → 비슷한 문장 → 어미 → 학생 주어 → 그 밖 문체 → 금칙어 확인 */
function rank(r: CheckRow): number {
  if (r.level === "block" || r.key === "id") return 0;
  if (r.key === "len") return 1;
  if (r.key === "end") return 3;
  if (r.key === "style-학생 주어" || r.key === "style-그는·그가·그의") return 4;
  if (r.key.startsWith("style-")) return 5;
  if (isNoSourceRow(r)) return 7;
  if (isSpellRow(r)) return 8;
  return 6;
}

/** 행 이름표 (표의 "가장 큰 문제" 칸) */
export function topLabel(r: CheckRow, unit: LengthRange["unit"]): string {
  const word = r.label.match(/'(.+)'/)?.[1];
  if (r.key.startsWith("ban-")) return `금칙어 ${q(word ?? r.label)}`;
  if (r.key.startsWith("warn-")) return `금칙어 확인 ${q(word ?? r.label)}`;
  if (r.key === "id") return `학번·실명 ${q(r.phrase ?? "")}`;
  if (r.key === "len") {
    const n = r.label.match(/[\d,]+/)?.[0] ?? "";
    const u = unit === "bytes" ? "B" : "자";
    return r.label.startsWith("분량 초과") ? `분량 초과 ${n}${u}` : `분량 미달 · 최소 ${n}${u}`;
  }
  if (r.key === "end") {
    const n = r.label.match(/\d+/)?.[0] ?? "1";
    const w = lastWord(r.find ?? r.phrase ?? "");
    return `어미 ${q(`~${w.slice(-4)}`)} ${n}문장`;
  }
  if (r.key === "style-학생 주어" || r.key === "style-그는·그가·그의") return `학생 주어 ${q(r.phrase ?? "")}`;
  if (r.key === "style-쉼표 과다") return "쉼표가 많은 문장 1개";
  if (r.key === "style-가운데 점") return "가운데 점 ‘·’";
  if (r.key === "style-따옴표 문장") return "따옴표로만 된 문장";
  if (isNoSourceRow(r)) return `근거 없는 문장 · ${(r.sentenceIndex ?? 0) + 1}번`;
  if (isSpellRow(r)) return `맞춤법 ${q(r.phrase ?? "")}`;
  return r.label;
}

export function classCheck(items: ClassCheckInput[]): ClassCheckResult {
  const totals: ClassTotals = { block: 0, warn: 0, pass: 0, empty: 0 };
  const rows = items.map((it): ClassCheckRow => {
    const c = autoCheck(it.text, it.range, it.identity, undefined, it.context, it.more);
    const editRatio = it.editRatio ?? null;
    const lowEdit = editRatio != null && editRatio < (it.editRatioMin ?? PROVENANCE_DEFAULTS.editRatioMin);
    if (c.status === "empty") {
      totals.empty++;
      return { id: it.id, label: it.label, status: "empty", top: null, issues: 0, bytes: 0, over: false, locked: !!it.locked, nosource: 0, spell: 0, editRatio: null, lowEdit: false, fixable: 0 };
    }
    const nosource = c.rows.filter(isNoSourceRow).length;
    const spell = c.rows.filter(isSpellRow).length;
    const list = c.rows.map((r) => ({ rank: rank(r), label: topLabel(r, it.range.unit) }));
    const sim = it.similar?.count ? { rank: 2, label: it.similar.with ? `비슷한 문장 · ${withJosa(it.similar.with)} ${it.similar.spots ?? 1}곳` : `비슷한 문장 ${it.similar.count}명` } : null;
    if (sim) list.push(sim);
    list.sort((a, b) => a.rank - b.rank);
    const status: ClassStatus = c.status === "block" ? "block" : list.length ? "warn" : "pass";
    totals[status]++;
    return {
      id: it.id, label: it.label, status, issues: list.length,
      top: list.length ? { label: list[0].label, more: list.length - 1 } : null,
      bytes: c.value, over: c.over > 0, locked: !!it.locked,
      nosource, spell, editRatio, lowEdit, fixable: list.length - nosource - spell,
    };
  });
  return { rows, totals };
}

const ORDER: Record<ClassStatus, number> = { block: 0, warn: 1, pass: 2, empty: 3 };

/** 확정 불가 → 확인 → 통과 → 빈 글, 같은 결과 안에서는 걸린 곳 많은 순 (같으면 원래 순서) */
export function sortForReview<T extends Pick<ClassCheckRow, "status" | "issues">>(rows: T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.status] - ORDER[b.r.status] || b.r.issues - a.r.issues || a.i - b.i).map((x) => x.r);
}

/** AI로 한꺼번에 고칠 학생: 걸린 곳이 있고(확정 불가 · 확인), 확정하지 않은 학생. 빈 글은 넣지 않는다. 앞 limit 명까지 */
export const CLASS_FIX_LIMIT = 40;
export function fixTargets<T extends Pick<ClassCheckRow, "status" | "locked"> & { fixable?: number }>(rows: T[], limit = CLASS_FIX_LIMIT): T[] {
  // N38: 근거 없음 · 맞춤법만 걸린 학생은 넣지 않는다 (맞춤법은 학생 화면 모두 바꾸기, 근거는 교사가 골라야 해서)
  return rows.filter((r) => (r.status === "block" || r.status === "warn") && !r.locked && (r.fixable ?? 1) > 0).slice(0, limit);
}

/** N38 거르기 칩 수: 근거 없음 · 맞춤법 · 수정 적음 (명) */
export function provenanceCounts(rows: Pick<ClassCheckRow, "nosource" | "spell" | "lowEdit">[]): { nosource: number; spell: number; low: number } {
  return { nosource: rows.filter((r) => r.nosource > 0).length, spell: rows.filter((r) => r.spell > 0).length, low: rows.filter((r) => r.lowEdit).length };
}

/** 서버 액션 → 패널: 표 한 줄 (학번·이름은 화면에만 — 링크에는 내부 id만) */
export type ClassViewRow = ClassCheckRow & {
  no: string;
  name: string;
  href: string;
  unit: LengthRange["unit"];
  max: number;
  /** AI 고치기 대상만 지금 글 (넣기 전 글 · 되돌리기) */
  text?: string;
};
export type ClassCheckView = { ok: true; at: string; totals: ClassTotals; rows: ClassViewRow[] } | { ok: false; error: string };

/** 요약 막대 비율 (빈 칸은 빼고) */
export function barParts(t: ClassTotals): { key: ClassStatus; pct: number }[] {
  const total = t.block + t.warn + t.pass + t.empty;
  if (!total) return [];
  return (["block", "warn", "pass", "empty"] as const).filter((k) => t[k] > 0).map((k) => ({ key: k, pct: (t[k] / total) * 100 }));
}
