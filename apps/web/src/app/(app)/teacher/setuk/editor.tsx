"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { AiDraftPanel } from "@/components/writing/ai-draft-panel";
import { checkMeta, RecordChecks, useBodyChecks, type Who } from "@/components/writing/record-checks";
import { HighlightTextarea, type Mark } from "@/components/writing/highlight-textarea";
import { VariantsPanel, VariantsToggle } from "@/components/writing/variants-panel";
import { SimilarNotice, SimilarSheet, useSimilar, type SimilarPeer, type SimilarSelf } from "@/components/writing/similar-sheet";
import { checkLength, MIN_RATIO, NEIS_MAX_BYTES, neisMax, resolveLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { BodyCard } from "@/components/writing/competency-view";
import { PiecesCard } from "@/components/writing/pieces-card";
import { StepHead, STEP_GAP } from "@/components/writing/step-head";
import { WritingProgress } from "@/components/writing/writing-progress";
import { addSetukPiece, aiFixSetuk, aiSetukDraft, summarizeSetukFile, fitSetuk, listSetukPieces, mergeSetuk, saveSetuk, tagSetuk, variantsSetuk, type SetukState } from "./actions";
import { OverApproval } from "@/components/writing/over-approval";
import { LevelPicker, useLevels } from "@/components/writing/level-picker";
import { LibraryToggle, useBodyLibrary } from "@/components/writing/library-save";
import { pieceFromLibrary } from "@/app/(app)/teacher/library/actions";
import { BodyViewSwitch, useProvenance, type ProvInit } from "@/components/writing/provenance";

// 세특 쓰기 (Figma N40, N32 구조): 진행 줄 · ① 활동 메모 → ② AI로 쓰기 → ③ 글 확인 · 확정.
// 활동명은 ①의 칸 하나를 ②가 같이 쓴다. AI 결과는 ③ 글에 채우기만 하고(되돌리기 있음) 저장은 교사가 누른다.
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
}: {
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
  const editActivity = () => { activityRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); activityRef.current?.focus({ preventScroll: true }); };
  const hasBody = !!text.trim();
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
  const { needFromServer } = pv;
  useEffect(() => { needFromServer(state.needReason); }, [state.needReason, needFromServer]);
  // ② 문장 보관함
  const [piecesKey, setPiecesKey] = useState(0);
  const lib = useBodyLibrary({
    text, body, area: "세특", subject, onInsert: (next) => bc.replace(next, "넣었어요"),
    addPiece: async (id) => { const r = await pieceFromLibrary({ id, target: { kind: "setuk", courseId, studentId } }); if (!r.error) setPiecesKey((k) => k + 1); return r; },
  });
  const [variants, setVariants] = useState(false);
  const [compare, setCompare] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <WritingProgress memos={pieces?.length ?? null} text={text} unit={range.unit} max={range.max} check={bc.check} />
      <PiecesCard key={`${courseId}-${studentId}-${piecesKey}`} studentId={studentId} placeholder="지금 본 것을 짧게 (예: 오차 원인을 찾아 다시 측정)"
        activity={activity} setActivity={setActivity} activityRef={activityRef} onPieces={setPieces} done={!!pieces?.length && hasBody}
        load={() => listSetukPieces({ courseId, studentId })}
        add={(t, a, kind) => addSetukPiece({ courseId, studentId, text: t, activity: a, kind })}
        summarize={(fd) => { fd.set("courseId", courseId); fd.set("studentId", studentId); return summarizeSetukFile(fd); }} />
      <div className={STEP_GAP}>
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
            run: (ps, max) => mergeSetuk({ courseId, studentId, pieces: ps, unit: range.unit, max, level, keepOrder: true }),
          }}
          onApply={(t, r) => { setText(t); pv.adopt(r); }}
          what="세특 글"
          done={hasBody}
          levelValue={level}
          levelBox={lv && <LevelPicker scale={lv.scale} value={level} onChange={(l) => { void lv.set([{ studentId, level: l }]); }} />}
        />
      </div>
      <form action={action} className={`flex flex-col gap-3 ${STEP_GAP}`}>
        <StepHead n={3} title="글 확인 · 확정" meta={checkMeta(bc.check, sim.length).replace("본문", "글")} done={confirmed && hasBody && text === initial} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />
        {pv.inputs()}
        <BodyCard bare title="세특 글" toggle={hasBody} text={text} tag={(t) => tagSetuk({ courseId, studentId, text: t })}
          extra={<><BodyViewSwitch {...pv.switchProps} className="hidden @lg:inline-flex" /><LibraryToggle />{hasBody && <VariantsToggle on={variants} onClick={() => setVariants(!variants)} />}</>}>
          <BodyViewSwitch {...pv.switchProps} full className="mb-2 @lg:hidden" />
          {pv.body(<HighlightTextarea
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
            aria-label="세특 내용"
            selectionTool={lib.selectionTool}
            onSelectionChange={lib.onSelectionChange}
          />)}
          {lib.mobileSave && <div className="mt-2">{lib.mobileSave}</div>}
        </BodyCard>
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
          fit={{ run: () => fitSetuk({ courseId, studentId, text, unit: range.unit, max: range.max }), onApply: setText }} />

        {over && <OverApproval value={length.value} max={range.max} unit={UNIT_LABEL[range.unit]} checked={allowOver} onChange={setAllowOver} />}
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && (
          <p className="text-sm text-ok" role="status">
            {state.saved === "confirmed" ? "확정했어요" : "임시 저장했어요"} · 새 버전으로 남았어요
          </p>
        )}
        {pv.ratioLine && <div className="@container">{pv.ratioLine}</div>}
        <div className="flex gap-2">
          <Button kind="outline" name="intent" value="draft" disabled={pending} className="flex-1">
            임시 저장
          </Button>
          <Button onClick={pv.guardConfirm} name="intent" value="confirmed" disabled={pending || (over && !allowOver) || !hasBody || bc.check.status === "block"} className="flex-1 disabled:bg-key disabled:opacity-40">
            <Check size={16} strokeWidth={2.5} /> {confirmed ? "다시 확정" : "확정"}
          </Button>
        </div>
      </form>
      {bc.snack}
      {pv.dialog}
      {compare && similar && sim.length > 0 && (
        <SimilarSheet self={similar.self} text={text} unit={range.unit} state={sim} onClose={() => setCompare(false)}
          onRewriteSelf={() => { setCompare(false); body.current?.focus(); }} />
      )}
    </div>
  );
}

const NO_PEERS: SimilarPeer[] = [];
const NO_PEERS_TEXT: string[] = [];
