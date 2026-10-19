"use client";
import { useRef, useState, useTransition } from "react";
import { Combine, Copy, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { MergeList } from "./merge-list";
import type { Importance, MergePiece } from "@/lib/domain/merge";
import { cleanActivity } from "@/lib/domain/activity-name";
import { composeKeywordMemo, parseKeywordMemo, type AiDraftResult, type KeywordBlock } from "@/lib/domain/writing";
import { StepHead } from "./step-head";

const EMPTY: KeywordBlock = { topic: "", activity: "", keywords: "" };
const FIELD = "w-full rounded-field bg-soft px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-key";
type Mode = "merge" | "memo" | "keywords";
const TABS: [Mode, string][] = [["merge", "조각 합치기"], ["memo", "메모로"], ["keywords", "키워드로"]];

// ② 본문 만들기 (Figma N32 401:580): [조각 합치기 | 메모로 | 키워드로] → 목표 바이트(바닥 줄 한 곳) → 초안 결과 → 본문에 넣기.
// 조각이 있으면 조각 합치기가 기본, 0개면 메모로. 자료는 ① 조각 모으기에서만 받는다(자료로 탭 없음).
// 활동명은 ①의 칸 하나를 같이 쓴다 — 여기서는 칩으로 보여 주고 "바꾸기"는 ① 칸으로 보낸다.
// 결과는 본문(편집기)에 채우기만 하고 저장은 교사가 따로 누른다. 본문이 비어 있으면 바로 채운다.
export function AiDraftPanel({
  initialMemo = "",
  placeholder,
  unit,
  bodyEmpty,
  activity,
  onEditActivity,
  generate,
  merge,
  onApply,
  done,
}: {
  initialMemo?: string;
  placeholder: string;
  unit: LengthUnit;
  bodyEmpty: boolean;
  /** ① 조각 모으기의 활동명 (N27, 메모로·키워드로에서 필수) */
  activity: string;
  /** "바꾸기"·"적기": ① 활동명 칸으로 */
  onEditActivity: () => void;
  generate: (memo: string, activity: string, max: number) => Promise<AiDraftResult>;
  /** 합치기: ①에서 불러온 조각(null = 불러오는 중) · 지금 본문 · NEIS 최대 · 합치기 */
  merge: { pieces: MergePiece[] | null; body: string; neisMax: number; run: (pieces: MergePiece[], max: number) => Promise<AiDraftResult> };
  onApply: (text: string) => void;
  done?: boolean;
}) {
  const [memo, setMemo] = useState(initialMemo);
  const [blocks, setBlocks] = useState<KeywordBlock[]>(() => parseKeywordMemo(initialMemo) ?? [{ ...EMPTY }]);
  const [picked, setPicked] = useState<Mode | null>(null);
  const pieceCount = merge.pieces?.length ?? 0;
  // 고르기 전에는: 조각이 있으면 합치기, 없으면 메모로(키워드 메모가 있으면 키워드로)
  const mode: Mode = picked ?? (pieceCount > 0 ? "merge" : parseKeywordMemo(initialMemo) ? "keywords" : "memo");
  const [target, setTarget] = useState(merge.neisMax);
  const max = Math.min(merge.neisMax, Math.max(1, target || merge.neisMax));
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];

  // 합치기에서 뺀 조각 (새로 남긴 조각은 저절로 골라진다)
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mergedCount, setMergedCount] = useState(0);
  // 조각 중요도 (Figma N20): 이 기기에만 기억해 둔다 (다음에 열어도 그대로)
  const [weights, setWeights] = useState<Record<string, Importance>>({});
  const weightOf = (id: string): Importance => {
    if (weights[id]) return weights[id];
    if (id === "body") return 3;
    try {
      const v = Number(localStorage.getItem(`schs.piece-weight.${id}`));
      if (v === 1 || v === 3) return v;
    } catch { /* 저장소를 못 쓰면 보통 */ }
    return 2;
  };
  const setWeight = (id: string, w: Importance) => {
    setWeights((cur) => ({ ...cur, [id]: w }));
    try {
      if (id !== "body") localStorage.setItem(`schs.piece-weight.${id}`, String(w));
    } catch { /* 기억 못 해도 이번 합치기에는 쓴다 */ }
  };
  // 지금 본문도 조각 하나 (맨 위)
  const bodyPiece: MergePiece[] = merge.body.trim() ? [{ id: "body", source: "본문", date: null, text: merge.body.trim() }] : [];
  const allPieces = [...bodyPiece, ...(merge.pieces ?? [])].map((p) => ({ ...p, weight: weightOf(p.id) }));
  const selected = new Set(allPieces.filter((p) => !excluded.has(p.id)).map((p) => p.id));
  const setSelected = (s: Set<string>) => setExcluded(new Set(allPieces.filter((p) => !s.has(p.id)).map((p) => p.id)));

  const input = mode === "keywords" ? composeKeywordMemo(blocks) : memo;
  const setBlock = (i: number, k: keyof KeywordBlock, v: string) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const [result, setResult] = useState<Extract<AiDraftResult, { ok: true }> | null>(null);
  const [resultMode, setResultMode] = useState<Mode>("memo");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const req = useRef(0);
  const name = cleanActivity(activity);

  function run() {
    const id = ++req.current;
    setError("");
    setCopied(false);
    const m = mode;
    start(async () => {
      let r: AiDraftResult;
      try {
        if (m === "merge") {
          const chosen = allPieces.filter((x) => selected.has(x.id));
          setMergedCount(chosen.length);
          r = chosen.length ? await merge.run(chosen, max) : { ok: false, error: "합칠 조각을 골라 주세요" };
        } else {
          r = await generate(input, activity, max);
        }
      } catch {
        r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 직접 써 주세요" };
      }
      if (id !== req.current) return; // 취소됨
      if (!r.ok) {
        setResult(null);
        setError(r.error);
        return;
      }
      setResult(r);
      setResultMode(m);
      if (bodyEmpty) onApply(r.text);
    });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const meta = mode === "merge" ? (merge.pieces === null ? "" : `조각 ${selected.size}개 고름`) : mode === "memo" ? "메모로 초안" : "키워드로 초안";
  const activityChip = (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-chip bg-soft px-2.5 py-[5px]">
      <span className="shrink-0 text-[12px] text-mute">활동명</span>
      {name ? (
        <>
          <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
          <button type="button" onClick={onEditActivity} className="shrink-0 whitespace-nowrap text-[12px] font-medium text-key-strong">바꾸기</button>
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-[13px] text-sub">①에서 먼저 적어 주세요</span>
          <button type="button" onClick={onEditActivity} className="shrink-0 whitespace-nowrap text-[12px] font-medium text-key-strong">적기</button>
        </>
      )}
    </span>
  );
  const needsActivity = mode !== "merge";
  const canRun = mode === "merge" ? selected.size > 0 && merge.pieces !== null : !!name && !!input.trim();

  return (
    <section aria-label="본문 만들기" className="flex flex-col gap-3">
      <StepHead n={2} title="본문 만들기" meta={meta} done={done} />
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <div className="flex w-max rounded-full bg-soft p-[3px]" role="tablist" aria-label="본문 만드는 방법">
            {TABS.map(([k, l]) => {
              const off = k === "merge" && pieceCount === 0;
              return (
                <button key={k} type="button" role="tab" aria-selected={mode === k} disabled={off} onClick={() => setPicked(k)}
                  className={cx("h-[30px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] disabled:opacity-40", mode === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>{l}</button>
              );
            })}
          </div>
        </div>
        {needsActivity && activityChip}
      </div>

      {mode === "merge" ? (
        merge.pieces === null ? (
          <p className="py-6 text-center text-[13px] text-mute" role="status">조각을 모으는 중이에요</p>
        ) : (
          <MergeList pieces={allPieces} onWeight={setWeight} selected={selected} setSelected={setSelected} unit={unit} target={max} />
        )
      ) : mode === "memo" ? (
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={6000}
          placeholder={placeholder}
          aria-label="관찰 메모"
          className="h-[120px] w-full resize-y rounded-field bg-soft px-3 py-2.5 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-key md:h-24"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-inner border border-line p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-sub">활동 {i + 1}</span>
                <span className="flex-1" />
                {blocks.length > 1 && (
                  <button type="button" aria-label={`활동 ${i + 1} 빼기`} onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))} className="text-mute"><X size={14} /></button>
                )}
              </div>
              <input value={b.topic} onChange={(e) => setBlock(i, "topic", e.target.value)} maxLength={100} placeholder="(주제) 예: 빗면에서 가속도 측정" aria-label={`활동 ${i + 1} 주제`} className={FIELD} />
              <textarea value={b.activity} onChange={(e) => setBlock(i, "activity", e.target.value)} rows={2} maxLength={400}
                placeholder="(활동) 예: 각도를 바꿔 측정, 오차 원인을 마찰로 분류, 반복 측정 제안" aria-label={`활동 ${i + 1} 활동`} className={cx(FIELD, "resize-y leading-6")} />
              <input value={b.keywords} onChange={(e) => setBlock(i, "keywords", e.target.value)} maxLength={100} placeholder="(키워드) 예: 실험 설계, 오차 분석, 주도성" aria-label={`활동 ${i + 1} 키워드`} className={FIELD} />
            </div>
          ))}
          {blocks.length < 3 && (
            <button type="button" onClick={() => setBlocks((bs) => [...bs, { ...EMPTY }])} className="flex items-center gap-1 self-start text-[13px] font-medium text-key-strong">
              <Plus size={14} /> 활동 추가
            </button>
          )}
        </div>
      )}

      {/* 바닥 줄: 목표 분량은 여기 한 번 (합치기·메모로·키워드로 모두) */}
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2.5 md:flex-1">
          <span className="shrink-0 text-[13px] font-medium text-sub">목표</span>
          <label className="flex h-9 min-w-0 flex-1 items-center rounded-field bg-soft px-3 focus-within:ring-2 focus-within:ring-key md:w-24 md:flex-none">
            <input inputMode="numeric" value={target ? target.toLocaleString() : ""} aria-label="목표 분량"
              onChange={(e) => setTarget(Math.min(merge.neisMax, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
              className="w-full min-w-0 bg-transparent text-right text-[14px] font-medium tabular-nums outline-none" />
            <span className="ml-1 shrink-0 text-[13px] text-mute">{u}</span>
          </label>
          <span className="shrink-0 whitespace-nowrap text-[12px] text-mute">최대 {merge.neisMax.toLocaleString()}{u}</span>
        </div>
        {pending ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 flex-1 overflow-hidden rounded-full bg-line md:flex-none" aria-hidden>
              <div className="h-full w-1/3 animate-pulse rounded-full bg-key" />
            </div>
            <span className="whitespace-nowrap text-[13px] text-sub" role="status">쓰는 중이에요</span>
            <Button type="button" kind="ghost" size="sm" onClick={() => { req.current++; setError(""); }}>취소</Button>
          </div>
        ) : mode === "merge" ? (
          <Button type="button" kind="soft" size="sm" onClick={run} disabled={!canRun} className="h-11 disabled:opacity-40 max-md:w-full md:h-9"><Combine size={14} /> 합치기</Button>
        ) : (
          <Button type="button" kind="soft" size="sm" onClick={run} disabled={!canRun} className="h-11 disabled:opacity-40 max-md:w-full md:h-9"><Sparkles size={14} /> AI 초안</Button>
        )}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {result && !pending && (
        <div className="flex flex-col gap-2.5 rounded-inner bg-bg p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">초안</Tag>
            {result.sample && <Tag tone="bg-[#fff] text-mute">예시</Tag>}
            {resultMode === "merge" && mergedCount > 0 && <Tag tone="bg-[#fff] text-sub">{`조각 ${mergedCount}개`}</Tag>}
            <span className="ml-auto text-[12px] tabular-nums text-sub">
              <b className="text-ink">{measure(result.text, unit).toLocaleString()}</b> / {max.toLocaleString()}{u}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-[14px] leading-6">{result.text}</p>
          {result.notice && <p className="text-[12px] text-mute">{result.notice}</p>}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex gap-2">
              <Button type="button" kind="outline" size="sm" onClick={copy}><Copy size={13} /> {copied ? "복사했어요" : "복사"}</Button>
              <Button type="button" kind="ghost" size="sm" onClick={run}><RotateCcw size={13} /> 다시 쓰기</Button>
            </div>
            <Button type="button" size="sm" className="h-11 max-md:w-full md:ml-auto md:h-9" onClick={() => onApply(result.text)}>본문에 넣기</Button>
          </div>
        </div>
      )}
    </section>
  );
}
