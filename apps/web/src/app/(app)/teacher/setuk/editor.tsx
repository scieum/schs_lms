"use client";
import { useActionState, useState } from "react";
import { LengthPicker } from "@/components/length-picker";
import { Button, cx } from "@/components/ui";
import { checkLength, measure, resolveLength, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { saveSetuk, type SetukState } from "./actions";

// 세특 쓰기: 본문 + 분량(단위·최대) + 실시간 분량 막대 + 임시 저장 / 확정
export function SetukEditor({
  courseId,
  studentId,
  initial,
  unit: initialUnit,
  max: initialMax,
  confirmed,
}: {
  courseId: string;
  studentId: string;
  initial: string;
  unit: LengthUnit;
  max: number;
  confirmed: boolean;
}) {
  const [state, action, pending] = useActionState<SetukState, FormData>(saveSetuk, {});
  const [text, setText] = useState(initial);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const range = resolveLength("세특", len);
  const now = measure(text, range.unit);
  const check = checkLength(text, range);
  const pct = Math.min(100, Math.round((now / range.max) * 100));
  const over = check.reason === "too_long";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="studentId" value={studentId} />
      <textarea
        name="content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={9}
        maxLength={5000}
        placeholder="수업 중 관찰한 활동·탐구·태도를 '~함.'으로 끝나는 문장으로 써 주세요"
        className="w-full resize-y rounded-field bg-white p-4 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-key"
        aria-label="세특 내용"
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className={cx("font-medium", over ? "text-bad" : check.reason === "too_short" ? "text-wait" : "text-ok")}>
            {over ? "분량 초과" : check.reason === "too_short" ? `최소 ${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}` : "분량 적당"}
          </span>
          <span className="font-bold">
            {now.toLocaleString()} / {range.max.toLocaleString()}
            {UNIT_LABEL[range.unit]}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className={cx("h-full rounded-full", over ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <LengthPicker category="세특" defaultUnit={initialUnit} defaultMax={initialMax} onChange={setLen} />

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
        <Button name="intent" value="confirmed" disabled={pending || over || !text.trim()} className="flex-1">
          {confirmed ? "다시 확정" : "확정"}
        </Button>
      </div>
    </form>
  );
}
