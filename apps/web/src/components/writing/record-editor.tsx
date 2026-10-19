"use client";
import { useActionState, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { checkLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { recordMax, resolveRecordLength, type RecordArea } from "@/lib/domain/writing";
import { BodyCard } from "./competency-view";
import { addRecordPiece, aiFixRecordAction, aiRecordDraft, fitRecordAction, listRecordPieces, mergeRecordAction, saveRecord, softenRecordMemo, summarizeRecordFile, tagRecord, variantsRecordAction, type RecordState } from "@/app/(app)/teacher/write/actions";
import { AiDraftPanel } from "./ai-draft-panel";
import { PiecesCard } from "./pieces-card";
import { checkMeta, RecordChecks, useBodyChecks, type Who } from "./record-checks";
import { HighlightTextarea } from "./highlight-textarea";
import { VariantsPanel, VariantsToggle } from "./variants-panel";
import { StepHead, STEP_GAP } from "./step-head";
import { WritingProgress } from "./writing-progress";
import { OverApproval } from "@/components/writing/over-approval";
import { LibraryToggle, useBodyLibrary } from "./library-save";
import { pieceFromLibrary } from "@/app/(app)/teacher/library/actions";
import { libraryAreaOf } from "@/lib/domain/library";

const MEMO_HINT: Record<RecordArea, string> = {
  "자율·자치": "관찰 메모 (예: 학급회의 사회, 체육대회 준비 위원, 규칙 제안)",
  동아리: "관찰 메모 (예: 실험 설계 주도, 결과 발표, 후배 지도)",
  진로: "관찰 메모 (예: 학과 탐방 보고서, 직업 인터뷰, 관심 분야 변화)",
  행발: "관찰 키워드 (예: 책임감, 친구 의견 경청, 2학기 자신감 늘어남)",
};

// 조각 추가 메모 칸 안내
const PIECE_HINT: Record<RecordArea, string> = {
  "자율·자치": "지금 본 것을 짧게 (예: 학급회의에서 규칙 개정안을 냄)",
  동아리: "지금 본 것을 짧게 (예: 변인 통제 방법을 발표함)",
  진로: "지금 본 것을 짧게 (예: 학과 탐방 뒤 관심 분야를 정리함)",
  행발: "지금 본 모습을 짧게 (예: 체육대회 뒷정리를 끝까지 맡음)",
};

// 특기사항·행발 쓰기 (Figma N40, 세특과 같은 3단계): 진행 줄 · ① 활동 메모 → ② AI로 쓰기 → ③ 글 확인 · 확정 (새 버전)
// 자율·자치·동아리·진로의 활동 메모(코드 이름 조각)는 누가기록으로 쌓인다.
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
  aiOn = false,
  openCheck = false,
  keywordPane,
}: {
  /** 반 전체 검사(N35)의 "열기": ③ 자동 검사 첫 걸린 행을 펼친다 */
  openCheck?: boolean;
  /** 행발 키워드 메뉴판 (N35 ④): ② 키워드로 칸을 대신한다. 결과를 본문에 넣는 함수를 받는다 */
  keywordPane?: (ctx: { onApply: (t: string) => void; bodyEmpty: boolean }) => React.ReactNode;
  /** AI 키가 있을 때만 순화하기 (N34 ③) */
  aiOn?: boolean;
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
  const body = useRef<HTMLTextAreaElement>(null);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const range = resolveRecordLength(area, len);
  const length = checkLength(text, range);
  const over = length.reason === "too_long";
  const [allowOver, setAllowOver] = useState(false);
  // ①·②가 같이 쓰는 활동명과 조각
  const [activity, setActivity] = useState("");
  const activityRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<MergePiece[] | null>(null);
  const editActivity = () => { activityRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); activityRef.current?.focus({ preventScroll: true }); };
  const hasBody = !!text.trim();
  // N34: 검사 근거·고칠 말 · 본문 밑줄 · 다른 버전
  const bc = useBodyChecks({ text, setText, range, who, context: undefined, openFirst: openCheck });
  const [piecesKey, setPiecesKey] = useState(0);
  const lib = useBodyLibrary({
    text, body, area: libraryAreaOf(area), onInsert: (next) => bc.replace(next, "넣었어요"),
    addPiece: async (id) => { const r = await pieceFromLibrary({ id, target: { kind: "record", area, studentId, clubId } }); if (!r.error) setPiecesKey((k) => k + 1); return r; },
  });
  const [variants, setVariants] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <WritingProgress memos={pieces?.length ?? null} text={text} unit={range.unit} max={range.max} check={bc.check} />
      <PiecesCard key={`${area}-${clubId ?? ""}-${studentId}-${piecesKey}`} studentId={studentId} placeholder={PIECE_HINT[area]}
        note={area === "행발" ? undefined : "누가기록에도 남아요"} what={`${area} 글`}
        activity={activity} setActivity={setActivity} activityRef={activityRef} onPieces={setPieces} done={!!pieces?.length && hasBody}
        load={() => listRecordPieces({ area, studentId, clubId })}
        add={(t, a, kind) => addRecordPiece({ area, studentId, clubId, text: t, activity: a, kind })}
        soften={aiOn ? (t) => softenRecordMemo({ area, studentId, clubId, text: t }) : undefined} bluntCheck
        summarize={(fd) => { fd.set("area", area); fd.set("studentId", studentId); if (clubId) fd.set("clubId", clubId); return summarizeRecordFile(fd); }} />
      <div className={STEP_GAP}>
        <AiDraftPanel
          initialMemo={memo}
          placeholder={MEMO_HINT[area]}
          unit={range.unit}
          bodyEmpty={!hasBody}
          activity={activity}
          onEditActivity={editActivity}
          generate={(m, a, max) => aiRecordDraft({ area, studentId, clubId, memo: m, activity: a, unit: range.unit, max })}
          merge={{
            pieces,
            body: text,
            neisMax: recordMax(area, range.unit),
            run: (ps, max) => mergeRecordAction({ area, studentId, clubId, pieces: ps, unit: range.unit, max }),
          }}
          onApply={setText}
          what={`${area} 글`}
          done={hasBody}
          keywordPane={keywordPane?.({ onApply: setText, bodyEmpty: !hasBody })}
          defaultMode={keywordPane ? "keywords" : undefined}
        />
      </div>
      <form action={action} className={`flex flex-col gap-3 ${STEP_GAP}`}>
        <StepHead n={3} title="글 확인 · 확정" meta={checkMeta(bc.check).replace("본문", "글")} done={confirmed && hasBody && text === initial} />
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="studentId" value={studentId} />
        {clubId && <input type="hidden" name="clubId" value={clubId} />}
        <BodyCard bare title={`${area} 글`} toggle={hasBody} text={text} tag={(t) => tagRecord({ area, studentId, clubId, text: t })}
          extra={<><LibraryToggle />{hasBody && <VariantsToggle on={variants} onClick={() => setVariants(!variants)} />}</>}>
          <HighlightTextarea
            ref={body}
            name="content"
            value={text}
            onChange={setText}
            marks={bc.marks}
            onPickMark={bc.setOpen}
            focusKey={bc.open}
            maxLength={5000}
            placeholder="AI로 쓰거나 직접 써요. 문장은 '~함.'으로 끝내요"
            boxClassName="rounded-field bg-soft focus-within:ring-2 focus-within:ring-key"
            textClassName="min-h-[120px] px-4 py-3.5 text-[15px] leading-[26px]"
            aria-label="기록 내용"
            selectionTool={lib.selectionTool}
            onSelectionChange={lib.onSelectionChange}
          />
          {lib.mobileSave && <div className="mt-2">{lib.mobileSave}</div>}
        </BodyCard>
        {variants && hasBody && (
          <VariantsPanel unit={range.unit} max={range.max} onClose={() => setVariants(false)}
            run={(mode) => variantsRecordAction({ area, studentId, clubId, text, mode, unit: range.unit, max: range.max })}
            onPick={(t) => { setVariants(false); bc.replace(t, "본문을 바꿨어요"); }} />
        )}
        <RecordChecks text={text} range={range} check={bc.check} recheck={bc.recheck} open={bc.open} onOpen={bc.setOpen} onReplace={bc.onReplace}
          aiFix={{ run: (t) => aiFixRecordAction({ area, studentId, clubId, text: t, unit: range.unit, max: range.max }), onApply: (t) => bc.replace(t, "고친 글을 넣었어요") }}
          length={{ unit: len.unit, max: len.max, limit: recordMax(area, len.unit), onChange: setLen }}
          fit={{ run: () => fitRecordAction({ area, studentId, clubId, text, unit: range.unit, max: range.max }), onApply: setText }} />

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
          <Button name="intent" value="confirmed" disabled={pending || (over && !allowOver) || !hasBody || bc.check.status === "block"} className="flex-1 disabled:bg-key disabled:opacity-40">
            <Check size={16} strokeWidth={2.5} /> {confirmed ? "다시 확정" : "확정"}
          </Button>
        </div>
        <p className="text-[12px] text-mute">확정한 기록만 나이스로 내보내요</p>
      </form>
      {bc.snack}
    </div>
  );
}
