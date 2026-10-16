"use client";
import { useActionState, useState } from "react";
import { Button, Field } from "@/components/ui";
import { changeMyPassword, updateCareer, type MeState } from "./actions";

/** 희망 진로 입력 */
export function CareerForm({ current, onDone }: { current: string | null; onDone?: () => void }) {
  const [state, action, pending] = useActionState<MeState, FormData>(async (p, f) => {
    const r = await updateCareer(p, f);
    if (r.ok && !r.error) onDone?.();
    return r;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input name="careerGoal" defaultValue={current ?? ""} maxLength={40} placeholder="예: 산업디자인" aria-label="희망 진로"
          className="min-w-0 flex-1 rounded-field bg-white px-4 py-2.5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-key" />
        <Button kind="outline" size="sm" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
      </div>
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.ok && !state.error && <p className="text-[13px] text-ok" role="status">바꿨어요. 추천도 새 진로로 바뀌어요</p>}
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<MeState, FormData>(changeMyPassword, {});
  return (
    <form action={action} key={state.ok ?? 0} className="flex flex-col gap-3">
      <Field name="current" type="password" label="지금 비밀번호" autoComplete="current-password" required />
      <Field name="password" type="password" label="새 비밀번호" autoComplete="new-password" minLength={8} required />
      <Field name="confirm" type="password" label="한 번 더" autoComplete="new-password" required />
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.ok && !state.error && <p className="text-[13px] text-ok" role="status">비밀번호를 바꿨어요</p>}
      <Button disabled={pending}>{pending ? "바꾸는 중…" : "비밀번호 바꾸기"}</Button>
    </form>
  );
}

/** 접었다 펴는 진로 바꾸기 (추천 화면 머리 버튼) */
export function CareerToggle({ current, label = "희망 진로 바꾸기" }: { current: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="w-full max-w-sm"><CareerForm current={current} onDone={() => setOpen(false)} /></div>
  ) : (
    <Button kind="outline" size="sm" onClick={() => setOpen(true)}>{label}</Button>
  );
}
