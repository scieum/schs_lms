"use client";
import { useActionState, useMemo, useRef, useState } from "react";
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
import { addSetukPiece, aiFixSetuk, aiSetukDraft, summarizeSetukFile, fitSetuk, listSetukPieces, mergeSetuk, saveSetuk, tagSetuk, variantsSetuk, type SetukState } from "./actions";
import { OverApproval } from "@/components/writing/over-approval";

// 세특 쓰기 (Figma N32): ① 조각 모으기 → ② 본문 만들기 → ③ 본문 · 검사 · 확정.
// 활동명은 ①의 칸 하나를 ②가 같이 쓴다. AI 결과는 본문에 채우기만 하고 저장은 교사가 누른다.
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
}: {
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
  const bc = useBodyChecks({ text, setText, range, who, context: subject, extraMarks: simMarks });
  const [variants, setVariants] = useState(false);
  const [compare, setCompare] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <PiecesCard key={`${courseId}-${studentId}`} studentId={studentId} placeholder="지금 본 것을 짧게 (예: 오차 원인을 찾아 다시 측정)"
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
          generate={(m, a, max) => aiSetukDraft({ courseId, studentId, memo: m, activity: a, unit: range.unit, max })}
          merge={{
            pieces,
            body: text,
            neisMax: Math.min(neisMax("세특", range.unit), capMax),
            run: (ps, max) => mergeSetuk({ courseId, studentId, pieces: ps, unit: range.unit, max }),
          }}
          onApply={setText}
          done={hasBody}
        />
      </div>
      <form action={action} className={`flex flex-col gap-3 ${STEP_GAP}`}>
        <StepHead n={3} title="본문 · 검사 · 확정" meta={checkMeta(bc.check, sim.length)} done={confirmed && hasBody && text === initial} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />
        <BodyCard bare toggle={hasBody} text={text} tag={(t) => tagSetuk({ courseId, studentId, text: t })}
          extra={hasBody && <VariantsToggle on={variants} onClick={() => setVariants(!variants)} />}>
          <HighlightTextarea
            ref={body}
            name="content"
            value={text}
            onChange={setText}
            marks={bc.marks}
            onPickMark={bc.setOpen}
            focusKey={bc.open}
            maxLength={5000}
            placeholder="② 결과를 넣거나 직접 써 주세요. 문장은 '~함.'으로 끝내요"
            boxClassName="rounded-field bg-soft focus-within:ring-2 focus-within:ring-key"
            textClassName="min-h-[120px] px-4 py-3.5 text-[15px] leading-[26px]"
            aria-label="세특 내용"
          />
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
          aiFix={{ run: (t) => aiFixSetuk({ courseId, studentId, text: t, unit: range.unit, max: range.max }), onApply: (t) => bc.replace(t, "고친 글을 넣었어요") }}
          length={{ unit: len.unit, max: len.max, limit: neisMax("세특", len.unit), onChange: setLen }}
          fit={{ run: () => fitSetuk({ courseId, studentId, text, unit: range.unit, max: range.max }), onApply: setText }} />

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
      </form>
      {bc.snack}
      {compare && similar && sim.length > 0 && (
        <SimilarSheet self={similar.self} text={text} unit={range.unit} state={sim} onClose={() => setCompare(false)}
          onRewriteSelf={() => { setCompare(false); body.current?.focus(); }} />
      )}
    </div>
  );
}

const NO_PEERS: SimilarPeer[] = [];
const NO_PEERS_TEXT: string[] = [];
