"use client";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Layers, Lock, Plus, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { MemoCollect } from "./memo-collect";
import { orderPieces, type Importance, type MergePiece } from "@/lib/domain/merge";
import { cleanActivity } from "@/lib/domain/activity-name";
import { composeKeywordMemo, parseKeywordMemo, type AiDraftResult, type KeywordBlock } from "@/lib/domain/writing";
import { StepHead } from "./step-head";
import { SaveBookmark } from "./library-save";
import { appendBand, gateBand } from "@/lib/domain/length-gate";
import type { MergeOpts } from "./use-ai-gate";
import { bandText, parseTol, tolKey, traceLine } from "@/lib/domain/memo-gate";
import { TargetPicker, TolPicker } from "./gate-pickers";
import { GateProgress } from "./gate-progress";

const EMPTY: KeywordBlock = { topic: "", activity: "", keywords: "" };
const FIELD = "w-full rounded-field bg-[#fff] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-key";
type Mode = "merge" | "memo" | "keywords";

// ② AI로 쓰기 (Figma N40 484:700 → N41 492:824): 기본은 늘 펼친 "메모 모아 쓰기" 칸 — 넣을 메모 체크 · 중요도(꼭 넣기/보통/참고) ·
// 순서(위/아래, 그 순서 그대로 AI에 보낸다) · 고른 양 ↔ 목표 · 성취수준(안 고르면 사실 그대로) → 주 버튼 "고른 메모 n개로 글 쓰기".
// 결과는 ③ 글에 바로 들어가고(지난 글은 "되돌리기") 쓴 뒤 줄이 남는다. 다른 방법(메모 한 번에 적기 · 키워드로)은 작은 글 링크.
// 활동명은 ① 칸 하나를 같이 쓴다 — 다른 방법에서만 칩으로 보여 주고 "바꾸기"는 ① 칸으로 보낸다.
// N49 메모 묶어 쓰기: 목표 · 오차(±30 · ±50 · ±100, 이 기기 · 영역별 기억) → 맞출 범위 줄. 쓰는 동안 칸 자리에 게이트 진행 세 줄
// (서버는 한 번에 돌아오므로 ①만 "지금"), 쓴 뒤 줄에 서버가 실제로 거친 단계(첫 글 · 빠진 메모 넣기 · 분량 맞추기)를 보여 준다.
const noSub = () => () => {};
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
  levelBox,
  levelValue,
  keywordPane,
  defaultMode,
  what = "글",
  gateScope = "기록",
  onBusy,
}: {
  initialMemo?: string;
  placeholder: string;
  unit: LengthUnit;
  bodyEmpty: boolean;
  /** ① 활동 메모의 활동명 (N27, 메모 한 번에 · 키워드로에서 필수) */
  activity: string;
  /** "바꾸기"·"적기": ① 활동명 칸으로 */
  onEditActivity: () => void;
  generate: (memo: string, activity: string, max: number) => Promise<AiDraftResult>;
  /** 활동 메모로: ①에서 불러온 메모(null = 불러오는 중) · 지금 글 · NEIS 최대 · 쓰기 */
  merge: { pieces: MergePiece[] | null; body: string; neisMax: number; run: (pieces: MergePiece[], max: number, tol: number, opts?: MergeOpts) => Promise<AiDraftResult> };
  /** 오차를 기억할 영역 이름 (N49, 예: "세특" · "동아리") */
  gateScope?: string;
  /** AI가 쓰는 중인지 (N49: 쓰는 동안 아래 이동 줄을 흐리게) */
  onBusy?: (busy: boolean) => void;
  onApply: (text: string, result?: AiDraftResult) => void;
  done?: boolean;
  /** 성취수준 칸 (N35 ③, 세특): 목표 옆 */
  levelBox?: ReactNode;
  /** 고른 성취수준 글자 (N41: 버튼에 보임, 없으면 "안 고름") */
  levelValue?: string | null;
  /** 키워드로를 대신하는 칸 (N35 ④ 행발 키워드 메뉴판 — 목표·결과를 스스로 그린다) */
  keywordPane?: ReactNode;
  /** 메모가 없을 때 처음 고를 방법 (행발은 키워드로) */
  defaultMode?: Mode;
  /** ③ 글 이름 (예: "세특 글") */
  what?: string;
}) {
  const [memo, setMemo] = useState(initialMemo);
  const [blocks, setBlocks] = useState<KeywordBlock[]>(() => parseKeywordMemo(initialMemo) ?? [{ ...EMPTY }]);
  const [picked, setPicked] = useState<Mode | null>(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const pieceCount = merge.pieces?.length ?? 0;
  // 기본은 활동 메모로. 메모가 하나도 없을 때만 예전 메모·키워드(또는 행발 키워드 메뉴판)를 먼저 연다
  const fallback: Mode | null = defaultMode ?? (parseKeywordMemo(initialMemo) ? "keywords" : initialMemo.trim() ? "memo" : null);
  const mode: Mode = picked ?? (merge.pieces !== null && pieceCount === 0 && fallback ? fallback : "merge");
  const [target, setTarget] = useState(merge.neisMax);
  const max = Math.min(merge.neisMax, Math.max(1, target || merge.neisMax));
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  // N49 오차: 이 기기에 영역별로 기억 (서버 그림에서는 기본값)
  const key = tolKey(gateScope, unit);
  const storedTol = useSyncExternalStore(noSub, () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  const [ownTol, setOwnTol] = useState<number | null>(null);
  const tol = ownTol ?? parseTol(storedTol, unit);
  const pickTol = (t: number) => {
    setOwnTol(t);
    try { localStorage.setItem(key, String(t)); } catch { /* 기억 못 해도 이번에는 쓴다 */ }
  };
  const band = gateBand({ unit, target: max, tol, limit: merge.neisMax });
  const bandLabel = bandText(band, unit);

  // 쓰기에서 뺀 메모 (새로 남긴 메모는 저절로 들어간다)
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // 메모 중요도 (Figma N20): 이 기기에만 기억해 둔다 (다음에 열어도 그대로)
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
    } catch { /* 기억 못 해도 이번 쓰기에는 쓴다 */ }
  };
  // 지금 글도 하나 (맨 위) — 고친 것을 잃지 않게
  const bodyPiece: MergePiece[] = merge.body.trim() ? [{ id: "body", source: "본문", date: null, text: merge.body.trim() }] : [];
  // 순서 (N41): 교사가 위/아래로 바꾼 순서. 처음은 지금 글 → 날짜 순
  const [order, setOrder] = useState<string[]>([]);
  const base = [...bodyPiece, ...orderPieces(merge.pieces ?? [])].map((p) => ({ ...p, weight: weightOf(p.id) }));
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length + base.findIndex((x) => x.id === id) : i; };
  const allPieces = [...base].sort((a, b) => rank(a.id) - rank(b.id));
  const move = (id: string, dir: -1 | 1) => {
    const ids = allPieces.map((p) => p.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  // 지금 글에 더하기 (Figma N49b): 지금 글은 한 글자도 안 바꾸고, 고른 메모로 남은 분량만 이어 쓴다
  const [appendOn, setAppendOn] = useState(false);
  const canAppend = bodyPiece.length > 0;
  const appending = appendOn && canAppend && mode === "merge";
  const kept = canAppend ? measure(bodyPiece[0].text, unit) : 0;
  const room = appending ? appendBand(band, kept) : null;
  const listPieces = appending ? allPieces.filter((p) => p.id !== "body") : allPieces;
  const selected = new Set(allPieces.filter((p) => !excluded.has(p.id)).map((p) => p.id));
  const setSelected = (s: Set<string>) => setExcluded(new Set(allPieces.filter((p) => !s.has(p.id)).map((p) => p.id)));
  const memoPicked = (merge.pieces ?? []).filter((p) => selected.has(p.id)).length;

  const input = mode === "keywords" ? composeKeywordMemo(blocks) : memo;
  const setBlock = (i: number, k: keyof KeywordBlock, v: string) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  // 쓴 뒤: ③에 넣은 글 · 그 전 글(되돌리기) · 쓴 메모 수
  const [wrote, setWrote] = useState<{ text: string; prev: string; count: number; mode: Mode; notice?: string; sample?: boolean; trace?: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const req = useRef(0);
  // 그만 쓰기: 요청은 버리고(돌아와도 글은 그대로) 칸을 바로 되돌린다
  const [stopped, setStopped] = useState(false);
  const busy = pending && !stopped;
  const [running, setRunning] = useState<{ mode: Mode; count: number }>({ mode: "merge", count: 0 });
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  const stop = () => { req.current++; setStopped(true); setError(""); };
  const name = cleanActivity(activity);

  function run() {
    const id = ++req.current;
    setError("");
    const m = mode;
    const prev = merge.body;
    setStopped(false);
    setRunning({ mode: m, count: m === "merge" ? allPieces.filter((x) => selected.has(x.id) && x.id !== "body").length : 0 });
    start(async () => {
      let r: AiDraftResult;
      let count = 0;
      try {
        if (m === "merge") {
          const memos = allPieces.filter((x) => selected.has(x.id) && x.id !== "body");
          const chosen = appending ? [...bodyPiece, ...memos] : allPieces.filter((x) => selected.has(x.id));
          count = memos.length;
          r = (appending ? memos.length : chosen.length) ? await merge.run(chosen, max, tol, appending ? { append: true } : undefined) : { ok: false, error: "쓸 메모를 골라 주세요" };
        } else {
          r = await generate(input, activity, max);
        }
      } catch {
        r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 직접 써 주세요" };
      }
      if (id !== req.current) return; // 취소됨
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onApply(r.text, r);
      setWrote({ text: r.text, prev, count, mode: m, notice: r.notice, sample: r.sample, trace: traceLine(r.gate, unit) || undefined });
    });
  }

  const undo = () => { if (!wrote) return; onApply(wrote.prev); setWrote(null); };
  // ③을 손으로 고치면 되돌리기는 숨긴다 (고친 것을 덮지 않게)
  const canUndo = !!wrote && merge.body === wrote.text;

  const meta = wrote ? (wrote.mode === "merge" ? `메모 ${wrote.count}개로 썼어요` : "썼어요") : `고른 메모를 모아 ${what}을 써요`;
  const activityChip = (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-chip border border-line bg-[#fff] px-2.5 py-[5px]">
      <span className="shrink-0 text-[12px] text-mute">활동명</span>
      {name ? (
        <>
          <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
          <button type="button" onClick={onEditActivity} className="shrink-0 whitespace-nowrap text-[12px] font-medium text-key-strong">바꾸기</button>
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-[13px] text-[#9A6400]">①에서 먼저 적어 주세요</span>
          <button type="button" onClick={onEditActivity} className="shrink-0 whitespace-nowrap text-[12px] font-medium text-key-strong">적기</button>
        </>
      )}
    </span>
  );
  const custom = mode === "keywords" && !!keywordPane;
  const canRun = mode === "merge" ? (appending ? !!room && memoPicked > 0 : selected.size > 0) && merge.pieces !== null && pieceCount > 0 : !!name && !!input.trim();
  const choose = (m: Mode) => { setPicked(m); setError(""); };

  // 첫 줄: 다른 방법일 때만 (메모 모아 쓰기는 칸 안에 제목이 있다)
  const head = mode !== "merge" ? (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => choose("merge")} className="flex items-center gap-1 text-[13px] font-medium text-key-strong">
        <ArrowLeft size={14} /> 메모 모아 쓰기로
      </button>
      <span className="ml-auto text-[13px] font-bold">{mode === "memo" ? "메모 한 번에 적기" : "키워드로"}</span>
    </div>
  ) : null;
  const collect = merge.pieces === null ? (
    <p className="text-[14px] text-mute" role="status">메모를 불러오는 중이에요</p>
  ) : allPieces.length === 0 ? (
    <div className="flex flex-col gap-3">
      <span className="text-[15px] font-bold">메모 모아 쓰기</span>
      <div className="flex flex-col items-center gap-1 rounded-control border border-dashed border-hair bg-[#fff] px-4 py-4 text-center break-keep">
        <Layers size={18} className="text-key" aria-hidden />
        <span className="text-[14px] font-bold">모을 활동 메모가 아직 없어요</span>
        <span className="text-[13px] text-mute">①에서 본 일을 한 줄씩 남기면 여기에 모여요</span>
      </div>
    </div>
  ) : (
    <MemoCollect pieces={listPieces} selected={selected} setSelected={setSelected} onWeight={setWeight} onMove={move} unit={unit}
      target={appending ? (room?.target ?? 0) : max} append={appending}
      top={canAppend ? (
        <>
          <div role="radiogroup" aria-label="쓰는 방법" className="grid w-full grid-cols-2 gap-0 rounded-control border border-line bg-[#fff] p-[3px] md:w-[360px]">
            {([false, true] as const).map((on) => (
              <button key={String(on)} type="button" role="radio" aria-checked={appendOn === on} onClick={() => setAppendOn(on)}
                className={cx("h-8 whitespace-nowrap rounded-[6px] text-[13px]", appendOn === on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>
                {on ? "지금 글에 더하기" : "새로 쓰기"}
              </button>
            ))}
          </div>
          {appending && (
            <div className="flex flex-col gap-1 rounded-control border border-line bg-soft px-3.5 py-3">
              <span className="flex items-center gap-1.5">
                <Lock size={14} className="shrink-0 text-sub" aria-hidden />
                <span className="min-w-0 flex-1 text-[13px] font-bold">지금 글 · 그대로 둬요</span>
                <span className="shrink-0 text-[12px] tabular-nums text-mute">{kept.toLocaleString()}{u}</span>
              </span>
              <span className="line-clamp-2 text-[13px] text-sub break-keep">{bodyPiece[0].text}</span>
            </div>
          )}
        </>
      ) : undefined} />
  );

  const others = (
    <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-[12px] text-sub md:justify-start">
      <span className="text-mute">다른 방법</span>
      <span aria-hidden className="text-faint">·</span>
      <button type="button" onClick={() => choose("memo")} className={cx("font-medium hover:text-ink", mode === "memo" && "text-key-strong")}>메모 한 번에 적기</button>
      <span aria-hidden className="text-faint">·</span>
      <button type="button" onClick={() => choose("keywords")} className={cx("font-medium hover:text-ink", mode === "keywords" && "text-key-strong")}>키워드로</button>
    </span>
  );

  return (
    <section aria-label="AI로 쓰기" className="flex flex-col gap-3">
      <StepHead n={2} title="AI로 쓰기" meta={meta} done={done} />

      {wrote && !busy && (
        <div className="flex flex-col gap-2.5 rounded-inner bg-ok-soft px-3.5 py-3">
          <div className="flex min-w-0 flex-col break-keep">
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#00A05D]">
              <Check size={15} strokeWidth={3} className="shrink-0" /> AI가 ③ {what}에 썼어요
              {wrote.sample && <Tag tone="bg-[#fff] text-mute">예시</Tag>}
            </span>
            <span className="text-[12px] text-sub break-keep">
              {wrote.mode === "merge" ? `메모 ${wrote.count}개 · ` : ""}{measure(wrote.text, unit).toLocaleString()}{u}
              {canUndo ? " · 지난 글은 되돌리기로 살릴 수 있어요" : ""}
              {wrote.notice ? ` · ${wrote.notice.replace(/조각을/g, "메모를").replace(/조각/g, "메모")}` : ""}
            </span>
            {wrote.trace && <span className="text-[12px] font-medium tabular-nums text-sub break-keep">{wrote.trace}</span>}
          </div>
          <div className="flex items-center gap-1.5 [&>button]:h-10 md:[&>button]:h-[34px]">
            {canUndo && <Button type="button" kind="outline" size="sm" onClick={undo} className="max-md:flex-1"><Undo2 size={13} /> 되돌리기</Button>}
            <Button type="button" kind="outline" size="sm" onClick={run} disabled={!canRun} className="max-md:flex-1"><RotateCcw size={13} /> 다시 쓰기</Button>
            <SaveBookmark text={wrote.text} source="draft" />
            <button type="button" aria-label="쓴 뒤 줄 닫기" onClick={() => setWrote(null)} className="flex size-8 shrink-0 items-center justify-center text-mute"><X size={14} /></button>
          </div>
        </div>
      )}

      {busy && running.mode === "merge" && (
        <GateProgress title="AI가 쓰는 중" onStop={stop} line={`고른 메모 ${running.count}개 · ${bandLabel} 안에 맞춰요`}
          steps={[
            { name: "① 메모 모아 쓰기", value: "쓰는 중", state: "current" },
            { name: "② 빠진 메모 넣기", value: `메모 ${running.count}개`, state: "todo" },
            { name: "③ 분량 맞추기", value: bandLabel, state: "todo" },
          ]} />
      )}
      <div className={cx("flex flex-col gap-3 rounded-inner bg-bg px-3.5 py-3.5 md:px-4", ((wrote && !busy) || (busy && running.mode === "merge")) && "hidden")}>
        {head}

        {custom ? keywordPane : mode === "merge" ? collect : mode === "memo" ? (
          <>
            {activityChip}
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={6000}
              placeholder={placeholder}
              aria-label="한 번에 적는 메모"
              className="h-[120px] w-full resize-y rounded-field bg-[#fff] px-3 py-2.5 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-key md:h-24"
            />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {activityChip}
            {blocks.map((b, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-inner border border-line bg-[#fff] p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-sub">활동 {i + 1}</span>
                  <span className="flex-1" />
                  {blocks.length > 1 && (
                    <button type="button" aria-label={`활동 ${i + 1} 빼기`} onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))} className="text-mute"><X size={14} /></button>
                  )}
                </div>
                <input value={b.topic} onChange={(e) => setBlock(i, "topic", e.target.value)} maxLength={100} placeholder="(주제) 예: 빗면에서 가속도 측정" aria-label={`활동 ${i + 1} 주제`} className={cx(FIELD, "bg-soft")} />
                <textarea value={b.activity} onChange={(e) => setBlock(i, "activity", e.target.value)} rows={2} maxLength={400}
                  placeholder="(활동) 예: 각도를 바꿔 측정, 오차 원인을 마찰로 분류, 반복 측정 제안" aria-label={`활동 ${i + 1} 활동`} className={cx(FIELD, "resize-y bg-soft leading-6")} />
                <input value={b.keywords} onChange={(e) => setBlock(i, "keywords", e.target.value)} maxLength={100} placeholder="(키워드) 예: 실험 설계, 오차 분석, 주도성" aria-label={`활동 ${i + 1} 키워드`} className={cx(FIELD, "bg-soft")} />
              </div>
            ))}
            {blocks.length < 3 && (
              <button type="button" onClick={() => setBlocks((bs) => [...bs, { ...EMPTY }])} className="flex items-center gap-1 self-start text-[13px] font-medium text-key-strong">
                <Plus size={14} /> 활동 추가
              </button>
            )}
          </div>
        )}

        {!custom && (
          <>
            {/* 목표 · 성취수준: 흰 작은 칸 (Figma N40) */}
            <div className="flex flex-wrap items-center gap-2">
              <TargetPicker unit={unit} target={max} limit={merge.neisMax} onChange={setTarget} />
              {mode === "merge" && <TolPicker unit={unit} target={max} tol={tol} limit={merge.neisMax} onChange={pickTol} />}
              {levelBox && (
                <button type="button" onClick={() => setLevelOpen(!levelOpen)} aria-expanded={levelOpen}
                  className="flex h-9 items-center gap-1 rounded-field border border-line bg-[#fff] px-2.5 text-[13px] font-bold text-ink">
                  <span className="text-[12px] font-normal text-mute">성취수준</span> {levelValue ?? "안 고름"}<ChevronDown size={14} className={cx("text-mute", levelOpen && "rotate-180")} />
                </button>
              )}
              {levelBox && !levelValue ? (
                <span className="text-[12px] font-medium text-key-strong break-keep">안 고르면 사실 그대로 써요</span>
              ) : (
                <span className="whitespace-nowrap text-[12px] text-mute">최대 {merge.neisMax.toLocaleString()}{u}</span>
              )}
            </div>
            {levelOpen && levelBox}
            {appending && !room && (
              <p className="rounded-control bg-[#FFF1EA] px-3 py-2 text-[12px] font-bold text-[#E8622C] break-keep" role="status">
                지금 글이 이미 {kept.toLocaleString()}{u}예요 · 더할 자리가 없어요
              </p>
            )}
            {appending && room && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-sub break-keep">
                <span>지금 글 <b className="tabular-nums text-ink">{kept.toLocaleString()}{u}</b> 그대로 + 고른 메모로 약 <b className="tabular-nums text-ink">{room.target.toLocaleString()}{u}</b> 더 써요</span>
                <span className="inline-flex h-6 items-center whitespace-nowrap rounded-chip bg-key-soft px-2 font-bold tabular-nums text-key-strong">→ {bandLabel}</span>
              </p>
            )}
            {mode === "merge" && !appending && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex h-6 items-center whitespace-nowrap rounded-chip bg-key-soft px-2 text-[12px] font-bold tabular-nums text-key-strong">{bandLabel} 안에 맞춰요</span>
                <span className="text-[12px] font-medium text-sub break-keep">넘치면 메모를 빼지 않고 줄여 담아요</span>
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:gap-3">
              <div className="md:min-w-0 md:flex-1">{others}</div>
              {busy ? (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 flex-1 overflow-hidden rounded-full bg-line md:flex-none" aria-hidden>
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-key" />
                  </div>
                  <span className="whitespace-nowrap text-[13px] text-sub" role="status">쓰는 중이에요</span>
                  <Button type="button" kind="ghost" size="sm" onClick={stop}>취소</Button>
                </div>
              ) : (
                <Button type="button" onClick={run} disabled={!canRun}
                  className="h-12 w-full text-[15px] disabled:bg-line disabled:text-mute md:h-10 md:w-auto md:px-4 md:text-[14px]">
                  <Sparkles size={15} /> {mode === "merge" ? (memoPicked ? `고른 메모 ${memoPicked}개로 ${appending ? "이어 쓰기" : "글 쓰기"}` : `고른 메모로 ${appending ? "이어 쓰기" : "글 쓰기"}`) : "AI로 글 쓰기"}
                </Button>
              )}
            </div>
          </>
        )}
        {custom && <div className="border-t border-line pt-2.5">{others}</div>}
        {error && !custom && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        {!custom && !bodyEmpty && !busy && <p className="-mt-1 text-[12px] text-mute break-keep">쓰면 ③ 글이 바뀌어요 · 지난 글은 되돌리기로 살릴 수 있어요</p>}
      </div>
    </section>
  );
}
