"use client";
import { useActionState, useState } from "react";
import { LengthPicker } from "@/components/length-picker";
import { Button } from "@/components/ui";
import { AiDraftPanel } from "@/components/writing/ai-draft-panel";
import { RecordChecks, type Who } from "@/components/writing/record-checks";
import { checkLength, MIN_RATIO, NEIS_MAX_BYTES, neisMax, resolveLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { BodyCard } from "@/components/writing/competency-view";
import { aiSetukDraft, fitSetuk, listSetukPieces, mergeSetuk, readSetukFile, saveSetuk, tagSetuk, type SetukState } from "./actions";
import { OverApproval } from "@/components/writing/over-approval";

// 세특 쓰기: AI 초안(관찰 메모) + 본문 + 자동 검사·분량(단위·최대) + 임시 저장 / 확정.
// AI 초안은 본문에 채우기만 하고 저장은 교사가 누른다.
export function SetukEditor({
  courseId,
  studentId,
  initial,
  unit: initialUnit,
  max: initialMax,
  confirmed,
  who,
  memo,
  shared,
}: {
  who: Who;
  memo: string;
  courseId: string;
  studentId: string;
  initial: string;
  unit: LengthUnit;
  max: number;
  confirmed: boolean;
  /** 공통과목 1·2 합산: 다른 학기에 쓴 바이트 */
  shared?: { other: 1 | 2; bytes: number };
}) {
  const [state, action, pending] = useActionState<SetukState, FormData>(saveSetuk, {});
  const [text, setText] = useState(initial);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const full = resolveLength("세특", len);
  // 공통과목은 다른 학기에 쓴 만큼 이 학기 최대가 줄어든다 (2026 기재요령 208쪽)
  const cap = shared ? Math.max(0, NEIS_MAX_BYTES["세특"] - shared.bytes) : null;
  const capMax = cap == null ? full.max : Math.min(full.max, full.unit === "bytes" ? cap : Math.floor(cap / 3));
  const range = { ...full, max: capMax, min: Math.min(full.min, Math.ceil(capMax * MIN_RATIO)) };
  const length = checkLength(text, range);
  const over = length.reason === "too_long";
  const [allowOver, setAllowOver] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <AiDraftPanel
        initialMemo={memo}
        placeholder="관찰 메모 (예: 빗면 실험 설계 주도, 오차 원인 질문, 산업디자인 진로와 연결)"
        unit={range.unit}
        bodyEmpty={!text.trim()}
        generate={(m) => aiSetukDraft({ courseId, studentId, memo: m, unit: range.unit, max: range.max })}
        readFile={(fd) => { fd.set("courseId", courseId); fd.set("studentId", studentId); return readSetukFile(fd); }}
        merge={{
          load: () => listSetukPieces({ courseId, studentId }),
          body: text,
          neisMax: Math.min(neisMax("세특", range.unit), capMax),
          run: (pieces, max) => mergeSetuk({ courseId, studentId, pieces, unit: range.unit, max }),
        }}
        onApply={setText}
      />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />
        <BodyCard text={text} tag={(t) => tagSetuk({ courseId, studentId, text: t })}>
          <textarea
            name="content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            maxLength={5000}
            placeholder="수업 중 관찰한 활동·탐구·태도를 '~함.'으로 끝나는 문장으로 써 주세요"
            className="w-full resize-y rounded-field bg-white p-4 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-key"
            aria-label="세특 내용"
          />
        </BodyCard>
        {shared && (
          <p className="rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] text-key-strong">
            공통과목은 1·2학기 합산 500자 · {shared.other}학기 {shared.bytes.toLocaleString()}바이트 → 이 학기 최대 {capMax.toLocaleString()}{UNIT_LABEL[range.unit]}
          </p>
        )}
        <RecordChecks text={text} range={range} who={who} fit={{ run: () => fitSetuk({ courseId, studentId, text, unit: range.unit, max: range.max }), onApply: setText }}>
          <LengthPicker category="세특" defaultUnit={initialUnit} defaultMax={initialMax} onChange={setLen} />
        </RecordChecks>

        {over && <OverApproval value={length.value} max={range.max} unit={UNIT_LABEL[range.unit]} checked={allowOver} onChange={setAllowOver} />}
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && (
          <p className="text-sm text-ok" role="status">
            {state.saved === "confirmed" ? "확정했어요" : "임시 저장했어요"} · 새 버전으로 남았어요
          </p>
        )}
        <div className="flex gap-2">
          <Button kind="outline" name="intent" value="draft" disabled={pending} className="flex-1">
            임시 저장
          </Button>
          <Button name="intent" value="confirmed" disabled={pending || (over && !allowOver) || !text.trim()} className="flex-1">
            {confirmed ? "다시 확정" : "확정"}
          </Button>
        </div>
      </form>
    </div>
  );
}
