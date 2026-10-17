"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Combine, Copy, Plus, RotateCcw, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { EvidenceResult } from "@/lib/server/ai/read-evidence";
import { EvidenceFiles, evidenceMemo, type EvidenceItem } from "./evidence-files";
import { MergeList } from "./merge-list";
import type { MergePiece } from "@/lib/domain/merge";
import { composeKeywordMemo, parseKeywordMemo, type AiDraftResult, type KeywordBlock } from "@/lib/domain/writing";

const EMPTY: KeywordBlock = { topic: "", activity: "", keywords: "" };
const FIELD = "w-full rounded-field bg-soft px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-key";

// "AI 초안" 패널 (Figma 영랑이 Y2 초안 카드와 같은 모양): 관찰 메모 → AI 초안 → 복사 / 다시 쓰기 / 본문에 넣기.
// "자료로" 탭 (Figma N10): 학생 자료 파일을 AI가 읽어 (주제)(활동)(키워드) 근거로 만들고, 한 줄 메모와 함께 초안에 쓴다.
// "합치기" 탭 (Figma N11 224:2564): 학기 동안 따로 쌓인 조각(누가기록·메모·본문·특색 활동)을 골라 한 문단으로 합치고 목표 분량(NEIS 최대)에 맞춘다.
// "키워드로" 탭: 속초고 세특 프롬프트(노션) 입력 형식 (주제)/(활동)/(키워드) 칸에 넣고 쓴다. 활동은 3개까지.
// 결과는 본문(편집기)에 채우기만 하고 저장은 교사가 따로 누른다. 본문이 비어 있으면 바로 채운다.
export function AiDraftPanel({
  initialMemo = "",
  placeholder,
  unit,
  bodyEmpty,
  generate,
  readFile,
  merge,
  onApply,
}: {
  initialMemo?: string;
  placeholder: string;
  unit: LengthUnit;
  bodyEmpty: boolean;
  generate: (memo: string) => Promise<AiDraftResult>;
  /** 자료 파일 하나 읽기 (없으면 '자료로' 탭을 숨긴다) */
  readFile?: (form: FormData) => Promise<EvidenceResult>;
  /** 합치기 (없으면 탭을 숨긴다): 조각 불러오기 · 지금 본문 · NEIS 최대 · 합치기 */
  merge?: { load: () => Promise<MergePiece[]>; body: string; neisMax: number; run: (pieces: MergePiece[], max: number) => Promise<AiDraftResult> };
  onApply: (text: string) => void;
}) {
  const [memo, setMemo] = useState(initialMemo);
  const [blocks, setBlocks] = useState<KeywordBlock[]>(() => parseKeywordMemo(initialMemo) ?? [{ ...EMPTY }]);
  // ?panel=merge 로 들어오면(생기부 조각 화면의 '합치기') 합치기 탭을 열어 둔다
  const startMerge = useSearchParams().get("panel") === "merge" && !!merge;
  const [mode, setMode] = useState<"memo" | "keywords" | "files" | "merge">(() => (startMerge ? "merge" : parseKeywordMemo(initialMemo) ? "keywords" : "memo"));
  const [files, setFiles] = useState<EvidenceItem[]>([]);
  const [extra, setExtra] = useState("");
  const reading = files.some((f) => f.state === "reading");
  const [pieces, setPieces] = useState<MergePiece[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(merge?.neisMax ?? 0);
  const [mergedCount, setMergedCount] = useState(0);
  // 지금 본문도 조각 하나 (맨 위)
  const bodyPiece: MergePiece[] = merge?.body.trim() ? [{ id: "body", source: "본문", date: null, text: merge.body.trim() }] : [];
  const allPieces = [...bodyPiece, ...(pieces ?? [])];
  function openMerge() {
    setMode("merge");
    if (pieces || !merge) return;
    merge.load().then((ps) => { setPieces(ps); setPicked(new Set(["body", ...ps.map((x) => x.id)])); }).catch(() => setPieces([]));
  }  useEffect(() => {
    if (startMerge && !pieces) merge!.load().then((ps) => { setPieces(ps); setPicked(new Set(["body", ...ps.map((x) => x.id)])); }).catch(() => setPieces([]));
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const input = mode === "keywords" ? composeKeywordMemo(blocks) : mode === "files" ? [extra.trim(), evidenceMemo(files)].filter(Boolean).join("\n\n") : memo;
  const setBlock = (i: number, k: keyof KeywordBlock, v: string) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const [result, setResult] = useState<Extract<AiDraftResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const req = useRef(0);

  function run() {
    const id = ++req.current;
    setError("");
    setCopied(false);
    start(async () => {
      let r: AiDraftResult;
      try {
        if (mode === "merge" && merge) {
          const chosen = allPieces.filter((x) => picked.has(x.id));
          setMergedCount(chosen.length);
          r = chosen.length ? await merge.run(chosen, target) : { ok: false, error: "합칠 조각을 골라 주세요" };
        } else {
          r = await generate(input);
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

  return (
    <div className="flex flex-col gap-3 rounded-inner bg-white p-4">
      <div className="flex items-center gap-2">
        <Tag tone="bg-new-soft text-new">AI</Tag>
        <span className="flex-1 text-[15px] font-bold">AI 초안</span>
        <span className="hidden text-[12px] text-mute md:inline">이름·학번은 가린 뒤 AI에 보내요</span>
      </div>
      <div className="flex gap-1" role="tablist" aria-label="입력 방식">
        {([["memo", "메모로"], ["keywords", "키워드로"], ...(readFile ? [["files", "자료로"] as const] : []), ...(merge ? [["merge", "합치기"] as const] : [])] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => (k === "merge" ? openMerge() : setMode(k))}
            className={cx("rounded-chip px-3 py-1.5 text-[13px]", mode === k ? "bg-key-soft font-bold text-key-strong" : "text-sub hover:bg-soft")}>{l}</button>
        ))}
      </div>
      {mode === "merge" && merge ? (
        pieces === null ? (
          <p className="py-6 text-center text-[13px] text-mute" role="status">조각을 모으는 중이에요</p>
        ) : (
          <MergeList pieces={allPieces} selected={picked} setSelected={setPicked} unit={unit} neisMax={merge.neisMax} target={target} setTarget={setTarget} />
        )
      ) : mode === "files" && readFile ? (
        <div className="flex flex-col gap-2">
          <EvidenceFiles items={files} setItems={setFiles} read={readFile} />
          <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500} placeholder="더 넣을 말 (선택)" aria-label="더 넣을 말"
            className="w-full rounded-control bg-[#fff] px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-key" />
        </div>
      ) : mode === "memo" ? (
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          maxLength={6000}
          placeholder={placeholder}
          aria-label="관찰 메모"
          className="w-full resize-y rounded-field bg-soft p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-key"
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
      <div className="flex items-center gap-2">
        {pending ? (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full w-1/3 animate-pulse rounded-full bg-key" />
            </div>
            <span className="text-[13px] text-sub" role="status">쓰는 중이에요</span>
            <Button type="button" kind="ghost" size="sm" onClick={() => { req.current++; setError(""); }}>취소</Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-[12px] text-mute">{mode === "merge" ? "겹치는 내용은 빼고 한 문단으로" : mode === "files" ? (reading ? "자료를 읽고 있어요" : "자료·메모·누가기록으로 써요") : "메모·누가기록만 근거로 써요"}</span>
            {mode === "merge" ? (
              <Button type="button" kind="soft" size="sm" onClick={run} disabled={!picked.size || pieces === null}><Combine size={14} /> 합치기</Button>
            ) : (
              <Button type="button" kind="soft" size="sm" onClick={run} disabled={mode === "files" && (reading || !input)}>{result ? "다시 쓰기" : "AI 초안"}</Button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {result && !pending && (
        <div className="flex flex-col gap-3 rounded-inner border border-line p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">초안</Tag>
            {result.sample && <Tag tone="bg-soft text-mute">예시</Tag>}
            {mode === "merge" && mergedCount > 0 && <Tag tone="bg-soft text-sub">{`조각 ${mergedCount}개`}</Tag>}
            <Tag tone="bg-soft text-sub">{`${measure(result.text, unit).toLocaleString()}${UNIT_LABEL[unit]}`}</Tag>
          </div>
          <p className="text-sm leading-6 whitespace-pre-wrap">{result.text}</p>
          {result.notice && <p className="text-[12px] text-mute">{result.notice}</p>}
          <div className="flex gap-2">
            <Button type="button" kind="outline" size="sm" onClick={copy}><Copy size={13} /> {copied ? "복사됨" : "복사"}</Button>
            <Button type="button" kind="outline" size="sm" onClick={run}><RotateCcw size={13} /> 다시 쓰기</Button>
            <Button type="button" kind="outline" size="sm" className="flex-1" onClick={() => onApply(result.text)}>본문에 넣기</Button>
          </div>
        </div>
      )}
    </div>
  );
}
