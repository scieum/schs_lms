"use client";
import { useActionState, useState } from "react";
import { addCounselRecord, type CounselState } from "@/app/(app)/teacher/counseling/actions";
import { Button, cx } from "@/components/ui";
import { COUNSEL_AREAS, type CounselArea } from "@/lib/domain/counsel";

/** 상담 기록 쓰기 (새 기록 · 고치기 · AI 요약 붙이기 모두 이 폼). 저장은 항상 새 행 추가 (C4) */
export function CounselForm({
  studentId, today, prevId, initial = "", initialArea = "진로", submitLabel = "기록 저장", onSaved, autoFocus,
}: {
  studentId: string;
  today: string;
  prevId?: string;
  initial?: string;
  initialArea?: CounselArea;
  submitLabel?: string;
  onSaved?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [area, setArea] = useState<CounselArea>(initialArea);
  const [state, action, pending] = useActionState<CounselState, FormData>(async (p, f) => {
    const r = await addCounselRecord(p, f);
    if (r.saved && !r.error) {
      setText("");
      onSaved?.();
    }
    return r;
  }, {});

  return (
    <form action={action} className="flex flex-col gap-3 rounded-inner bg-white p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="area" value={area} />
      {prevId && <input type="hidden" name="prevId" value={prevId} />}
      <textarea
        name="content" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} required autoFocus={autoFocus}
        placeholder="오늘 상담 내용을 적어주세요" aria-label="상담 내용"
        className="w-full resize-y bg-transparent text-[15px] leading-7 outline-none placeholder:text-faint"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="radiogroup" aria-label="상담 영역">
          {COUNSEL_AREAS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)}
              className={cx("rounded-chip px-3 py-1.5 text-[13px]", area === a ? "bg-key font-bold text-white" : "bg-soft text-sub hover:bg-line")}>
              {a}
            </button>
          ))}
        </div>
        <input type="date" name="date" defaultValue={today} max={today} required aria-label="상담 날짜"
          className="h-8 rounded-field bg-soft px-2 text-[13px] text-sub outline-none focus:ring-2 focus:ring-key" />
        <span className="flex-1" />
        <Button size="sm" disabled={pending || text.trim().length < 5}>{pending ? "저장하는 중…" : submitLabel}</Button>
      </div>
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.saved && !state.error && !prevId && <p className="text-[13px] text-ok" role="status">저장했어요</p>}
    </form>
  );
}
