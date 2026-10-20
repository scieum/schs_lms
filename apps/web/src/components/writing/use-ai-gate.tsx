"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import type { LengthUnit } from "@/lib/domain/length";
import { gateBand, type GateResult } from "@/lib/domain/length-gate";
import type { MergePiece } from "@/lib/domain/merge";
/** 지금 글에 더하기 (N49b) */
export type MergeOpts = { append?: boolean };
import { bandText, gateRow, missingPieces, parseTol, tolKey } from "@/lib/domain/memo-gate";
import type { AiDraftResult } from "@/lib/domain/writing";
import { GateChips } from "./gate-chips";

// ③ 게이트 줄 상태 (Figma N49 c): 마지막 AI 게이트 결과 · 그 글 · 그때 고른 메모를 기억한다.
// 글이 그대로면 메모 반영까지, 손으로 고치면 분량만 지금 글로 다시 잰다. [↻ 다시 맞추기] = 맞추기(fit) · [넣어서 다시 맞추기] = 지금 글 + 고른 메모로 다시 모아 쓰기(빠진 메모는 꼭 넣기).
const noSub = () => () => {};

type Last = { text: string; gate: GateResult; picked: MergePiece[] | null };

export function useAiGate({ text, unit, limit, target, scope, fit, merge, apply, onMoreMemos }: {
  text: string;
  unit: LengthUnit;
  /** 나이스 한도 */
  limit: number;
  /** AI 결과가 없을 때 수정 요청이 지킬 목표 (지금 분량 설정) */
  target: number;
  /** 오차 기억 이름 (② 칸과 같은 값) */
  scope: string;
  fit: (text: string, target: number, tol: number) => Promise<AiDraftResult>;
  merge: (pieces: MergePiece[], target: number, tol: number) => Promise<AiDraftResult>;
  /** 결과를 ③ 글에 넣기 (되돌리기 스낵바) */
  apply: (text: string, r: AiDraftResult & { ok: true }) => void;
  onMoreMemos: () => void;
}) {
  const [last, setLast] = useState<Last | null>(null);
  const [busy, setBusy] = useState<"fit" | "add" | null>(null);
  const [error, setError] = useState("");
  const sent = useRef<MergePiece[] | null>(null);
  const storedTol = useSyncExternalStore(noSub, () => { try { return localStorage.getItem(tolKey(scope, unit)); } catch { return null; } }, () => null);

  /** ② 모아 쓰기에 보낸 메모를 기억해 두는 감싸개 */
  const track = (run: (ps: MergePiece[], max: number, tol: number, opts?: MergeOpts) => Promise<AiDraftResult>) => (ps: MergePiece[], max: number, tol: number, opts?: MergeOpts) => {
    sent.current = ps;
    return run(ps, max, tol, opts);
  };
  /** AI 결과가 ③에 들어갔을 때 (게이트가 없으면 줄을 지운다) */
  const remember = (t: string, gate?: GateResult, picked?: MergePiece[] | null) => {
    setError("");
    setLast(gate ? { text: t, gate, picked: picked !== undefined ? picked : gate.memos ? sent.current : null } : null);
  };

  const band = last ? { target: last.gate.target, tol: last.gate.tol, lo: last.gate.lo, hi: last.gate.hi }
    : gateBand({ unit, target, tol: parseTol(storedTol, unit), limit });
  const row = last && text.trim() ? gateRow({ text, gate: last.gate, gateText: last.text, unit, limit }) : null;
  const missing = last ? missingPieces(last.gate.memos?.missing, last.picked ?? []) : [];

  const runFix = (kind: "fit" | "add") => {
    if (!last || busy) return;
    const { gate, picked } = last;
    setBusy(kind);
    setError("");
    void (async () => {
      let r: AiDraftResult;
      let ps: MergePiece[] | null = null;
      try {
        if (kind === "fit") r = await fit(text, gate.target, gate.tol);
        else {
          const lack = new Set(gate.memos?.missing ?? []);
          const memos = (picked ?? []).filter((p) => p.id !== "body").map((p) => (lack.has(p.id) ? { ...p, weight: 3 as const } : p));
          ps = [{ id: "body", source: "본문", date: null, text, weight: 3 }, ...memos];
          r = await merge(ps, gate.target, gate.tol);
        }
      } catch {
        r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 다시 눌러 주세요" };
      }
      setBusy(null);
      if (!r.ok) { setError(r.error); return; }
      apply(r.text, r);
      setLast(r.gate ? { text: r.text, gate: r.gate, picked: ps ?? (r.gate.memos ? picked : null) } : null);
    })();
  };

  const chips = row ? (
    <GateChips row={row} unit={unit} missing={missing} error={error}
      onRefit={() => runFix("fit")} refitting={busy === "fit"}
      onAddMissing={last?.picked ? () => runFix("add") : undefined} adding={busy === "add"}
      onMoreMemos={onMoreMemos} />
  ) : null;

  return { track, remember, chips, busy: !!busy, band, bandLabel: bandText(band, unit) };
}
