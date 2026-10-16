"use client";
import { useRef, useState, useTransition } from "react";
import { Copy, RotateCcw } from "lucide-react";
import { Button, Tag } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { AiDraftResult } from "@/lib/domain/writing";

// "AI 초안" 패널 (Figma 영랑이 Y2 초안 카드와 같은 모양): 관찰 메모 → AI 초안 → 복사 / 다시 쓰기 / 본문에 넣기.
// 결과는 본문(편집기)에 채우기만 하고 저장은 교사가 따로 누른다. 본문이 비어 있으면 바로 채운다.
export function AiDraftPanel({
  initialMemo = "",
  placeholder,
  unit,
  bodyEmpty,
  generate,
  onApply,
}: {
  initialMemo?: string;
  placeholder: string;
  unit: LengthUnit;
  bodyEmpty: boolean;
  generate: (memo: string) => Promise<AiDraftResult>;
  onApply: (text: string) => void;
}) {
  const [memo, setMemo] = useState(initialMemo);
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
        r = await generate(memo);
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
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={placeholder}
        aria-label="관찰 메모"
        className="w-full resize-y rounded-field bg-soft p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-key"
      />
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
            <span className="flex-1 text-[12px] text-mute">메모·누가기록만 근거로 써요</span>
            <Button type="button" kind="soft" size="sm" onClick={run}>{result ? "다시 쓰기" : "AI 초안"}</Button>
          </>
        )}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {result && !pending && (
        <div className="flex flex-col gap-3 rounded-inner border border-line p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">초안</Tag>
            {result.sample && <Tag tone="bg-soft text-mute">예시</Tag>}
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
