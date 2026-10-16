"use client";
import { useActionState, useState } from "react";
import { Button, Toggle } from "@/components/ui";
import { createOffering, openRound, updateRound, type OfferingFormState } from "./actions";

const INPUT = "h-12 w-full rounded-field bg-white px-3.5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-key";
const FIELDS = ["국어", "수학", "영어", "사회", "과학", "체육", "예술", "기술", "외국어", "교양"];

function Msg({ state }: { state: OfferingFormState }) {
  if (state.error) return <p className="text-sm text-bad" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-ok" role="status">{state.done}</p>;
  return null;
}

/** Figma A6 "새 과목": 과목 이름 → 학점(2·3·4) → 정원 → 과목 열기. 편제표 과목은 이름 목록에서 고른다 */
export function NewOfferingForm({ roundId, courseNames }: { roundId: string; courseNames: string[] }) {
  const [state, action, pending] = useActionState<OfferingFormState, FormData>(createOffering, {});
  const [credits, setCredits] = useState("2");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="roundId" value={roundId} />
      <input name="subject" list="offering-courses" required maxLength={30} placeholder="과목 이름" aria-label="과목 이름" className={INPUT} />
      <datalist id="offering-courses">
        {courseNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <Toggle name="credits" value={credits} onChange={setCredits} options={[["2", "2학점"], ["3", "3학점"], ["4", "4학점"]]} />
      <input name="capacity" type="number" min={1} max={200} required placeholder="정원 (예: 30)" aria-label="한 반 정원" className={INPUT} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">분야 (편제표 과목이면 자동)</span>
        <select name="field" defaultValue="" className={INPUT}>
          <option value="">자동</option>
          {FIELDS.map((f) => <option key={f}>{f}</option>)}
        </select>
      </label>
      <Msg state={state} />
      <Button disabled={pending}>{pending ? "여는 중…" : "과목 열기"}</Button>
    </form>
  );
}

/** 마감일·최대 학점 */
export function RoundSettingsForm({ id, deadline, maxCredits }: { id: string; deadline: string; maxCredits: number }) {
  const [state, action, pending] = useActionState<OfferingFormState, FormData>(updateRound, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">마감일</span>
          <input name="deadline" type="date" required defaultValue={deadline} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">최대 학점</span>
          <input name="maxCredits" type="number" min={1} max={40} required defaultValue={maxCredits} className={INPUT} />
        </label>
      </div>
      <Msg state={state} />
      <Button kind="outline" disabled={pending}>{pending ? "저장하는 중…" : "저장"}</Button>
    </form>
  );
}

/** 이 학년의 과목 신청 열기 */
export function OpenRoundForm({ grade, defaultDeadline }: { grade: number; defaultDeadline: string }) {
  const [state, action, pending] = useActionState<OfferingFormState, FormData>(openRound, {});
  const [semester, setSemester] = useState("2");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="grade" value={grade} />
      <Toggle name="semester" value={semester} onChange={setSemester} options={[["1", "1학기"], ["2", "2학기"]]} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">마감일</span>
          <input name="deadline" type="date" required defaultValue={defaultDeadline} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">최대 학점</span>
          <input name="maxCredits" type="number" min={1} max={40} required defaultValue={16} className={INPUT} />
        </label>
      </div>
      <Msg state={state} />
      <Button disabled={pending}>{pending ? "여는 중…" : `${grade}학년 신청 열기`}</Button>
    </form>
  );
}
