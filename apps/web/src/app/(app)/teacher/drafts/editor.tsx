"use client";
import { startTransition, useActionState, useState } from "react";
import { Check, Link2, MessageSquare, ShieldCheck, X } from "lucide-react";
import { LengthPicker } from "@/components/length-picker";
import { Button, cx } from "@/components/ui";
import { resolveLength, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { checkDraft, type EvidenceItem } from "@/lib/domain/program";
import { styleIssues } from "@/lib/domain/neis-style";
import { regenerateDraft, reviewDraftAction, saveDraft, type RegenState, type ReviewState, type SaveState } from "./actions";

// T4 초안 본문 편집 + 자동 검사 + 검토 도우미 + 반려·직접 수정·확정
export function DraftEditor({
  jobId, initial, unit, max, area, people, evidence, aiOn, finalized, tags,
}: {
  jobId: string;
  initial: string;
  unit: LengthUnit;
  max: number;
  area: DraftCategory;
  people: { name: string; studentNo: string }[];
  evidence: EvidenceItem[];
  aiOn: boolean;
  finalized: boolean;
  tags: string[];
}) {
  const [save, saveAction, saving] = useActionState<SaveState, FormData>(saveDraft, {});
  const [regen, regenAction, regenerating] = useActionState<RegenState, FormData>(regenerateDraft, {});
  const [review, reviewAction, reviewing] = useActionState<ReviewState, FormData>(reviewDraftAction, {});
  const [text, setText] = useState(initial);
  const [reason, setReason] = useState("");
  const [applied, setApplied] = useState<string[]>([]);
  const range = resolveLength(area, { unit, max });
  const c = checkDraft(text, { range, people, evidence });
  const pct = Math.min(100, Math.round((c.length.value / range.max) * 100));
  const formId = `save-${jobId}`;
  const items = (review.items ?? []).filter((x) => !applied.includes(x.phrase) && text.includes(x.phrase));

  const runReview = () => {
    const fd = new FormData();
    fd.set("jobId", jobId);
    fd.set("content", text);
    startTransition(() => reviewAction(fd));
  };
  const apply = (phrase: string, suggestion: string) => {
    setText(text.replace(phrase, suggestion).replace(/\s{2,}/g, " ").trim());
    setApplied([...applied, phrase]);
  };

  const style = styleIssues(text).filter((i) => i !== "서술형 어미" && i !== "마침표 없음");
  const checks: [boolean, string][] = [
    [c.length.ok, c.length.reason === "too_long" ? "분량 초과" : c.length.reason === "too_short" ? `최소 ${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}` : "글자수 범위"],
    [c.identity.ok, c.identity.ok ? "학번·실명 0건" : `${c.identity.found.join("·")} 있음`],
    [c.ending.ok, c.ending.ok ? "문장 어미 '~함.'" : `어미 확인 ${c.ending.bad}문장`],
    [c.evidence.ok, `근거 반영 ${c.evidence.hits.length}개`],
    [style.length === 0, style.length ? style.join(" · ") : "문체 규칙"],
  ];

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
        <Button type="button" size="sm" onClick={runReview} disabled={reviewing || !text.trim()}>{reviewing ? "보는 중…" : review.items ? "다시 검토" : "검토 받기"}</Button>
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

      <form id={formId} action={saveAction} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className={cx("rounded-chip px-2.5 py-1 text-xs font-medium", t === "예시" ? "bg-white text-mute" : "bg-soft text-sub")}>{t}</span>)}
        </div>
        <textarea
          name="content" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={5000}
          className="w-full resize-y rounded-inner border border-line bg-white p-4 text-[15px] leading-8 outline-none focus:ring-2 focus:ring-key md:p-5"
          aria-label="초안 본문" placeholder="근거 자료를 보고 '~함.'으로 끝나는 문장으로 써 주세요"
        />
        {c.evidence.hits.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-mute">근거 연결 {c.evidence.hits.length}곳</span>
            {c.evidence.hits.map((h) => <span key={h} className="inline-flex items-center gap-1 rounded-chip bg-soft px-2 py-1 text-sub"><Link2 size={12} /> {h.length > 18 ? `${h.slice(0, 18)}…` : h}</span>)}
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3 rounded-inner bg-soft p-4">
        <div className="flex items-center justify-between text-[14px]">
          <span className={cx("font-bold", c.allOk ? "text-ink" : "text-wait")}>{c.allOk ? "자동 검사 통과" : "자동 검사 확인 필요"}</span>
          <span className="font-bold">{c.length.value.toLocaleString()} / {range.max.toLocaleString()}{range.unit === "bytes" ? "B" : "자"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={cx("h-full rounded-full", c.length.reason === "too_long" ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] md:flex md:flex-wrap md:gap-x-4">
          {checks.map(([ok, label]) => (
            <li key={label} className={cx("flex items-center gap-1", ok ? "text-sub" : "font-medium text-bad")}>
              {ok ? <Check size={14} className="text-ok" /> : <X size={14} />} {label}
            </li>
          ))}
        </ul>
        <form action={regenAction} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="jobId" value={jobId} />
          <LengthPicker category={area} defaultUnit={unit} defaultMax={max} />
          <Button size="sm" kind="soft" disabled={regenerating} className="self-end">{regenerating ? "다시 만드는 중…" : "이 분량으로 다시 만들기"}</Button>
          {regen.error && <p className="text-[13px] text-bad" role="alert">{regen.error}</p>}
          {regen.done && <p className="text-[13px] text-ok" role="status">{regen.done}</p>}
        </form>
      </div>

      <label className="flex items-center gap-2 rounded-field bg-soft px-3.5">
        <MessageSquare size={16} className="text-mute" />
        <input form={formId} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="반려 사유 (반려할 때 필수)" className="h-11 w-full bg-transparent text-[14px] outline-none" />
      </label>
      {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
      {save.saved && <p className="text-sm text-ok" role="status">{save.saved === "finalized" ? "확정했어요 · 새 버전으로 남았어요" : save.saved === "rejected" ? "반려했어요 · 사유가 남았어요" : "고친 내용을 새 버전으로 저장했어요"}</p>}
      <div className="flex justify-end gap-2">
        <Button form={formId} name="intent" value="rejected" kind="outline" disabled={saving || !reason.trim()}>반려</Button>
        <Button form={formId} name="intent" value="draft" kind="soft" disabled={saving || !text.trim()}>직접 수정</Button>
        <Button form={formId} name="intent" value="finalized" disabled={saving || !!c.hardFail}><Check size={16} /> {finalized ? "다시 확정" : "확정"}</Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[12px] text-mute"><ShieldCheck size={14} /> 선생님이 확정한 초안만 담임 선생님께 전달돼요</p>
    </div>
  );
}
