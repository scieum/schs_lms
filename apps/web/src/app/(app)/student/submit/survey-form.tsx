"use client";
import { startTransition, useActionState, useState } from "react";
import { Check, FileText, Send, ShieldCheck, Upload } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { MAX_ANSWER_CHARS, type Question } from "@/lib/domain/program";
import { hintAction, saveSurvey, uploadMyDoc, type DocState, type HintState, type SurveyState } from "./actions";

// S2 설문·서류 제출 (Figma 50:1116 / 50:1264)
export function SurveyForm({
  programId, questions, initial, submittedAt, survey, docs, docTitle, myDocs, deadline, closed, aiOn,
}: {
  programId: string;
  questions: Question[];
  initial: Record<string, string>;
  submittedAt: string | null;
  survey: boolean;
  docs: boolean;
  docTitle: string;
  myDocs: { id: string; name: string }[];
  deadline: string;
  closed: boolean;
  aiOn: boolean;
}) {
  const [state, action, saving] = useActionState<SurveyState, FormData>(saveSurvey, {});
  const [hint, hintRun, hinting] = useActionState<HintState, FormData>(hintAction, {});
  const [doc, docAction, uploading] = useActionState<DocState, FormData>(uploadMyDoc, {});
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [picked, setPicked] = useState({ n: 0, name: "" });
  const fileName = picked.n === (doc.n ?? 0) ? picked.name : "";
  const done = questions.filter((q) => (answers[q.id] ?? "").trim().length >= q.minChars).length;
  const formId = `survey-${programId}`;
  const submitted = !!submittedAt || state.saved === "submit";

  const runHint = () => {
    const fd = new FormData();
    fd.set("programId", programId);
    for (const q of questions) fd.set(`q_${q.id}`, answers[q.id] ?? "");
    startTransition(() => hintRun(fd));
  };

  const buttons = (cls?: string) => (
    <>
      <Button form={formId} name="intent" value="submit" disabled={saving || closed} className={cls}><Send size={15} /> {submitted ? "다시 제출하기" : "제출하기"}</Button>
      <Button form={formId} name="intent" value="draft" kind="outline" disabled={saving || closed} className={cls}>임시 저장</Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {survey && !closed && (
        <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", aiOn ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{hint.label ?? (aiOn ? "AI" : "자동")}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">작성 도우미</div>
              <div className="truncate text-[13px] text-sub">{hint.hints?.[0] ?? "대신 써 주지 않아요. 무엇을 더 쓰면 좋을지 힌트만 줘요"}</div>
            </div>
            <Button type="button" kind="outline" size="sm" onClick={runHint} disabled={hinting}>{hinting ? "보는 중…" : hint.hints ? "힌트 더 보기" : "힌트 보기"}</Button>
          </div>
          {hint.hints && hint.hints.length > 1 && (
            <ul className="mt-2 flex flex-col gap-1 pl-12 text-[13px] text-sub">{hint.hints.slice(1).map((h) => <li key={h}>· {h}</li>)}</ul>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {survey && (
            <form id={formId} action={action} className="flex flex-col gap-4">
              <input type="hidden" name="programId" value={programId} />
              <div>
                <div className="flex justify-between text-[13px] font-bold"><span>설문 응답</span><span className="font-medium text-sub">{done} / {questions.length} 문항</span></div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-key" style={{ width: `${(done / Math.max(1, questions.length)) * 100}%` }} /></div>
              </div>
              {questions.map((q, i) => {
                const a = answers[q.id] ?? "";
                const err = state.errors?.[q.id];
                return (
                  <section key={q.id} className="rounded-card bg-soft p-5">
                    <h3 className="flex items-baseline gap-2"><span className="text-[13px] font-bold text-mute">Q{i + 1}</span><span className="text-[17px] font-bold">{q.fixed ? q.title : q.prompt}</span></h3>
                    {q.fixed && <p className="mt-1 text-[13px] text-sub">{q.prompt}</p>}
                    <label className={cx("mt-3 flex flex-col rounded-field bg-white p-3.5 focus-within:ring-2 focus-within:ring-key", err && "ring-2 ring-bad")}>
                      <textarea name={`q_${q.id}`} value={a} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} disabled={closed}
                        rows={3} maxLength={MAX_ANSWER_CHARS} placeholder="떠오르는 대로 편하게 적어도 괜찮아요" aria-label={`Q${i + 1} 답`}
                        className="w-full resize-y bg-transparent text-[15px] leading-7 outline-none placeholder:text-faint" />
                      <span className={cx("self-end text-[12px]", a.trim().length < q.minChars ? "text-mute" : "text-ok")}>
                        {a.trim().length < q.minChars ? `${q.minChars}자 이상 · ` : ""}{a.length} / {MAX_ANSWER_CHARS}자
                      </span>
                    </label>
                    {err && <p className="mt-1.5 text-[13px] text-bad">{err}</p>}
                  </section>
                );
              })}
            </form>
          )}

          {docs && (
            <section className="rounded-card bg-soft p-5">
              <h3 className="mb-3 text-[17px] font-bold">{docTitle} 제출</h3>
              {!closed && (
                <form action={docAction} key={doc.n ?? 0} className="flex flex-col gap-2">
                  <input type="hidden" name="programId" value={programId} />
                  <label className={cx("flex cursor-pointer flex-col items-center gap-2 rounded-inner bg-white px-4 py-6 text-center", fileName && "ring-2 ring-key")}>
                    <span className="flex size-10 items-center justify-center rounded-field bg-soft"><Upload size={18} /></span>
                    <span className="font-bold">{fileName || "파일을 골라 주세요"}</span>
                    <span className="text-[12px] text-mute">PDF · JPG · PNG · 20MB까지</span>
                    <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" className="sr-only"
                      onChange={(e) => setPicked({ n: doc.n ?? 0, name: e.target.files?.[0]?.name ?? "" })} />
                  </label>
                  {fileName && <Button size="sm" kind={survey ? "outline" : "primary"} disabled={uploading} className="self-end">{uploading ? "올리는 중…" : "올리기"}</Button>}
                  {doc.error && <p className="text-[13px] text-bad" role="alert">{doc.error}</p>}
                </form>
              )}
              {myDocs.length > 0 && (
                <ul className="mt-2 flex flex-col gap-2">
                  {myDocs.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-inner bg-white px-4 py-3 text-[14px] font-medium">
                      <FileText size={16} className="shrink-0" /> <span className="min-w-0 flex-1 truncate">{d.name}</span> <Check size={16} className="text-ok" />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 flex items-center gap-1.5 rounded-inner bg-white px-3.5 py-2.5 text-[12px] text-sub"><ShieldCheck size={14} /> 이름·학번은 선생님께 보내기 전 자동으로 가려져요</p>
            </section>
          )}
        </div>

        <aside className="md:sticky md:top-6 md:self-start">
          <section className="rounded-card bg-soft p-5">
            <h3 className="mb-3 text-[17px] font-bold">제출 현황</h3>
            <dl className="flex flex-col gap-2.5 text-[14px]">
              {survey && <div className="flex justify-between"><dt className="text-mute">설문 응답</dt><dd className="font-bold">{submitted ? "제출 완료" : `${done} / ${questions.length} 문항`}</dd></div>}
              {docs && <div className="flex justify-between"><dt className="text-mute">{docTitle}</dt><dd className="font-bold">{myDocs.length}개 업로드</dd></div>}
              <div className="flex justify-between"><dt className="text-mute">마감</dt><dd className="font-bold">{deadline}</dd></div>
            </dl>
            {state.error && <p className="mt-3 text-[13px] text-bad" role="alert">{state.error}</p>}
            {state.saved && <p className="mt-3 text-[13px] text-ok" role="status">{state.saved === "submit" ? "제출했어요. 마감 전까지 고칠 수 있어요" : "임시 저장했어요"}</p>}
            {survey && <div className="mt-4 hidden flex-col gap-2 md:flex">{buttons()}</div>}
            {closed && <p className="mt-3 text-[13px] text-mute">마감됐어요</p>}
          </section>
        </aside>
      </div>
      {survey && !closed && <div className="sticky bottom-24 z-10 flex gap-2 md:hidden">{buttons("flex-1")}</div>}
    </div>
  );
}
