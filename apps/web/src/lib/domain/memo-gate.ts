import { measure, type LengthUnit } from "./length";
import { DEFAULT_TOLERANCE, GATE_TOLERANCES, type GateResult } from "./length-gate";

// 메모 묶어 쓰기 화면 규칙 (Figma N49): 빠르게 고르기 · 오차 기억 · ③ 게이트 줄 · 쓴 뒤 단계 줄 · 수정 요청 칩.
// 화면은 여기서 고른 값만 그린다 (계산은 순수 함수로 두고 테스트한다).

const n = (x: number) => x.toLocaleString("ko-KR");
export const unitMark = (u: LengthUnit) => (u === "bytes" ? "B" : "자");

// ---------- 빠르게 고르기 (N49 a) ----------

export type QuickPick = "all" | "must" | "recent";
export const QUICK_LABEL: Record<QuickPick, string> = { all: "모두", must: "꼭 넣기만", recent: "최근 3개" };
export const RECENT_N = 3;
type PickItem = { id: string; date: string | null; weight?: number };

/** 칩을 누르면 바뀔 체크 묶음. 최근 3개 = 날짜 순 마지막 3개(지금 글은 빼고, 날짜 없는 메모 = 지금 = 가장 최근) */
export function quickPick(pieces: PickItem[], kind: QuickPick): Set<string> {
  if (kind === "all") return new Set(pieces.map((p) => p.id));
  if (kind === "must") return new Set(pieces.filter((p) => (p.weight ?? 2) === 3).map((p) => p.id));
  const memos = pieces.map((p, i) => ({ p, i })).filter(({ p }) => p.id !== "body");
  const key = (d: string | null) => d ?? "9999-99-99";
  memos.sort((a, b) => (key(a.p.date) < key(b.p.date) ? -1 : key(a.p.date) > key(b.p.date) ? 1 : a.i - b.i));
  return new Set(memos.slice(-RECENT_N).map(({ p }) => p.id));
}

/** 지금 고른 묶음과 똑같은 칩 (없으면 null) — 그 칩만 인디고 */
export function activeQuick(pieces: PickItem[], selected: Set<string>): QuickPick | null {
  if (!selected.size) return null;
  const same = (s: Set<string>) => s.size === selected.size && [...s].every((id) => selected.has(id));
  for (const k of ["all", "must", "recent"] as const) if (same(quickPick(pieces, k))) return k;
  return null;
}

// ---------- 오차 (이 기기 · 영역별 기억) ----------

export const tolKey = (scope: string, unit: LengthUnit) => `schs.gate-tol.${scope}.${unit}`;
/** 기억한 값이 고를 수 있는 오차가 아니면 기본값 */
export function parseTol(raw: string | null | undefined, unit: LengthUnit): number {
  const v = Number(raw);
  return GATE_TOLERANCES[unit].includes(v) ? v : DEFAULT_TOLERANCE[unit];
}
/** "1,450~1,500B" */
export const bandText = (b: { lo: number; hi: number }, unit: LengthUnit) => `${n(b.lo)}~${n(b.hi)}${unitMark(unit)}`;

// ---------- ③ 게이트 줄 (N49 c) ----------

export type GateTone = "pass" | "short" | "long" | "over";
export type GateRow = {
  tone: GateTone;
  /** 분량 칩 글 */
  label: string;
  value: number;
  lo: number;
  hi: number;
  /** 메모 반영 (AI 결과 그대로일 때만) */
  memos?: GateResult["memos"];
  /** 근거가 적음 — 짧음 칩 끝에 "근거가 적어요" */
  thin: boolean;
  /** 지금 글에 더하기 (N49b, AI 결과 그대로일 때만): 지금 글 · 더한 글 분량 */
  append?: GateResult["append"];
};

