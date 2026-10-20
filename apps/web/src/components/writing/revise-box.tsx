"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Send } from "lucide-react";
import { cx } from "@/components/ui";
import { measure, type LengthUnit } from "@/lib/domain/length";
import type { GateResult } from "@/lib/domain/length-gate";
import { charsBytes, composeRequest, gateRow, REVISE_MAX, reviseChips, unitMark, type ReviseKind } from "@/lib/domain/memo-gate";
import { BeforeAfter, changeCount } from "./before-after";
import { GateChip } from "./gate-chips";
import { AiTag, GateProgress } from "./gate-progress";

// AI에게 고쳐 달라고 하기 (Figma N49 571:772 · 571:851): ③ 글 칸 바로 아래 · 자동 검사 위.
// 빠른 요청 칩(여러 개) + 입력(200자) + [요청 보내기] → 고치는 중(정직한 진행) → 전 · 후 결과 + 게이트 칩 → [그대로 두기] [이걸로 바꾸기].
// 이걸로 바꾸기를 눌러야 글이 바뀐다(자동 적용 없음). 바꾼 글은 이 칸 안에서만 기억해 "되돌리기"로 바로 앞 글로 돌린다.

type Result = { ok: true; text: string; gate?: GateResult } | { ok: false; error: string };

export function ReviseBox({ kind, text, unit, limit, band, run, onApply, small = false, disabled }: {
  kind: ReviseKind;
  /** 지금 글 (보낼 글 · "지금" 칸) */
  text: string;
  unit: LengthUnit;
  /** 나이스 한도 (게이트 칩 색) */
  limit: number;
  /** 머리 오른쪽 "1,450~1,500B 유지" (누가기록은 없음) */
  band?: string;
  run: (request: string) => Promise<Result>;
  onApply: (text: string, gate?: GateResult) => void;
  /** 작게 (누가기록 ③) */
  small?: boolean;
  /** 보낼 수 없는 까닭 (AI 꺼짐 등) — 칩 · 입력 · 버튼이 꺼진다 */
  disabled?: string;
}) {
  const chips = reviseChips(kind);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ before: string; text: string; gate?: GateResult; chips: string[]; note: string } | null>(null);
  const [error, setError] = useState("");
  // 요청 기록 (이 칸 · 이 탭): 보낸 수 · 바꾸기 전 글
  const [sent, setSent] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const req = useRef(0);
  // 그만 쓰기: 돌아온 답은 버리고 칸을 바로 되돌린다
  const [stopped, setStopped] = useState(false);
  const busy = pending && !stopped;
  const request = composeRequest(picked, note);
  const off = !!disabled;

  const send = () => {
    if (!request || off) return;
    const id = ++req.current;
    const before = text;
    const used = { chips: picked, note: note.trim() };
    setError("");
    setStopped(false);
    setSent((n) => n + 1);
    start(async () => {
      let r: Result;
      try { r = await run(request); } catch { r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 다시 보내 주세요" }; }
      if (id !== req.current) return; // 그만 쓰기
      if (!r.ok) { setError(r.error); return; }
      setResult({ before, text: r.text, gate: r.gate, ...used });
    });
  };
  const apply = () => {
    if (!result) return;
    setHistory((h) => [...h, result.before]);
    onApply(result.text, result.gate);
    setResult(null);
    setPicked([]);
    setNote("");
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (prev == null) return;
    setHistory((h) => h.slice(0, -1));
    onApply(prev);
  };
  const undoLine = (sent > 0 || history.length > 0) && (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-mute">
      요청 {sent}번
      {history.length > 0 && <><span aria-hidden>·</span><button type="button" onClick={undo} className="font-bold text-key-strong">되돌리기</button></>}
    </span>
  );

  if (busy) {
    return (
      <GateProgress small={small} title="AI가 고치는 중" onStop={() => { req.current++; setStopped(true); }}
        line={band ? `${request.slice(0, 60)} · ${band} 안에 맞춰요` : request.slice(0, 60)}
        steps={kind === "log"
          ? [{ name: "① 요청 반영", state: "current" }]
          : [{ name: "① 요청 반영", state: "current" }, { name: "② 분량 맞추기", value: band, state: "todo" }]} />
    );
  }

  if (result) {
    const row = result.gate ? gateRow({ text: result.text, gateText: result.text, gate: result.gate, unit, limit }) : null;
    const meta = (t: string): ReactNode => (kind === "log" ? charsBytes(t) : `${measure(t, unit).toLocaleString()}${unitMark(unit)}`);
    const changes = changeCount(result.before, result.text);
    return (
      <div className={cx("flex flex-col rounded-inner bg-bg", small ? "gap-2 p-3" : "gap-2.5 px-3.5 py-3.5 md:px-4")} aria-label="고친 글">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <AiTag />
          <span className="shrink-0 text-[14px] font-bold">고친 글</span>
          {row && <GateChip row={row} />}
          <span className="max-md:basis-full md:ml-auto">{undoLine}</span>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-sub">
          <span className="font-bold text-ink">요청</span>
          {result.chips.map((c) => <span key={c} className="inline-flex h-[22px] items-center whitespace-nowrap rounded-chip border border-line bg-[#fff] px-1.5">{c}</span>)}
          {result.note && <span className="min-w-0 break-keep">{result.note}</span>}
        </p>
        <BeforeAfter before={result.before} after={result.text} beforeMeta={meta(result.before)} afterMeta={meta(result.text)} />
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <span className="min-w-0 flex-1 text-[12px] text-mute">
            바뀐 곳 {changes}{result.gate?.memos ? ` · 메모 반영 ${result.gate.memos.covered}/${result.gate.memos.picked}` : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setResult(null)}
              className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3.5 text-[14px] font-bold hover:bg-soft md:h-9 md:flex-none md:text-[13px]">그대로 두기</button>
            <button type="button" onClick={apply}
              className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-control bg-key px-3.5 text-[14px] font-bold text-white hover:bg-key-strong md:h-9 md:flex-none md:text-[13px]">이걸로 바꾸기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col rounded-inner bg-bg", small ? "gap-2 p-3" : "gap-2.5 px-3.5 py-3.5 md:px-4")} aria-label="AI에게 고쳐 달라고 하기">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AiTag />
        <span className={cx("whitespace-nowrap font-bold", small ? "text-[13px]" : "text-[14px]")}>AI에게 고쳐 달라고 하기</span>
        <span className="ml-auto">{history.length > 0 || sent > 0 ? undoLine : band && <span className="whitespace-nowrap text-[12px] font-medium tabular-nums text-mute">{band} 유지</span>}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="빠른 요청">
        {chips.map((c) => {
          const on = picked.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on} disabled={off} onClick={() => setPicked(on ? picked.filter((x) => x !== c) : [...picked, c])}
              className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-chip border px-2.5 text-[13px] disabled:opacity-50", small ? "h-7 text-[12px]" : "h-[30px]",
                on ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub")}>
              {c}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, REVISE_MAX))} maxLength={REVISE_MAX} rows={1} disabled={off}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder={kind === "log" ? "예: 실험 장면을 한 줄 더" : "예: 두 번째 활동을 앞으로, 실험 과정 더 자세히"} aria-label="고칠 점"
          className={cx("block w-full min-w-0 resize-none rounded-field border border-hair bg-[#fff] px-3 text-[14px] leading-5 outline-none [field-sizing:content] placeholder:text-mute focus:border-key disabled:opacity-50 max-md:max-h-[64px] md:flex-1",
            small ? "min-h-10 py-[9px] md:max-h-10 md:overflow-hidden" : "min-h-11 py-[11px] md:max-h-11 md:overflow-hidden")} />
        <button type="button" onClick={send} disabled={!request || off}
          className={cx("inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-4 text-[14px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:cursor-not-allowed disabled:bg-soft disabled:text-mute",
            small ? "h-11 md:h-10" : "h-11")}>
          <Send size={14} aria-hidden /> {kind === "log" ? "보내기" : "요청 보내기"}
        </button>
      </div>
      {off && <p className="text-[12px] text-mute">{disabled}</p>}
      {error && <p className="text-[12px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
