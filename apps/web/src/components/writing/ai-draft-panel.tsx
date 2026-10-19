"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Plus, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { MergeList } from "./merge-list";
import type { Importance, MergePiece } from "@/lib/domain/merge";
import { cleanActivity } from "@/lib/domain/activity-name";
import { composeKeywordMemo, parseKeywordMemo, type AiDraftResult, type KeywordBlock } from "@/lib/domain/writing";
import { StepHead } from "./step-head";
import { SaveBookmark } from "./library-save";

const EMPTY: KeywordBlock = { topic: "", activity: "", keywords: "" };
const FIELD = "w-full rounded-field bg-[#fff] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-key";
type Mode = "merge" | "memo" | "keywords";

// ② AI로 쓰기 (Figma N40 484:700): 버튼 하나 "AI로 글 쓰기" — 고른 활동 메모 전부(코드 이름 조각 · 합치기) + 목표 + 성취수준.
// 결과는 ③ 글에 바로 들어가고(지난 글은 "되돌리기") 쓴 뒤 줄이 남는다. 따로 "본문에 넣기"를 누르지 않는다.
// 메모 고르기(N20 중요도)와 다른 방법(메모 한 번에 적기 = 옛 메모로 · 키워드로)은 접어 둔다.
// 활동명은 ① 칸 하나를 같이 쓴다 — 다른 방법에서만 칩으로 보여 주고 "바꾸기"는 ① 칸으로 보낸다.
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
  keywordPane,
  defaultMode,
  what = "글",
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
  merge: { pieces: MergePiece[] | null; body: string; neisMax: number; run: (pieces: MergePiece[], max: number) => Promise<AiDraftResult> };
  onApply: (text: string, result?: AiDraftResult) => void;
  done?: boolean;
  /** 성취수준 칸 (N35 ③, 세특): 목표 옆 */
  levelBox?: ReactNode;
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
  const [picking, setPicking] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const pieceCount = merge.pieces?.length ?? 0;
  // 기본은 활동 메모로. 메모가 하나도 없을 때만 예전 메모·키워드(또는 행발 키워드 메뉴판)를 먼저 연다
  const fallback: Mode | null = defaultMode ?? (parseKeywordMemo(initialMemo) ? "keywords" : initialMemo.trim() ? "memo" : null);
  const mode: Mode = picked ?? (merge.pieces !== null && pieceCount === 0 && fallback ? fallback : "merge");
  const [target, setTarget] = useState(merge.neisMax);
  const max = Math.min(merge.neisMax, Math.max(1, target || merge.neisMax));
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];

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
  const allPieces = [...bodyPiece, ...(merge.pieces ?? [])].map((p) => ({ ...p, weight: weightOf(p.id) }));
  const selected = new Set(allPieces.filter((p) => !excluded.has(p.id)).map((p) => p.id));
  const setSelected = (s: Set<string>) => setExcluded(new Set(allPieces.filter((p) => !s.has(p.id)).map((p) => p.id)));
  const memoPicked = (merge.pieces ?? []).filter((p) => selected.has(p.id)).length;

  const input = mode === "keywords" ? composeKeywordMemo(blocks) : memo;
  const setBlock = (i: number, k: keyof KeywordBlock, v: string) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  // 쓴 뒤: ③에 넣은 글 · 그 전 글(되돌리기) · 쓴 메모 수
  const [wrote, setWrote] = useState<{ text: string; prev: string; count: number; mode: Mode; notice?: string; sample?: boolean } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const req = useRef(0);
  const name = cleanActivity(activity);

  function run() {
    const id = ++req.current;
    setError("");
    const m = mode;
    const prev = merge.body;
    start(async () => {
      let r: AiDraftResult;
      let count = 0;
      try {
        if (m === "merge") {
          const chosen = allPieces.filter((x) => selected.has(x.id));
          count = chosen.filter((x) => x.id !== "body").length;
          r = chosen.length ? await merge.run(chosen, max) : { ok: false, error: "쓸 메모를 골라 주세요" };
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
      setWrote({ text: r.text, prev, count, mode: m, notice: r.notice, sample: r.sample });
      setPicking(false);
    });
  }

  const undo = () => { if (!wrote) return; onApply(wrote.prev); setWrote(null); };
  // ③을 손으로 고치면 되돌리기는 숨긴다 (고친 것을 덮지 않게)
  const canUndo = !!wrote && merge.body === wrote.text;

  const meta = wrote ? (wrote.mode === "merge" ? `메모 ${wrote.count}개로 썼어요` : "썼어요") : `메모로 ${what}을 써요`;
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
  const canRun = mode === "merge" ? selected.size > 0 && merge.pieces !== null && pieceCount > 0 : !!name && !!input.trim();
  const choose = (m: Mode) => { setPicked(m); setError(""); };

  // 첫 줄: 무엇으로 쓰는지
  const head = mode !== "merge" ? (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => choose("merge")} className="flex items-center gap-1 text-[13px] font-medium text-key-strong">
        <ArrowLeft size={14} /> 활동 메모로 쓰기
      </button>
      <span className="ml-auto text-[13px] font-bold">{mode === "memo" ? "메모 한 번에 적기" : "키워드로"}</span>
    </div>
  ) : merge.pieces === null ? (
    <p className="text-[14px] text-mute" role="status">메모를 불러오는 중이에요</p>
  ) : pieceCount === 0 ? (
    <p className="text-[14px] font-medium text-[#9A6400] break-keep">활동 메모를 하나 남기면 쓸 수 있어요</p>
  ) : (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 text-[14px] font-bold break-keep">
        활동 메모 {memoPicked === pieceCount ? <span className="text-key-strong">{pieceCount}개</span> : <><span className="text-key-strong">{memoPicked}개</span> / {pieceCount}개</>}로 써요
      </p>
      <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking}
        className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[13px] font-medium text-key-strong">
        {picking ? "접기" : "고르기"}<ChevronDown size={14} className={picking ? "rotate-180" : ""} />
      </button>
    </div>
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

      {wrote && !pending && (
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
          </div>
          <div className="flex items-center gap-1.5 [&>button]:h-10 md:[&>button]:h-[34px]">
            {canUndo && <Button type="button" kind="outline" size="sm" onClick={undo} className="max-md:flex-1"><Undo2 size={13} /> 되돌리기</Button>}
            <Button type="button" kind="outline" size="sm" onClick={run} disabled={!canRun} className="max-md:flex-1"><RotateCcw size={13} /> 다시 쓰기</Button>
            <SaveBookmark text={wrote.text} source="draft" />
            <button type="button" aria-label="쓴 뒤 줄 닫기" onClick={() => setWrote(null)} className="flex size-8 shrink-0 items-center justify-center text-mute"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className={cx("flex flex-col gap-3 rounded-inner bg-bg px-3.5 py-3.5 md:px-4", wrote && !pending && "hidden")}>
        {head}

        {custom ? keywordPane : mode === "merge" ? (
          picking && merge.pieces !== null && (
            <div className="rounded-field bg-[#fff] px-3 pb-1 pt-3">
              <MergeList pieces={allPieces} onWeight={setWeight} selected={selected} setSelected={setSelected} unit={unit} target={max} />
            </div>
          )
        ) : mode === "memo" ? (
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
              <label className="flex h-9 items-center gap-1.5 rounded-field border border-line bg-[#fff] px-2.5 focus-within:ring-2 focus-within:ring-key">
                <span className="shrink-0 text-[12px] text-mute">목표</span>
                <input inputMode="numeric" value={target ? target.toLocaleString() : ""} aria-label="목표 분량"
                  onChange={(e) => setTarget(Math.min(merge.neisMax, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
                  className="w-14 min-w-0 bg-transparent text-right text-[13px] font-bold tabular-nums outline-none" />
                <span className="shrink-0 text-[13px] font-bold">{u}</span>
              </label>
              {levelBox && (
                <button type="button" onClick={() => setLevelOpen(!levelOpen)} aria-expanded={levelOpen}
                  className="flex h-9 items-center gap-1 rounded-field border border-line bg-[#fff] px-2.5 text-[13px] font-medium text-ink">
                  <span className="text-[12px] font-normal text-mute">성취수준</span> 고르기<ChevronDown size={14} className={cx("text-mute", levelOpen && "rotate-180")} />
                </button>
              )}
              <span className="whitespace-nowrap text-[12px] text-mute">최대 {merge.neisMax.toLocaleString()}{u}</span>
            </div>
            {levelOpen && levelBox}
            <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:gap-3">
              <div className="md:min-w-0 md:flex-1">{others}</div>
              {pending ? (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 flex-1 overflow-hidden rounded-full bg-line md:flex-none" aria-hidden>
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-key" />
                  </div>
                  <span className="whitespace-nowrap text-[13px] text-sub" role="status">쓰는 중이에요</span>
                  <Button type="button" kind="ghost" size="sm" onClick={() => { req.current++; setError(""); }}>취소</Button>
                </div>
              ) : (
                <Button type="button" onClick={run} disabled={!canRun}
                  className="h-12 w-full text-[15px] disabled:bg-line disabled:text-mute md:h-10 md:w-auto md:px-4 md:text-[14px]">
                  <Sparkles size={15} /> AI로 글 쓰기
                </Button>
              )}
            </div>
          </>
        )}
        {custom && <div className="border-t border-line pt-2.5">{others}</div>}
        {error && !custom && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        {!custom && !bodyEmpty && !pending && <p className="-mt-1 text-[12px] text-mute break-keep">쓰면 ③ 글이 바뀌어요 · 지난 글은 되돌리기로 살릴 수 있어요</p>}
      </div>
    </section>
  );
}