/**
 * 지난 AI 게이트 결과 + 지금 글 → 게이트 줄. 글을 손으로 고치면 분량은 지금 글로 다시 재고, 메모 반영은 숨긴다.
 * limit = 나이스 한도: 넘으면 빨강(확정 불가), 띠 위 · 한도 아래면 주황 "목표보다 길어요", 띠 아래면 주황 "짧아요".
 */
export function gateRow(input: { text: string; gate: GateResult; gateText: string; unit: LengthUnit; limit: number }): GateRow {
  const { gate, unit, limit } = input;
  const same = input.text === input.gateText;
  const u = unitMark(unit);
  const value = measure(input.text, unit);
  const base = { value, lo: gate.lo, hi: gate.hi, memos: same ? gate.memos : undefined, append: same ? gate.append : undefined };
  if (value > limit) return { ...base, tone: "over", thin: false, label: `${n(value)}${u} · 나이스 한도보다 ${n(value - limit)}${u} 넘어요` };
  if (value >= gate.lo && value <= gate.hi) return { ...base, tone: "pass", thin: false, label: `${n(value)} / ${n(gate.target)}${u} · 게이트 통과` };
  if (value > gate.hi) return { ...base, tone: "long", thin: false, label: `${n(value)}${u} · 목표보다 ${n(value - gate.hi)}${u} 길어요` };
  const thin = !!gate.thin;
  return { ...base, tone: "short", thin, label: `${n(value)}${u} · 목표보다 ${n(gate.lo - value)}${u} 짧아요${thin ? " · 근거가 적어요" : ""}` };
}

/** 빠진 메모 id → 메모 (순서는 고른 순서, 모르는 id 는 버린다) */
export function missingPieces<T extends { id: string }>(missing: string[] | undefined, pieces: T[]): T[] {
  const want = new Set(missing ?? []);
  return pieces.filter((p) => want.has(p.id));
}

// ---------- ② 쓴 뒤 줄 (N49 b): 서버가 거친 단계 그대로 ----------

/** "첫 글 1,612B · 빠진 메모 넣기 4→5 · 분량 맞추기 1,612→1,480B" */
export function traceLine(gate: GateResult | undefined, unit: LengthUnit): string {
  if (!gate?.trace) return "";
  const u = unitMark(unit);
  const t = gate.trace;
  const parts = [`첫 글 ${n(t.first)}${u}`];
  if (t.added) parts.push(`빠진 메모 넣기 ${t.added.before}→${t.added.after}`);
  else if (gate.memos) parts.push(`메모 반영 ${gate.memos.covered}/${gate.memos.picked}`);
  if (t.fit) parts.push(`분량 맞추기 ${n(t.fit.from)}→${n(t.fit.to)}${u}`);
  else if (gate.pass) parts.push(`${n(gate.value)}${u} · 맞음`);
  return parts.join(" · ");
}

// ---------- 수정 요청 (N49 c · e) ----------

export type ReviseKind = "record" | "behavior" | "log";
/** 빠른 요청 칩. 행발은 "진로와 잇기" 대신 "생활 장면 더", 누가기록은 작은 세 개 */
export function reviseChips(kind: ReviseKind): string[] {
  if (kind === "log") return ["더 구체적으로", "문장 자연스럽게", "짧게 핵심만"];
  return ["더 구체적으로", kind === "behavior" ? "생활 장면 더" : "진로와 잇기", "문장 자연스럽게", "순서 바꾸기", "줄여서 핵심만"];
}
export const REVISE_MAX = 200;

/** 고른 칩 + 적은 말 → 서버에 보낼 요청 한 줄 (둘 다 없으면 "") */
export function composeRequest(chips: string[], note: string): string {
  const t = note.trim().slice(0, REVISE_MAX);
  return [chips.length ? chips.join(", ") : "", t].filter(Boolean).join(" / ");
}

/** "47자 · 113B" (누가기록 결과 머리) */
export const charsBytes = (t: string) => `${n(t.length)}자 · ${n(measure(t, "bytes"))}B`;
