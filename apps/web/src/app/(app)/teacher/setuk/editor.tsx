"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { AiDraftPanel } from "@/components/writing/ai-draft-panel";
import { checkMeta, RecordChecks, useBodyChecks, type Who } from "@/components/writing/record-checks";
import { HighlightTextarea, type Mark } from "@/components/writing/highlight-textarea";
import { VariantsPanel, VariantsToggle } from "@/components/writing/variants-panel";
import { SimilarNotice, SimilarSheet, useSimilar, type SimilarPeer, type SimilarSelf } from "@/components/writing/similar-sheet";
import { checkLength, measure, MIN_RATIO, NEIS_MAX_BYTES, neisMax, resolveLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { BodyCard } from "@/components/writing/competency-view";
import { PiecesCard } from "@/components/writing/pieces-card";
import { StepHead } from "@/components/writing/step-head";
import { ConfirmedLine, PrevButton, StepNav, StepperContext, useWriteStep, writeStepItems, WriteStepper } from "@/components/writing/write-steps";
import { defaultWriteStep } from "@/lib/domain/write-step";
import { addSetukPiece, aiFixSetuk, aiSetukDraft, summarizeSetukFile, fitSetuk, listSetukPieces, mergeSetuk, reviseSetuk, saveSetuk, tagSetuk, variantsSetuk, type SetukState } from "./actions";
import { useAiGate } from "@/components/writing/use-ai-gate";
import { ReviseBox } from "@/components/writing/revise-box";
import { OverApproval } from "@/components/writing/over-approval";
import { LevelPicker, useLevels } from "@/components/writing/level-picker";
import { LibraryToggle, useBodyLibrary } from "@/components/writing/library-save";
import { pieceFromLibrary } from "@/app/(app)/teacher/library/actions";
import { BodyViewSwitch, useProvenance, type ProvInit } from "@/components/writing/provenance";
import { useGuideMarks, useGuideTarget } from "@/components/writing/guide-store";
import { useLessonMenu } from "@/components/writing/use-lesson-menu";
import type { LessonView } from "@/lib/domain/lesson-plan";

// 세특 쓰기 (Figma N48 → N40 · N32 구조): 단계 표시 · ① 활동 메모 → ② AI로 쓰기 → ③ 글 확인 · 확정 — 지금 단계만 보여 준다.
// 숨긴 단계도 그려 둔 채(메모 · 활동명 · 글 · 폼 상태 유지) CSS 로만 숨긴다. 처음 단계는 defaultWriteStep (메모 없음 ① · 메모만 ② · 글 있음 ③).
// 활동명은 ①의 칸 하나를 ②가 같이 쓴다. AI 결과는 ③ 글에 채우기만 하고(되돌리기 있음) 저장은 교사가 누른다.
// N49: ③ 글 위 게이트 줄(분량 · 메모 반영 · 다시 맞추기) · 글 아래 "AI에게 고쳐 달라고 하기"(이걸로 바꾸기를 눌러야 바뀜).
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
  subject,
  similar,
  openCheck = false,
  prov,
  lesson,
  memoCount,
  aiOn = true,
}: {
  /** 활동 메모 수 (서버에서 센 값 — 처음 단계를 바로 정한다) */
  memoCount?: number;
  /** AI 키가 없으면 ② 안내에 "예시 글" */
  aiOn?: boolean;
  /** 차시별 활동 메뉴 (Figma N43 (f)): 이 분반 수업 계획 · 학생별 남긴 차시 */
  lesson?: LessonView;
  /** N38 문장 근거 · AI 원안 (원안이 없으면 근거 · 원안 비교 · 수정 칩이 숨는다) */
  prov?: ProvInit;
  /** 반 전체 검사(N35)의 "열기": ③ 자동 검사 첫 걸린 행을 펼친다 */
  openCheck?: boolean;
  /** 과목명 (고칠 말 "○○ 탐구 활동") */
  subject?: string;
  /** 비슷한 문장 (N34 ④): 겹친 다른 학생 글 · 공통 활동 글(세지 않음) */
  similar?: { self: SimilarSelf; peers: SimilarPeer[]; ignore: string[] };
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
  const body = useRef<HTMLTextAreaElement>(null);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const full = resolveLength("세특", len);
  // 공통과목은 다른 학기에 쓴 만큼 이 학기 최대가 줄어든다 (2026 기재요령 208쪽)
  const cap = shared ? Math.max(0, NEIS_MAX_BYTES["세특"] - shared.bytes) : null;
  const capMax = cap == null ? full.max : Math.min(full.max, full.unit === "bytes" ? cap : Math.floor(cap / 3));
  const range = { ...full, max: capMax, min: Math.min(full.min, Math.ceil(capMax * MIN_RATIO)) };
  const length = checkLength(text, range);
  const over = length.reason === "too_long";
  const [allowOver, setAllowOver] = useState(false);
  // ①·②가 같이 쓰는 활동명과 조각
  const [activity, setActivity] = useState("");
  const activityRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<MergePiece[] | null>(null);
  const hasBody = !!text.trim();
  // N48 단계: 처음 단계는 한 번만 정하고, 고른 단계는 주소 줄 · 이 탭에 기억한다
  const ws = useWriteStep(`setuk:${courseId}`, studentId, defaultWriteStep({ memos: memoCount ?? pieces?.length ?? null, hasBody: !!initial.trim(), openCheck }));
  const step = ws.step;
  const later = (f: () => void) => setTimeout(f, 40);
  const editActivity = () => { ws.go(1, { scroll: false }); later(() => { activityRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); activityRef.current?.focus({ preventScroll: true }); }); };
  const toBody = () => { ws.go(3, { scroll: false }); later(() => body.current?.scrollIntoView({ block: "center", behavior: "smooth" })); };
  // ③ 확정한 글 읽기: 확정한 그대로면 검사 · 저장 칸을 접는다 (고치기 · 글을 고치면 다시 나온다)
  const [editing, setEditing] = useState(false);
  const confirmedNow = confirmed && hasBody && text === initial;
  const reading = confirmedNow && !editing;
  // N34: 검사 근거·고칠 말 · 본문 밑줄 · 다른 버전 · 비슷한 문장
  const sim = useSimilar(studentId, text, similar?.peers ?? NO_PEERS, similar?.ignore ?? NO_PEERS_TEXT);
  const simMarks = useMemo<Mark[]>(() => sim.flatMap((s) => s.mine.map((g) => ({ ...g, tone: "similar" as const }))), [sim]);
  // N38: 문장 근거 · AI 원안 · 맞춤법 (본문 바꾸기는 검사 묶음의 되돌리기 스낵바로)
  const replaceRef = useRef<(next: string, msg: string) => void>(() => {});
  const pv = useProvenance({ init: prov, text, replace: (n, m) => replaceRef.current(n, m), spell: { kind: "setuk", studentId }, focusBody: () => body.current?.focus() });
  // N41 근거보다 높은 평가: 고른 성취수준 · 근거 글(활동 메모 · 관찰 메모)
  const lv = useLevels();
  const level = lv?.levels[studentId] ?? null;
  const praise = useMemo(() => ({ level, evidence: [memo, ...(pieces ?? []).map((p) => p.text)].join(" / ") }), [level, memo, pieces]);
  const more = useMemo(() => ({ ...pv.more, praise }), [pv.more, praise]);
  const bc = useBodyChecks({ text, setText, range, who, context: subject, extraMarks: simMarks, openFirst: openCheck, more });
  useEffect(() => { replaceRef.current = bc.replace; });
  // N43 기재요령 "이 글에서 찾기": ③ 글이 대상 · 찾은 자리 밑줄 + 찾은 곳 줄
  useGuideTarget(text, "세특", toBody);
  const gm = useGuideMarks(text);
  const marks = useMemo(() => (gm.marks.length ? [...bc.marks, ...gm.marks] : bc.marks), [bc.marks, gm.marks]);
  const { needFromServer } = pv;
  useEffect(() => { needFromServer(state.needReason); }, [state.needReason, needFromServer]);
  // ② 문장 보관함
  const [piecesKey, setPiecesKey] = useState(0);
  const lib = useBodyLibrary({
    text, body, area: "세특", subject, onInsert: (next) => { bc.replace(next, "넣었어요"); ws.go(3, { scroll: false }); },
    addPiece: async (id) => { const r = await pieceFromLibrary({ id, target: { kind: "setuk", courseId, studentId } }); if (!r.error) setPiecesKey((k) => k + 1); return r; },
  });
  const [variants, setVariants] = useState(false);
  const [compare, setCompare] = useState(false);
  const lm = useLessonMenu(lesson, studentId);

  const memoN = pieces?.length ?? memoCount ?? null;
  // N49 게이트: 나이스 한도(공통과목은 남은 만큼) · 마지막 AI 결과
  const limitNow = Math.min(neisMax("세특", range.unit), capMax);
  const [aiBusy, setAiBusy] = useState(false);
  const gate = useAiGate({
    text, unit: range.unit, limit: limitNow, target: range.max, scope: "세특",
    fit: (t, max, tol) => fitSetuk({ courseId, studentId, text: t, unit: range.unit, max, tol }),
    merge: (ps, max, tol) => mergeSetuk({ courseId, studentId, pieces: ps, unit: range.unit, max, level, keepOrder: true, tol }),
    apply: (t, r) => { bc.replace(t, "다시 맞췄어요"); pv.adopt(r); },
    onMoreMemos: () => ws.go(1),
  });
  const items = writeStepItems({ memos: memoN, text, unit: range.unit, max: range.max, check: bc.check, confirmedNow, hasBody });
  const u = range.unit === "bytes" ? "B" : UNIT_LABEL[range.unit];

  return (
    <StepperContext.Provider value>
    <div className="flex flex-col gap-5">
      <WriteStepper items={items} current={step} onPick={(s) => ws.go(s, { scroll: false })} innerRef={ws.top} />
      <div className={step === 1 ? "contents" : "hidden"}>
      <PiecesCard key={`${courseId}-${studentId}-${piecesKey}`} studentId={studentId} placeholder="지금 본 것을 짧게 (예: 오차 원인을 찾아 다시 측정)"
        activity={activity} setActivity={setActivity} activityRef={activityRef} onPieces={setPieces} done={!!pieces?.length && hasBody}
        load={() => listSetukPieces({ courseId, studentId })}
        add={(t, a, kind) => addSetukPiece({ courseId, studentId, text: t, activity: a, kind })} lesson={lm.menu}
        summarize={(fd) => { fd.set("courseId", courseId); fd.set("studentId", studentId); return summarizeSetukFile(fd); }} />
      </div>
      <div className={step === 2 ? "" : "hidden"}>
        <AiDraftPanel
          initialMemo={memo}
          placeholder="관찰 메모 (예: 빗면 실험 설계 주도, 오차 원인 질문, 산업디자인 진로와 연결)"
          unit={range.unit}
          bodyEmpty={!hasBody}
          activity={activity}
          onEditActivity={editActivity}
          generate={(m, a, max) => aiSetukDraft({ courseId, studentId, memo: m, activity: a, unit: range.unit, max, level })}
          merge={{
            pieces,
            body: text,
            neisMax: Math.min(neisMax("세특", range.unit), capMax),
            run: gate.track((ps, max, tol) => mergeSetuk({ courseId, studentId, pieces: ps, unit: range.unit, max, level, keepOrder: true, tol })),
          }}
          gateScope="세특"
          onBusy={setAiBusy}
          onApply={(t, r) => { setText(t); pv.adopt(r); gate.remember(t, r?.ok ? r.gate : undefined); }}
          what="세특 글"
          done={hasBody}
          levelValue={level}
          levelBox={lv && <LevelPicker scale={lv.scale} value={level} onChange={(l) => { void lv.set([{ studentId, level: l }]); }} />}
        />
      </div>
      <form action={action} className={step === 3 ? "flex flex-col gap-3" : "hidden"}>
        <StepHead n={3} title="글 확인 · 확정" meta={checkMeta(bc.check, sim.length).replace("본문", "글")} done={confirmedNow} />
        {reading && <ConfirmedLine meta={`${measure(text, range.unit).toLocaleString()}${u} · 고치면 다시 확정해요`} onEdit={() => { setEditing(true); later(() => body.current?.focus()); }} />}
        {gm.line}
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />
        {pv.inputs()}
        <BodyCard bare title="세특 글" toggle={hasBody} text={text} tag={(t) => tagSetuk({ courseId, studentId, text: t })}
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
            aria-label="세특 내용"
            selectionTool={lib.selectionTool}
            onSelectionChange={lib.onSelectionChange}
          />)}
          {lib.mobileSave && <div className="mt-2">{lib.mobileSave}</div>}
        </BodyCard>
        <div className={reading ? "hidden" : "contents"}>
        {hasBody && (
          <ReviseBox kind="record" text={text} unit={range.unit} limit={limitNow} band={gate.bandLabel}
            disabled={aiOn ? undefined : "AI가 꺼져 있어 수정 요청을 보낼 수 없어요. 직접 고쳐 주세요"}
            run={(request) => reviseSetuk({ courseId, studentId, text, request, unit: range.unit, max: gate.band.target, tol: gate.band.tol })}
            onApply={(t, g) => { bc.replace(t, "고친 글로 바꿨어요"); gate.remember(t, g, null); }} />
        )}
        <SimilarNotice state={sim} onOpen={() => setCompare(true)} />
        {variants && hasBody && (
          <VariantsPanel unit={range.unit} max={range.max} onClose={() => setVariants(false)}
            run={(mode) => variantsSetuk({ courseId, studentId, text, mode, unit: range.unit, max: range.max })}
            onPick={(t) => { setVariants(false); bc.replace(t, "본문을 바꿨어요"); }} />
        )}
        {shared && (
          <p className="rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] text-key-strong">
            공통과목은 1·2학기 합산 500자 · {shared.other}학기 {shared.bytes.toLocaleString()}바이트 → 이 학기 최대 {capMax.toLocaleString()}{UNIT_LABEL[range.unit]}
          </p>
        )}
        <RecordChecks text={text} range={range} check={bc.check} recheck={bc.recheck} open={bc.open} onOpen={bc.setOpen} onReplace={bc.onReplace}
          onReplaceAll={bc.onReplaceAll} spellAi={pv.spellLine} renderOpen={pv.renderOpen}
          aiFix={{ run: (t) => aiFixSetuk({ courseId, studentId, text: t, unit: range.unit, max: range.max, praise }), onApply: (t) => bc.replace(t, "고친 글을 넣었어요") }}
          length={{ unit: len.unit, max: len.max, limit: neisMax("세특", len.unit), onChange: setLen }}
          fit={{ run: () => fitSetuk({ courseId, studentId, text, unit: range.unit, max: range.max }), onApply: (t) => { setText(t); gate.remember(t); } }} />

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
        </div>
      </form>
      {step === 1 && (
        <StepNav onNext={() => ws.go(2)} next="다음 · AI로 쓰기"
          hint={memoN ? `메모 ${memoN}개를 모았어요 · 다음에서 AI로 써요` : "메모를 하나 남기면 AI로 쓸 수 있어요"} />
      )}
      {step === 2 && (
        <StepNav dim={aiBusy} onPrev={() => ws.go(1)} onNext={() => ws.go(3)} next="다음 · 글 확인" primary={hasBody}
          hint={hasBody ? "AI가 쓴 글을 ③에서 확인하고 확정해요" : aiOn ? "고른 메모로 글을 쓰면 ③에 들어가요" : "AI가 꺼져 있어 예시 글로 써요"} />
      )}
      {step === 3 && reading && <StepNav onPrev={() => ws.go(2)} />}
      {bc.snack}
      {pv.dialog}
      {lm.node}
      {compare && similar && sim.length > 0 && (
        <SimilarSheet self={similar.self} text={text} unit={range.unit} state={sim} onClose={() => setCompare(false)}
          onRewriteSelf={() => { setCompare(false); setEditing(true); toBody(); later(() => body.current?.focus()); }} />
      )}
    </div>
    </StepperContext.Provider>
  );
}

const NO_PEERS: SimilarPeer[] = [];
const NO_PEERS_TEXT: string[] = [];
