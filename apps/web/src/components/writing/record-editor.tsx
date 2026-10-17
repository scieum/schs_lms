"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { checkLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { recordMax, resolveRecordLength, type RecordArea } from "@/lib/domain/writing";
import { BodyCard } from "./competency-view";
import { aiRecordDraft, fitRecordAction, listRecordPieces, mergeRecordAction, readRecordFile, saveRecord, tagRecord, type RecordState } from "@/app/(app)/teacher/write/actions";
import { AiDraftPanel } from "./ai-draft-panel";
import { RecordChecks, type Who } from "./record-checks";
import { RecordLengthPicker } from "./record-length-picker";
import { OverApproval } from "@/components/writing/over-approval";

const MEMO_HINT: Record<RecordArea, string> = {
  "자율·자치": "관찰 메모 (예: 학급회의 사회, 체육대회 준비 위원, 규칙 제안)",
  동아리: "관찰 메모 (예: 실험 설계 주도, 결과 발표, 후배 지도)",
  진로: "관찰 메모 (예: 학과 탐방 보고서, 직업 인터뷰, 관심 분야 변화)",
  행발: "관찰 키워드 (예: 책임감, 친구 의견 경청, 2학기 자신감 늘어남)",
};

// 특기사항·행발 쓰기: AI 초안 → 본문 수정 → 자동 검사·분량 → 임시 저장 / 확정 (새 버전)
export function RecordEditor({
  area,
  studentId,
  clubId,
  who,
  initial,
  memo,
  unit: initialUnit,
  max: initialMax,
  confirmed,
}: {
  area: RecordArea;
  studentId: string;
  clubId?: string;
  who: Who;
  initial: string;
  memo: string;
  unit: LengthUnit;
  max: number;
  confirmed: boolean;
}) {
  const [state, action, pending] = useActionState<RecordState, FormData>(saveRecord, {});
  const [text, setText] = useState(initial);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const range = resolveRecordLength(area, len);
  const length = checkLength(text, range);
  const over = length.reason === "too_long";
  const [allowOver, setAllowOver] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <AiDraftPanel
        initialMemo={memo}
        placeholder={MEMO_HINT[area]}
        unit={range.unit}
        bodyEmpty={!text.trim()}
        generate={(m) => aiRecordDraft({ area, studentId, clubId, memo: m, unit: range.unit, max: range.max })}
        readFile={(fd) => { fd.set("area", area); fd.set("studentId", studentId); if (clubId) fd.set("clubId", clubId); return readRecordFile(fd); }}
        merge={{
          load: () => listRecordPieces({ area, studentId, clubId }),
          body: text,
          neisMax: recordMax(area, range.unit),
          run: (pieces, max) => mergeRecordAction({ area, studentId, clubId, pieces, unit: range.unit, max }),
        }}
        onApply={setText}
      />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="studentId" value={studentId} />
        {clubId && <input type="hidden" name="clubId" value={clubId} />}
        <BodyCard text={text} tag={(t) => tagRecord({ area, studentId, clubId, text: t })}>
          <textarea
            name="content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            maxLength={5000}
            placeholder="AI 초안을 넣거나 직접 써 주세요. 문장은 '~함.'으로 끝내요"
            className="w-full resize-y rounded-field bg-white p-4 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-key"
            aria-label="기록 내용"
          />
        </BodyCard>
        <RecordChecks text={text} range={range} who={who} fit={{ run: () => fitRecordAction({ area, studentId, clubId, text, unit: range.unit, max: range.max }), onApply: setText }}>
          <RecordLengthPicker area={area} defaultUnit={initialUnit} defaultMax={initialMax} onChange={setLen} />
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
        <p className="text-[12px] text-mute">확정한 기록만 나이스로 내보내요</p>
      </form>
    </div>
  );
}
