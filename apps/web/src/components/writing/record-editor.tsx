"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { checkLength, measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { recordMax, resolveRecordLength, type RecordArea } from "@/lib/domain/writing";
import { BodyCard } from "./competency-view";
import { addRecordPiece, aiFixRecordAction, aiRecordDraft, fitRecordAction, listRecordPieces, mergeRecordAction, reviseRecordAction, saveRecord, softenRecordMemo, summarizeRecordFile, tagRecord, variantsRecordAction, type RecordState } from "@/app/(app)/teacher/write/actions";
import { useAiGate } from "./use-ai-gate";
import { ReviseBox } from "./revise-box";
import { AiDraftPanel } from "./ai-draft-panel";
import { PiecesCard } from "./pieces-card";
import { checkMeta, RecordChecks, useBodyChecks, type Who } from "./record-checks";
import { HighlightTextarea } from "./highlight-textarea";
import { VariantsPanel, VariantsToggle } from "./variants-panel";
import { StepHead } from "./step-head";
import { ConfirmedLine, PrevButton, StepNav, StepperContext, useWriteStep, writeStepItems, WriteStepper } from "./write-steps";
import { defaultWriteStep } from "@/lib/domain/write-step";
import { OverApproval } from "@/components/writing/over-approval";
import { LibraryToggle, useBodyLibrary } from "./library-save";
import { pieceFromLibrary } from "@/app/(app)/teacher/library/actions";
import { libraryAreaOf } from "@/lib/domain/library";
import type { AiDraftResult } from "@/lib/domain/writing";
import { BodyViewSwitch, useProvenance, type ProvInit } from "./provenance";
import { useGuideMarks, useGuideTarget } from "./guide-store";
import { useLessonMenu } from "./use-lesson-menu";
import type { LessonView } from "@/lib/domain/lesson-plan";

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

