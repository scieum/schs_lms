"use client";
import { useActionState, useState, useTransition } from "react";
import { Download, MessageSquare } from "lucide-react";
import { Button, ButtonLink, Card, Tag } from "@/components/ui";
import { addAiInterest } from "../recs/actions";
import { nextYearAction, requestCorrection, summarizeMyRecord, type CorrectionState, type KeywordResult, type NextTopics } from "./actions";

export function PrintButton() {
  return (
    <Button kind="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Download size={16} /> PDF로 저장
    </Button>
  );
}

/** AI 기록 요약 배너 + 다음 학년에 이어갈 주제. 눌렀을 때만 부른다. 주제는 "관심에 담기"를 눌러야 담긴다 */
export function RecordAi({ grade, disabled, aiOn }: { grade: number; disabled?: boolean; aiOn: boolean }) {
  const [pending, start] = useTransition();
  const [nextPending, startNext] = useTransition();
  const [r, setR] = useState<KeywordResult | null>(null);
  const [next, setNext] = useState<NextTopics | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const label = r?.ok ? r.label : aiOn ? "AI" : "자동";
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
        <span className={label === "AI" ? "rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new" : "rounded-chip bg-key-soft px-2.5 py-1 text-xs font-bold text-key-strong"}>{label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">기록 요약</div>
          <div className="truncate text-[13px] text-sub">
            {pending ? "읽는 중이에요" : r?.ok ? (r.keywords.length ? `키워드: ${r.keywords.join(" · ")}` : "자주 나온 낱말이 없어요") : "확정 기록에서 키워드와 다음 학년에 이어갈 주제를 찾아요"}
          </div>
        </div>
        {r?.ok ? (
          <Button kind="outline" size="sm" disabled={nextPending || disabled} onClick={() => startNext(async () => setNext(await nextYearAction(grade)))}>
            {nextPending ? "찾는 중…" : next?.ok ? "다시 찾기" : "다음 학년 주제"}
          </Button>
        ) : (
          <Button kind="outline" size="sm" disabled={pending || disabled} onClick={() => start(async () => setR(await summarizeMyRecord(grade)))}>
            {pending ? "찾는 중…" : "요약 보기"}
          </Button>
        )}
      </div>
      {r && !r.ok && <p className="px-1 text-[13px] text-bad" role="alert">{r.error}</p>}
      {r?.ok && r.topics.length > 0 && !next?.ok && <p className="px-1 text-[13px] text-sub">이어갈 주제: {r.topics.join(" · ")}</p>}
      {next && !next.ok && <p className="px-1 text-[13px] text-bad" role="alert">{next.error}</p>}
      {next?.ok && (
        <Card title="다음 학년에 이어갈 주제" action={<Tag tone={next.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{next.label === "AI" ? "추천" : "자동"}</Tag>}>
          <p className="mb-3 text-[13px] text-mute">{next.note ?? "후보예요. 마음에 드는 것만 관심에 담아요"}</p>
          <ul className="flex flex-col gap-2">
            {next.topics.map((t) => {
              const done = added.has(t.title);
              return (
                <li key={t.title} className="flex items-start gap-3 rounded-inner bg-white p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{t.title}</div>
                    <div className="mt-0.5 text-[13px] text-sub">{t.why}</div>
                  </div>
                  <Button size="sm" kind={done ? "soft" : "outline"} className="w-[96px] shrink-0 px-0" disabled={done || nextPending} onClick={() => startNext(async () => {
                    const res = await addAiInterest({ kind: "활동", title: t.title, meta: "다음 학년 주제" });
                    if (res.error) setErr(res.error);
                    else setAdded((s) => new Set(s).add(t.title));
                  })}>
                    {done ? "담았어요" : "관심에 담기"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {err && <p className="mt-2 text-[13px] text-bad" role="alert">{err}</p>}
          <div className="mt-3 flex justify-end"><ButtonLink href="/student/recs" kind="ghost" size="sm">추천 활동 보기</ButtonLink></div>
        </Card>
      )}
    </div>
  );
}

/** 정정 요청: 기록 고르기 + 사유 → 담임에게 요청 저장 */
export function CorrectionForm({ records }: { records: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CorrectionState, FormData>(async (p, f) => {
    const r = await requestCorrection(p, f);
    if (r.sent && !r.error) setOpen(false);
    return r;
  }, {});
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button kind="outline" onClick={() => setOpen(true)} disabled={!records.length} className="w-full print:hidden">
          <MessageSquare size={16} /> 정정 요청하기
        </Button>
        {state.sent && <p className="text-[13px] text-ok" role="status">담임 선생님께 요청을 보냈어요</p>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <select name="recordId" required defaultValue="" aria-label="고칠 기록"
        className="rounded-field bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-key">
        <option value="" disabled>고칠 기록 고르기</option>
        {records.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <textarea name="reason" rows={3} required minLength={5} maxLength={500} placeholder="사실과 다른 부분을 적어 주세요" aria-label="사유"
        className="resize-y rounded-field bg-white p-3 text-sm leading-6 outline-none placeholder:text-faint focus:ring-2 focus:ring-key" />
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="button" kind="ghost" size="sm" onClick={() => setOpen(false)}>취소</Button>
        <Button size="sm" disabled={pending} className="flex-1">{pending ? "보내는 중…" : "담임에게 요청"}</Button>
      </div>
    </form>
  );
}
