"use client";
import { startTransition, useActionState, useState } from "react";
import { Check, FileText, ListChecks, Send, ShieldCheck, Upload } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { MAX_ANSWER_CHARS, type Question } from "@/lib/domain/program";
import { Collapse, DeleteConfirm, DeleteFileButton, LockNote, useDelayedDelete } from "@/components/materials/delete-file";
import { deleteMyDoc, docCheckAction, hintAction, saveSurvey, uploadMyDoc, type DocCheckState, type DocState, type HintState, type SurveyState } from "./actions";

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
  myDocs: { id: string; name: string; mine: boolean }[];
  deadline: string;
  closed: boolean;
  aiOn: boolean;
}) {
  const [state, action, saving] = useActionState<SurveyState, FormData>(saveSurvey, {});
  const [hint, hintRun, hinting] = useActionState<HintState, FormData>(hintAction, {});
  const [doc, docAction, uploading] = useActionState<DocState, FormData>(uploadMyDoc, {});
  const [check, checkRun, checking] = useActionState<DocCheckState, FormData>(docCheckAction, {});
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  // N33 내 파일 지우기: 마감 전 내가 올린 파일만 × → 행 확인 → 바로 지우고 3초 알림 (되돌리기 없음)
  const [asking, setAsking] = useState<string | null>(null);
  const del = useDelayedDelete((ids) => {
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("materialId", ids[0]);
    return deleteMyDoc(fd);
  }, { undo: false, label: () => "파일을 지웠어요" });
  const docsShown = myDocs.filter((d) => !del.isHidden(d.id));
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
  const runCheck = () => {
    const fd = new FormData();
    fd.set("programId", programId);
    startTransition(() => checkRun(fd));
  };
  const askCount = hint.asks ? Object.values(hint.asks).filter((a) => a.length).length : 0;

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
            <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", (hint.label ?? (aiOn ? "AI" : "자동")) === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{hint.label ?? (aiOn ? "AI" : "자동")}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">작성 도우미</div>
              <div className="truncate text-[13px] text-sub">
                {hinting ? "읽는 중이에요" : hint.error ?? (hint.asks ? `문항마다 더 쓸 수 있는 질문을 ${askCount}곳에 달았어요` : "대신 써 주지 않아요. 더 쓸 수 있는 것을 질문으로 알려 줘요")}
              </div>
            </div>
            <Button type="button" kind="outline" size="sm" onClick={runHint} disabled={hinting}>{hinting ? "보는 중…" : hint.asks ? "다시 보기" : "힌트 보기"}</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {survey && (
            <form id={formId} action={action} className="flex flex-col gap-4">
              <input type="hidden" name="programId" value={programId} />
              <div>
                <div className="flex justify-between text-[13px] font-bold"><span>설문 응답</span><span className="font-medium text-sub">{done} / {questions.length} 문항</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-key" style={{ width: `${(done / Math.max(1, questions.length)) * 100}%` }} /></div>
              </div>
              {questions.map((q, i) => {
                const a = answers[q.id] ?? "";
                const err = state.errors?.[q.id];
                return (
                  <section key={q.id} className="surface rounded-card p-5 md:p-6">
                    <h3 className="flex items-baseline gap-2"><span className="text-[13px] font-bold text-mute">Q{i + 1}</span><span className="text-[17px] font-bold">{q.fixed ? q.title : q.prompt}</span></h3>
                    {q.fixed && <p className="mt-2 text-[14px] text-sub">{q.prompt}</p>}
                    <label className={cx("mt-3 flex flex-col rounded-field bg-white p-4 focus-within:ring-2 focus-within:ring-key", err && "ring-2 ring-bad")}>
                      <textarea name={`q_${q.id}`} value={a} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} disabled={closed}
                        rows={3} maxLength={MAX_ANSWER_CHARS} placeholder="떠오르는 대로 편하게 적어도 괜찮아요" aria-label={`Q${i + 1} 답`}
                        className="w-full resize-y bg-transparent text-[15px] leading-7 outline-none placeholder:text-faint" />
                      <span className={cx("self-end text-[12px]", a.trim().length < q.minChars ? "text-mute" : "text-ok")}>
                        {a.trim().length < q.minChars ? `${q.minChars}자 이상 · ` : ""}{a.length} / {MAX_ANSWER_CHARS}자
                      </span>
                    </label>
                    {err && <p className="mt-1.5 text-[13px] text-bad">{err}</p>}
                    {!closed && hint.asks?.[q.id]?.length ? (
                      <div className="mt-2.5 rounded-inner bg-white/60 px-3.5 py-2.5">
                        <p className="text-[12px] font-bold text-sub">이 답에 더 쓸 수 있는 것</p>
                        <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-sub">{hint.asks[q.id].map((x) => <li key={x}>· {x}</li>)}</ul>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </form>
          )}

          {docs && (
            <section className="surface rounded-card p-5 md:p-6">
              <h3 className="mb-3 text-[17px] font-bold">{docTitle} 제출</h3>
              {!closed && (
                <form action={docAction} key={doc.n ?? 0} className="flex flex-col gap-2">
                  <input type="hidden" name="programId" value={programId} />
                  <label className={cx("flex cursor-pointer flex-col items-center gap-2 rounded-inner bg-white px-4 py-6 text-center", fileName && "ring-2 ring-key")}>
                    <span className="flex size-10 items-center justify-center rounded-field bg-soft"><Upload size={18} /></span>
                    <span className="font-bold">{fileName || <><span className="hidden md:inline">파일을 끌어다 놓거나 선택하세요</span><span className="md:hidden">파일 선택 또는 사진 찍기</span></>}</span>
                    <span className="text-[12px] text-mute">PDF · HWPX · JPG · PNG · 20MB까지</span>
                    <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,.hwpx" className="sr-only"
                      onChange={(e) => setPicked({ n: doc.n ?? 0, name: e.target.files?.[0]?.name ?? "" })} />
                  </label>
                  {fileName && <Button size="sm" kind={survey ? "outline" : "primary"} disabled={uploading} className="self-end">{uploading ? "올리는 중…" : "올리기"}</Button>}
                  {doc.error && <p className="text-[13px] text-bad" role="alert">{doc.error}</p>}
                </form>
              )}
              {myDocs.length > 0 && (
                <ul className="mt-2 flex flex-col">
                  {myDocs.map((d) => (
                    <Collapse key={d.id} as="li" hidden={del.isHidden(d.id)}>
                      <div className="pb-2">
                        {asking === d.id ? (
                          <DeleteConfirm title="이 파일을 지울까요?" sub={`${d.name} · 마감 전엔 다시 올릴 수 있어요`} tone="bg-white"
                            onCancel={() => setAsking(null)} onConfirm={() => { setAsking(null); del.remove([d.id]); }} />
                        ) : (
                          <div className={cx("flex items-center gap-2 rounded-inner bg-white pl-4 text-[14px] font-medium", !closed && d.mine ? "py-2 pr-2" : "py-3 pr-4")}>
                            <FileText size={16} className="shrink-0" /> <span className="min-w-0 flex-1 truncate">{d.name}</span>
                            {!closed && d.mine ? <DeleteFileButton icon="x" fileName={d.name} onClick={() => setAsking(d.id)} /> : <Check size={16} className="text-ok" />}
                          </div>
                        )}
                      </div>
                    </Collapse>
                  ))}
                </ul>
              )}
              {closed && docsShown.length > 0 && <LockNote />}
              {!closed && (
                <div className="mt-2 rounded-inner bg-white px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cx("rounded-chip px-2 py-0.5 text-[11px] font-bold", (check.label ?? (aiOn ? "AI" : "자동")) === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{check.label ?? (aiOn ? "AI" : "자동")}</span>
                    <span className="flex-1 text-[13px] font-bold">빠진 항목 점검</span>
                    <Button type="button" kind="outline" size="sm" onClick={runCheck} disabled={checking}><ListChecks size={14} /> {checking ? "보는 중…" : check.checks ? "다시 점검" : "점검하기"}</Button>
                  </div>
                  {checking && <p className="mt-2 text-[12px] text-mute">읽는 중이에요</p>}
                  {check.error && !checking && <p className="mt-2 text-[12px] text-mute">{check.error}</p>}
                  {check.checks && !checking && (
                    <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                      {check.checks.map((c) => (
                        <li key={c.kind} className="flex flex-col gap-0.5">
                          <span className="font-medium">{c.kind} · <span className={c.uploaded ? "text-ok" : "text-bad"}>{c.uploaded ? "올림" : "아직 안 올림"}</span></span>
                          {c.missing.length > 0 && <span className="text-sub">빠진 것: {c.missing.join(" · ")}</span>}
                          {c.uploaded && !c.missing.length && !c.checklist.length && <span className="text-ok">빠진 항목이 없어요</span>}
                          {c.checklist.length > 0 && <span className="text-sub">{c.uploaded ? "파일 안에 있는지 직접 확인해요" : "올리기 전에 확인해요"}: {c.checklist.join(" · ")}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="mt-2 flex items-center gap-1.5 rounded-inner bg-white px-3.5 py-2.5 text-[12px] text-sub"><ShieldCheck size={14} /> 이름·학번은 선생님께 보내기 전 자동으로 가려져요</p>
            </section>
          )}
        </div>

        {/* 좌우 카드 높이 맞춤: 카드는 끝까지, 안의 내용은 스크롤을 따라온다 */}
        <aside>
          <section className="h-full surface rounded-card p-5 md:p-6">
            <div className="md:sticky md:top-6">
            <h3 className="mb-3 text-[17px] font-bold">제출 현황</h3>
            <dl className="flex flex-col gap-2.5 text-[14px]">
              {survey && <div className="flex justify-between"><dt className="text-mute">설문 응답</dt><dd className="font-bold">{submitted ? "제출 완료" : `${done} / ${questions.length} 문항`}</dd></div>}
              {docs && <div className="flex justify-between"><dt className="text-mute">{docTitle}</dt><dd className="font-bold">{docsShown.length}개 업로드</dd></div>}
              <div className="flex justify-between"><dt className="text-mute">마감</dt><dd className="font-bold">{deadline}</dd></div>
            </dl>
            {state.error && <p className="mt-3 text-[13px] text-bad" role="alert">{state.error}</p>}
            {state.saved && <p className="mt-3 text-[13px] text-ok" role="status">{state.saved === "submit" ? "제출했어요. 마감 전까지 고칠 수 있어요" : "임시 저장했어요"}</p>}
            {survey && <div className="mt-4 flex flex-col gap-2">{buttons()}</div>}
            {closed && <p className="mt-3 text-[13px] text-mute">마감됐어요</p>}
            </div>
          </section>
        </aside>
      </div>
      {del.snackbar}
    </div>
  );
}