// 특기사항·행발 쓰기 (Figma N48 → N40, 세특과 같은 3단계): 단계 표시 · ① 활동 메모 → ② AI로 쓰기 → ③ 글 확인 · 확정 (새 버전) — 지금 단계만 보여 준다.
// 행발(키워드 메뉴판)은 글이 없으면 ②부터.
// 자율·자치·동아리·진로의 활동 메모(코드 이름 조각)는 누가기록으로 쌓인다.
// N49: ③ 글 위 게이트 줄 · 글 아래 "AI에게 고쳐 달라고 하기"(행발은 빠른 요청 "생활 장면 더"). 담임 행발(BehaviorEditor)도 이 편집기.
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
  prov,
  lesson,
  memoHint,
}: {
  /** 서버에서 센 근거 수(누가기록) — 0 보다 크면 처음 단계를 바로 ②로 (없으면 ①에서 메모를 불러온 뒤 정한다) */
  memoHint?: number;
  /** 차시별 활동 메뉴 (Figma N43 (f)): 동아리 · 담임 반 수업 계획 (행발은 없음) */
  lesson?: LessonView;
  /** N38 문장 근거 · AI 원안 (원안이 없으면 근거 · 원안 비교 · 수정 칩이 숨는다) */
  prov?: ProvInit;
  /** 반 전체 검사(N35)의 "열기": ③ 자동 검사 첫 걸린 행을 펼친다 */
  openCheck?: boolean;
  /** 행발 키워드 메뉴판 (N35 ④): ② 키워드로 칸을 대신한다. 결과를 본문에 넣는 함수를 받는다 */
  keywordPane?: (ctx: { onApply: (t: string, r?: AiDraftResult) => void; bodyEmpty: boolean }) => React.ReactNode;
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
  const hasBody = !!text.trim();
  // N48 단계: 처음 단계는 한 번만 정하고, 고른 단계는 주소 줄 · 이 탭에 기억한다
  const memoN = pieces?.length ?? (memoHint ? memoHint : null);
  const ws = useWriteStep(`record:${area}:${clubId ?? ""}`, studentId, defaultWriteStep({ memos: memoN, hasBody: !!initial.trim(), openCheck, keywordFirst: !!keywordPane }));
  const step = ws.step;
  const later = (f: () => void) => setTimeout(f, 40);
  const editActivity = () => { ws.go(1, { scroll: false }); later(() => { activityRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); activityRef.current?.focus({ preventScroll: true }); }); };
  const toBody = () => { ws.go(3, { scroll: false }); later(() => body.current?.scrollIntoView({ block: "center", behavior: "smooth" })); };
  const [editing, setEditing] = useState(false);
  const confirmedNow = confirmed && hasBody && text === initial;
  const reading = confirmedNow && !editing;
  // N34: 검사 근거·고칠 말 · 본문 밑줄 · 다른 버전
  // N38: 문장 근거 · AI 원안 · 맞춤법 (본문 바꾸기는 검사 묶음의 되돌리기 스낵바로)
  const replaceRef = useRef<(next: string, msg: string) => void>(() => {});
  const pv = useProvenance({ init: prov, text, replace: (n, m) => replaceRef.current(n, m), spell: { kind: "record", studentId }, focusBody: () => body.current?.focus() });
  // N41 근거보다 높은 평가: 창체·행발은 성취수준이 없다 → 사실 그대로 (근거 글 = 활동 메모 · 관찰 메모)
  const evidence = useMemo(() => [memo, ...(pieces ?? []).map((p) => p.text)].join(" / "), [memo, pieces]);
  const more = useMemo(() => ({ ...pv.more, praise: { level: null, evidence } }), [pv.more, evidence]);
  const bc = useBodyChecks({ text, setText, range, who, context: undefined, openFirst: openCheck, more });
  useEffect(() => { replaceRef.current = bc.replace; });
  // N43 기재요령 "이 글에서 찾기": ③ 글이 대상 · 찾은 자리 밑줄 + 찾은 곳 줄
  useGuideTarget(text, area, toBody);
  const gm = useGuideMarks(text);
  const marks = useMemo(() => (gm.marks.length ? [...bc.marks, ...gm.marks] : bc.marks), [bc.marks, gm.marks]);
  const { needFromServer } = pv;
  useEffect(() => { needFromServer(state.needReason); }, [state.needReason, needFromServer]);
  // N49 게이트: 나이스 한도 · 마지막 AI 결과
  const limitNow = recordMax(area, range.unit);
  const [aiBusy, setAiBusy] = useState(false);
  const gate = useAiGate({
    text, unit: range.unit, limit: limitNow, target: range.max, scope: area,
    fit: (t, max, tol) => fitRecordAction({ area, studentId, clubId, text: t, unit: range.unit, max, tol }),
    merge: (ps, max, tol) => mergeRecordAction({ area, studentId, clubId, pieces: ps, unit: range.unit, max, keepOrder: true, tol }),
    apply: (t, r) => { bc.replace(t, "다시 맞췄어요"); pv.adopt(r); },
    onMoreMemos: () => ws.go(1),
  });
  const apply = (t: string, r?: AiDraftResult) => { setText(t); pv.adopt(r); gate.remember(t, r?.ok ? r.gate : undefined); };
  const [piecesKey, setPiecesKey] = useState(0);
  const lib = useBodyLibrary({
    text, body, area: libraryAreaOf(area), onInsert: (next) => { bc.replace(next, "넣었어요"); ws.go(3, { scroll: false }); },
    addPiece: async (id) => { const r = await pieceFromLibrary({ id, target: { kind: "record", area, studentId, clubId } }); if (!r.error) setPiecesKey((k) => k + 1); return r; },
  });
  const [variants, setVariants] = useState(false);
  const lm = useLessonMenu(area === "행발" ? undefined : lesson, studentId);

  const items = writeStepItems({ memos: pieces?.length ?? memoN, text, unit: range.unit, max: range.max, check: bc.check, confirmedNow, hasBody });
  const u = range.unit === "bytes" ? "B" : UNIT_LABEL[range.unit];

  return (
    <StepperContext.Provider value>
    <div className="flex flex-col gap-5">
      <WriteStepper items={items} current={step} onPick={(s) => ws.go(s, { scroll: false })} innerRef={ws.top} />
      <div className={step === 1 ? "contents" : "hidden"}>
      <PiecesCard key={`${area}-${clubId ?? ""}-${studentId}-${piecesKey}`} studentId={studentId} placeholder={PIECE_HINT[area]}
        note={area === "행발" ? undefined : "누가기록에도 남아요"} what={`${area} 글`}
        activity={activity} setActivity={setActivity} activityRef={activityRef} onPieces={setPieces} done={!!pieces?.length && hasBody}
        load={() => listRecordPieces({ area, studentId, clubId })}
        add={(t, a, kind) => addRecordPiece({ area, studentId, clubId, text: t, activity: a, kind })} lesson={lm.menu}
        soften={aiOn ? (t) => softenRecordMemo({ area, studentId, clubId, text: t }) : undefined} bluntCheck
        summarize={(fd) => { fd.set("area", area); fd.set("studentId", studentId); if (clubId) fd.set("clubId", clubId); return summarizeRecordFile(fd); }} />
      </div>
      <div className={step === 2 ? "" : "hidden"}>
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
            run: gate.track((ps, max, tol, opts) => mergeRecordAction({ area, studentId, clubId, pieces: ps, unit: range.unit, max, keepOrder: true, tol, append: opts?.append })),
          }}
          gateScope={area}
          onBusy={setAiBusy}
          onApply={apply}
          what={`${area} 글`}
          done={hasBody}
          keywordPane={keywordPane?.({ onApply: apply, bodyEmpty: !hasBody })}
          defaultMode={keywordPane ? "keywords" : undefined}
        />
      </div>
      <form action={action} className={step === 3 ? "flex flex-col gap-3" : "hidden"}>
        <StepHead n={3} title="글 확인 · 확정" meta={checkMeta(bc.check).replace("본문", "글")} done={confirmedNow} />
        {reading && <ConfirmedLine meta={`${measure(text, range.unit).toLocaleString()}${u} · 고치면 다시 확정해요`} onEdit={() => { setEditing(true); later(() => body.current?.focus()); }} />}
        {gm.line}
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="studentId" value={studentId} />
        {clubId && <input type="hidden" name="clubId" value={clubId} />}
        {pv.inputs()}
        <BodyCard bare title={`${area} 글`} toggle={hasBody} text={text} tag={(t) => tagRecord({ area, studentId, clubId, text: t })}
          extra={<><BodyViewSwitch {...pv.switchProps} className="hidden @lg:inline-flex" /><LibraryToggle />{hasBody && !reading && <VariantsToggle on={variants} onClick={() => setVariants(!variants)} />}</>}>
          {!reading && gate.chips}
          <BodyViewSwitch {...pv.switchProps} full className="mb-2 @lg:hidden" />
          {pv.body(<HighlightTextarea
            ref={body}
            name="content"
            value={text}
            onChange={setText}
            marks={marks}
            onPickMark={bc.setOpen}
            focusKey={gm.focusKey ?? bc.open}
            maxLength={5000}
            placeholder="AI로 쓰거나 직접 써요. 문장은 '~함.'으로 끝내요"
            boxClassName="rounded-field bg-soft focus-within:ring-2 focus-within:ring-key"
            textClassName="min-h-[120px] px-4 py-3.5 text-[15px] leading-[26px]"
            aria-label="기록 내용"
            selectionTool={lib.selectionTool}
            onSelectionChange={lib.onSelectionChange}
          />)}
          {lib.mobileSave && <div className="mt-2">{lib.mobileSave}</div>}
        </BodyCard>
        <div className={reading ? "hidden" : "contents"}>
        {hasBody && (
          <ReviseBox kind={area === "행발" ? "behavior" : "record"} text={text} unit={range.unit} limit={limitNow} band={gate.bandLabel}
            disabled={aiOn ? undefined : "AI가 꺼져 있어 수정 요청을 보낼 수 없어요. 직접 고쳐 주세요"}
            run={(request) => reviseRecordAction({ area, studentId, clubId, text, request, unit: range.unit, max: gate.band.target, tol: gate.band.tol })}
            onApply={(t, g) => { bc.replace(t, "고친 글로 바꿨어요"); gate.remember(t, g, null); }} />
        )}
        {variants && hasBody && (
          <VariantsPanel unit={range.unit} max={range.max} onClose={() => setVariants(false)}
            run={(mode) => variantsRecordAction({ area, studentId, clubId, text, mode, unit: range.unit, max: range.max })}
            onPick={(t) => { setVariants(false); bc.replace(t, "본문을 바꿨어요"); }} />
        )}
        <RecordChecks text={text} range={range} check={bc.check} recheck={bc.recheck} open={bc.open} onOpen={bc.setOpen} onReplace={bc.onReplace}
          onReplaceAll={bc.onReplaceAll} spellAi={pv.spellLine} renderOpen={pv.renderOpen}
          aiFix={{ run: (t) => aiFixRecordAction({ area, studentId, clubId, text: t, unit: range.unit, max: range.max, praise: { evidence } }), onApply: (t) => bc.replace(t, "고친 글을 넣었어요") }}
          length={{ unit: len.unit, max: len.max, limit: recordMax(area, len.unit), onChange: setLen }}
          fit={{ run: () => fitRecordAction({ area, studentId, clubId, text, unit: range.unit, max: range.max }), onApply: (t) => { setText(t); gate.remember(t); } }} />

        {over && <OverApproval value={length.value} max={range.max} unit={UNIT_LABEL[range.unit]} checked={allowOver} onChange={setAllowOver} />}
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && (
          <p className="text-sm text-ok" role="status">
            {state.saved === "confirmed" ? "확정했어요" : "임시 저장했어요"} · 새 버전으로 남았어요
          </p>
        )}
        {pv.ratioLine && <div className="@container">{pv.ratioLine}</div>}
        <div data-sticky-cta className="z-10 flex gap-2 bg-[#fff] max-md:sticky max-md:bottom-[calc(env(safe-area-inset-bottom)+66px)] max-md:-mx-5 max-md:border-t max-md:border-line max-md:px-5 max-md:py-3">
          <PrevButton onClick={() => ws.go(2)} />
          <Button kind="outline" name="intent" value="draft" disabled={pending} className="flex-1 max-md:h-11 max-md:py-0">
            임시 저장
          </Button>
          <Button onClick={pv.guardConfirm} name="intent" value="confirmed" disabled={pending || (over && !allowOver) || !hasBody || bc.check.status === "block"} className="flex-1 disabled:bg-key disabled:opacity-40 max-md:h-11 max-md:py-0">
            <Check size={16} strokeWidth={2.5} /> {confirmed ? "다시 확정" : "확정"}
          </Button>
        </div>
        <p className="text-[12px] text-mute">확정한 기록만 나이스로 내보내요</p>
        </div>
      </form>
      {step === 1 && (
        <StepNav onNext={() => ws.go(2)} next="다음 · AI로 쓰기"
          hint={pieces?.length ? `메모 ${pieces.length}개를 모았어요 · 다음에서 AI로 써요` : "메모를 하나 남기면 AI로 쓸 수 있어요"} />
      )}
      {step === 2 && (
        <StepNav dim={aiBusy} onPrev={() => ws.go(1)} onNext={() => ws.go(3)} next="다음 · 글 확인" primary={hasBody}
          hint={hasBody ? "AI가 쓴 글을 ③에서 확인하고 확정해요" : keywordPane ? "키워드를 고르고 AI로 글 쓰기를 누르면 ③에 들어가요" : aiOn ? "고른 메모로 글을 쓰면 ③에 들어가요" : "AI가 꺼져 있어 예시 글로 써요"} />
      )}
      {step === 3 && reading && <StepNav onPrev={() => ws.go(2)} />}
      {bc.snack}
      {pv.dialog}
      {lm.node}
    </div>
    </StepperContext.Provider>
  );
}
