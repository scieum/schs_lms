"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { Check, Link2, MessageSquare, ShieldCheck } from "lucide-react";
import { AutoChecks, LengthRow } from "@/components/writing/auto-checks";
import { selectIn } from "@/components/writing/record-checks";
import { autoCheck } from "@/lib/domain/auto-check";
import { Button, cx } from "@/components/ui";
import { neisMax, resolveLength, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { checkDraft, similarSentences, type EvidenceItem, type SimilarHit } from "@/lib/domain/program";
import { regenerateDraft, rephraseAction, reviewDraftAction, saveDraft, type RegenState, type RephraseState, type ReviewState, type SaveState } from "./actions";
import { OverApproval } from "@/components/writing/over-approval";
import { RecordCompetency } from "@/components/writing/record-competency";

// T4 초안 본문 편집 + 자동 검사 + 검토 도우미 + 반려·직접 수정·확정
export function DraftEditor({
  jobId, studentId, initial, unit, max, area, people, evidence, peers, aiOn, finalized, tags,
}: {
  jobId: string;
  studentId: string;
  initial: string;
  unit: LengthUnit;
  max: number;
  area: DraftCategory;
  people: { name: string; studentNo: string }[];
  evidence: EvidenceItem[];
  /** 같은 프로그램 다른 학생 초안 (비슷한 문장 찾기) */
  peers: { label: string; text: string }[];
  aiOn: boolean;
  finalized: boolean;
  tags: string[];
}) {
  const [save, saveAction, saving] = useActionState<SaveState, FormData>(saveDraft, {});
  const [regen, regenAction, regenerating] = useActionState<RegenState, FormData>(regenerateDraft, {});
  const [review, reviewAction, reviewing] = useActionState<ReviewState, FormData>(reviewDraftAction, {});
  const [text, setText] = useState(initial);
  const [reason, setReason] = useState("");
  const [allowOver, setAllowOver] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [re, reAction, rephrasing] = useActionState<RephraseState, FormData>(rephraseAction, {});
  const [similar, setSimilar] = useState<SimilarHit[] | null>(null);
  const [reDone, setReDone] = useState(-1);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const area_ = useRef<HTMLTextAreaElement>(null);
  const range = resolveLength(area, { unit, max });
  const c = checkDraft(text, { range, people, evidence });
  const auto = autoCheck(text, range, c.identity.found, { evidence: { ok: c.evidence.ok, hits: c.evidence.hits.length }, specific: c.specific });
  // 다시 만들 분량 (검사는 이 초안의 분량으로, 고른 분량은 다시 만들기에만)
  const [len, setLen] = useState<{ unit: LengthUnit; max: number }>({ unit, max });
  const regenId = `regen-${jobId}`;
  const formId = `save-${jobId}`;
  const items = (review.items ?? []).filter((x) => !applied.includes(x.phrase) && text.includes(x.phrase));

  const runReview = () => {
    const fd = new FormData();
    fd.set("jobId", jobId);
    fd.set("content", text);
    startTransition(() => reviewAction(fd));
  };
  /** 고른 부분, 없으면 커서가 있는 문장 */
  const pickedSentence = (): string => {
    const el = area_.current;
    if (!el) return "";
    const [a, b] = [el.selectionStart ?? 0, el.selectionEnd ?? 0];
    if (b > a) return text.slice(a, b).trim();
    const from = text.lastIndexOf(".", Math.max(0, a - 1)) + 1;
    const dot = text.indexOf(".", a);
    return text.slice(from, dot < 0 ? text.length : dot + 1).trim();
  };
  const runRephrase = (sentence: string, avoid = "") => {
    if (!sentence || !text.includes(sentence)) return setPickMsg("본문에서 바꿀 문장을 고르거나 그 문장에 커서를 두세요");
    setPickMsg(null);
    const fd = new FormData();
    fd.set("jobId", jobId);
    fd.set("sentence", sentence);
    fd.set("content", text);
    if (avoid) fd.set("avoid", avoid);
    startTransition(() => reAction(fd));
  };
  const findSimilar = () => setSimilar(similarSentences(text, peers));
  const hits = (similar ?? []).filter((h) => text.includes(h.sentence));
  const reOpen = !!re.options?.length && reDone !== (re.n ?? 0) && !!re.sentence && text.includes(re.sentence);

  const apply = (phrase: string, suggestion: string) => {
    setText(text.replace(phrase, suggestion).replace(/\s{2,}/g, " ").trim());
    setApplied([...applied, phrase]);
  };


  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3">
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", aiOn ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{review.label ?? (aiOn ? "AI" : "자동")}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">검토 도우미</div>
          <div className="truncate text-[13px] text-sub">
            {review.error ? `AI 대신 규칙으로 봤어요 (${review.error})` : review.items ? (items.length ? `${items[0].issue} — "${items[0].phrase.slice(0, 24)}…"` : "더 고칠 제안이 없어요") : "근거 없는 표현·어미를 찾아 제안해요"}
          </div>
        </div>
        <Button type="button" kind="outline" size="sm" onClick={runReview} disabled={reviewing || !text.trim()}>{reviewing ? "보는 중…" : review.items ? "다시 검토" : "검토 받기"}</Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((x) => (
            <li key={x.phrase} className="flex flex-col gap-2 rounded-inner bg-new-soft p-3 text-[13px]">
              <span className="font-bold text-new">{x.issue}</span>
              <span className="text-sub"><s>{x.phrase}</s>{x.suggestion ? <> → <b className="text-ink">{x.suggestion}</b></> : " → 빼기"}</span>
              <div className="flex gap-2 self-end">
                <Button type="button" size="sm" kind="ghost" onClick={() => setApplied([...applied, x.phrase])}>무시</Button>
                <Button type="button" size="sm" kind="soft" onClick={() => apply(x.phrase, x.suggestion)}>제안 반영</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2.5 rounded-inner bg-soft px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", (re.label ?? (aiOn ? "AI" : "자동")) === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{re.label ?? (aiOn ? "AI" : "자동")}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">문장 도우미</div>
            <div className="truncate text-[13px] text-sub">
              {rephrasing ? "만드는 중이에요" : pickMsg ?? (similar ? (hits.length ? `다른 학생과 비슷한 문장 ${hits.length}개` : `같은 프로그램 초안 ${peers.length}개와 겹치는 문장이 없어요`) : "다른 학생과 겹치는 문장을 찾고, 고른 문장을 다르게 써요")}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" kind="outline" size="sm" onClick={findSimilar} disabled={!text.trim() || peers.length === 0}>비슷한 문장 찾기</Button>
            <Button type="button" kind="outline" size="sm" onClick={() => runRephrase(pickedSentence())} disabled={rephrasing || !text.trim()}>{rephrasing ? "만드는 중…" : "선택 문장 다르게 쓰기"}</Button>
          </div>
        </div>
        {hits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.sentence} className="flex flex-col gap-1.5 rounded-inner bg-white p-3 text-[13px]">
                <span className="font-bold text-wait">{h.peer} 초안과 {Math.round(h.score * 100)}% 비슷해요</span>
                <span className="text-ink">{h.sentence}</span>
                <span className="text-mute">↔ {h.peerSentence}</span>
                <div className="flex gap-2 self-end">
                  <Button type="button" size="sm" kind="ghost" onClick={() => setSimilar((similar ?? []).filter((x) => x !== h))}>무시</Button>
                  <Button type="button" size="sm" kind="soft" disabled={rephrasing} onClick={() => runRephrase(h.sentence, h.peerSentence)}>다르게 쓰기</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {re.error && !re.options?.length && <p className="text-[13px] text-bad" role="alert">{re.error}</p>}
        {reOpen && (
          <div className="flex flex-col gap-2 rounded-inner bg-new-soft p-3 text-[13px]">
            <span className="font-bold text-new">다르게 쓴 안{re.error ? ` · AI 대신 규칙으로 바꿨어요 (${re.error})` : ""}</span>
            <span className="text-sub"><s>{re.sentence}</s></span>
            {re.options!.map((o) => (
              <div key={o} className="flex items-center gap-2 rounded-inner bg-white px-3 py-2.5">
                <span className="min-w-0 flex-1 text-[14px]">{o}</span>
                <Button type="button" size="sm" kind="soft" onClick={() => { setText(text.replace(re.sentence!, o)); setReDone(re.n ?? 0); }}>확인 후 바꾸기</Button>
              </div>
            ))}
            <Button type="button" size="sm" kind="ghost" className="self-end" onClick={() => setReDone(re.n ?? 0)}>그대로 두기</Button>
          </div>
        )}
      </div>

      <form id={formId} action={saveAction} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className={cx("rounded-chip px-2.5 py-1 text-xs font-medium", t === "예시" ? "bg-white text-mute" : "bg-soft text-sub")}>{t}</span>)}
        </div>
        {/* 역량 보기 (Figma N18): 켜면 본문을 3대 역량 색으로 — 편집칸은 숨겨 둘 뿐 폼에 그대로 남는다 */}
        <RecordCompetency studentId={studentId} text={text} title="본문">
          <textarea
            ref={area_} name="content" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={5000}
            className="w-full resize-y rounded-inner border border-line bg-white p-4 text-[15px] leading-8 outline-none focus:ring-2 focus:ring-key md:p-5"
            aria-label="초안 본문" placeholder="근거 자료를 보고 '~함.'으로 끝나는 문장으로 써 주세요"
          />
        </RecordCompetency>
        {c.evidence.hits.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-mute">근거 연결 {c.evidence.hits.length}곳</span>
            {c.evidence.hits.map((h) => <span key={h} className="inline-flex items-center gap-1 rounded-chip bg-soft px-2 py-1 text-sub"><Link2 size={12} /> {h.length > 18 ? `${h.slice(0, 18)}…` : h}</span>)}
          </div>
        )}
      </form>

      {/* 자동 검사 (Figma N23 · 초안 검토): 못 지난 항목은 걸린 말과 함께, 분량 줄에서 다시 만들기 */}
      <AutoChecks check={auto} range={range} onFind={(s) => selectIn(area_.current, s)}
        length={<LengthRow unit={len.unit} max={len.max} limit={neisMax(area, len.unit)} onChange={setLen} form={regenId}
          actions={<Button type="submit" form={regenId} size="sm" kind="outline" disabled={regenerating}>{regenerating ? "다시 만드는 중…" : "이 분량으로 다시 만들기"}</Button>} />}>
        {regen.error && <p className="text-[13px] text-bad" role="alert">{regen.error}</p>}
        {regen.done && <p className="text-[13px] text-ok" role="status">{regen.done}</p>}
      </AutoChecks>
      <form id={regenId} action={regenAction} className="hidden"><input type="hidden" name="jobId" value={jobId} /></form>

      <label className="flex items-center gap-2 rounded-field bg-soft px-3.5">
        <MessageSquare size={16} className="text-mute" />
        <input form={formId} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="반려 사유 (반려할 때 필수)" className="h-11 w-full bg-transparent text-[14px] outline-none" />
      </label>
      {c.length.reason === "too_long" && (
        <OverApproval form={formId} value={c.length.value} max={range.max} unit={UNIT_LABEL[range.unit]} checked={allowOver} onChange={setAllowOver} />
      )}
      {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
      {save.saved && <p className="text-sm text-ok" role="status">{save.saved === "finalized" ? "확정했어요 · 새 버전으로 남았어요" : save.saved === "rejected" ? "반려했어요 · 사유가 남았어요" : "고친 내용을 새 버전으로 저장했어요"}</p>}
      <div className="flex justify-end gap-2">
        <Button form={formId} name="intent" value="rejected" kind="outline" disabled={saving || !reason.trim()}>반려</Button>
        <Button form={formId} name="intent" value="draft" kind="soft" disabled={saving || !text.trim()}>직접 수정</Button>
        <Button form={formId} name="intent" value="finalized" disabled={saving || (!!c.hardFail && !(c.hardFail === "분량 초과" && allowOver))}><Check size={16} /> {finalized ? "다시 확정" : "확정"}</Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-mute"><ShieldCheck size={14} /> 선생님이 확정한 초안만 담임 선생님께 전달돼요</p>
    </div>
  );
}
