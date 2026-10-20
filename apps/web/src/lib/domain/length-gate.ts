import { measure, type LengthUnit } from "./length";

// 분량 게이트 (Figma N49): 교사가 고른 목표 분량 ± 오차 안에 글이 들어와야 통과한다.
// 넘치면 문장을 빼지 않고 AI가 압축해 다시 맞추고, 모자라면 메모 속 과정·까닭을 풀어 쓴다(새 사실은 만들지 않음).
// 띠 위쪽은 나이스 한도를 넘지 않는다.

export const GATE_TOLERANCES: Record<LengthUnit, readonly number[]> = { bytes: [30, 50, 100], chars: [10, 20, 30] };
export const DEFAULT_TOLERANCE: Record<LengthUnit, number> = { bytes: 50, chars: 20 };
/** 게이트를 다시 맞추는 최대 횟수 (AI 호출) */
export const GATE_ROUNDS = 3;

export type Gate = { unit: LengthUnit; target: number; tol: number; lo: number; hi: number };

/** 목표·오차 → 통과 띠. 목표는 1 ~ 한도, 오차는 0 이상 — 위쪽은 한도에서 멈춘다 */
export function gateBand(input: { unit: LengthUnit; target: number; tol?: number; limit: number }): Gate {
  const limit = Math.max(1, Math.floor(input.limit));
  const target = Math.min(limit, Math.max(1, Math.floor(input.target || limit)));
  const tol = Math.max(0, Math.floor(input.tol ?? DEFAULT_TOLERANCE[input.unit]));
  return { unit: input.unit, target, tol, lo: Math.max(1, target - tol), hi: Math.min(limit, target + tol) };
}

/** 띠 가운데 (다시 맞출 때 겨누는 값) */
export const gateAim = (g: Gate) => Math.round((g.lo + g.hi) / 2);

export type GateCheck = { value: number; pass: boolean; dir: "늘리기" | "줄이기" | null; by: number };

/** 글이 띠 안인지 · 밖이면 어느 쪽으로 얼마나 (겨눔까지) */
export function gateCheck(text: string, g: Gate): GateCheck {
  const value = measure(text, g.unit);
  if (value < g.lo) return { value, pass: false, dir: "늘리기", by: gateAim(g) - value };
  if (value > g.hi) return { value, pass: false, dir: "줄이기", by: value - gateAim(g) };
  return { value, pass: true, dir: null, by: 0 };
}

/** 지금 글에 더하기 (N49b): 지금 글(+ 띄어쓰기 1)을 뺀 나머지 띠 — 지금 글이 이미 띠 아래쪽에 닿으면 null */
export function appendBand(g: Gate, kept: number): Gate | null {
  const k = kept + 1;
  if (k >= g.lo) return null;
  return { ...g, target: Math.max(1, g.target - k), lo: Math.max(1, g.lo - k), hi: Math.max(1, g.hi - k) };
}

/** 셋 중 띠에 가장 가까운 글 (다시 맞추다 멀어지면 앞 글을 쓴다) */
export function closest(texts: string[], g: Gate): string {
  const off = (t: string) => { const c = gateCheck(t, g); return c.pass ? 0 : c.dir === "늘리기" ? g.lo - c.value : c.value - g.hi; };
  return texts.filter(Boolean).reduce((best, t) => (off(t) < off(best) ? t : best), texts.find(Boolean) ?? "");
}

/** 메모 반영: 문장마다 기댄 근거 key → 고른 메모 가운데 빠진 것 */
export function coverage(sentences: { keys: string[] }[] | undefined, picked: string[]): { covered: string[]; missing: string[] } {
  const cited = new Set((sentences ?? []).flatMap((s) => s.keys));
  const covered = picked.filter((k) => cited.has(k));
  return { covered, missing: picked.filter((k) => !cited.has(k)) };
}

/** 화면에 돌려줄 게이트 결과 */
export type GateResult = {
  target: number;
  tol: number;
  lo: number;
  hi: number;
  value: number;
  pass: boolean;
  /** 다시 맞춘 횟수 */
  rounds: number;
  /** 고른 메모 수 · 글에 반영된 수 (메모로 쓸 때만) */
  memos?: { picked: number; covered: number; missing: string[] };
  /** 근거가 적어 늘리지 못함 (없는 내용을 만들지 않았다) */
  thin?: boolean;
  /** 거친 단계 (N49 ② 쓰는 중 → 끝난 뒤 보여 줌): 첫 글 분량 · 빠진 메모 넣기 전후 반영 수 · 맞추기 전후 분량 */
  trace?: { first: number; added?: { before: number; after: number }; fit?: { from: number; to: number } };
  /** 지금 글에 더하기 (N49b): 지금 글 분량 · 새로 더한 글 분량 (지금 글은 한 글자도 안 바꿈) */
  append?: { kept: number; added: number };
};

export function gateResult(text: string, g: Gate, rounds: number, extra?: Pick<GateResult, "memos" | "thin" | "trace" | "append">): GateResult {
  const c = gateCheck(text, g);
  return { target: g.target, tol: g.tol, lo: g.lo, hi: g.hi, value: c.value, pass: c.pass, rounds, ...extra };
}

/** 칩 글: "1,482 / 1,500B · 게이트 통과" · "1,320B · 목표보다 130B 짧아요" */
export function gateLabel(r: Pick<GateResult, "value" | "target" | "lo" | "hi" | "pass">, unit: LengthUnit): string {
  const u = unit === "bytes" ? "B" : "자";
  const n = (x: number) => x.toLocaleString("ko-KR");
  if (r.pass) return `${n(r.value)} / ${n(r.target)}${u} · 게이트 통과`;
  if (r.value < r.lo) return `${n(r.value)}${u} · 목표보다 ${n(r.lo - r.value)}${u} 짧아요`;
  return `${n(r.value)}${u} · 목표보다 ${n(r.value - r.hi)}${u} 길어요`;
}

/**
 * 근거(고른 메모 글)가 거의 없으면(띠 아래쪽의 8% 미만 — 1,500B 기준 약 40자) 늘리지 않는다.
 * 2026-10-20 사용자: "1500으로 하고 싶은데 왜 계속 700으로 줄이는거야" — 메모 몇 개여도 목표까지 풀어 쓴다.
 */
export const THIN_RATIO = 0.08;
export function thinEvidence(evidence: string[], g: Gate): boolean {
  const total = evidence.reduce((n, t) => n + measure(t, g.unit), 0);
  return total < g.lo * THIN_RATIO;
}
