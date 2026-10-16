"use client";
import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { changePassword, type FormState } from "../actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="password" type="password" label="새 비밀번호" autoComplete="new-password" minLength={8} required className="[&_input]:bg-soft" />
      <Field name="confirm" type="password" label="한 번 더" autoComplete="new-password" required className="[&_input]:bg-soft" />
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button disabled={pending} className="mt-2">{pending ? "바꾸는 중…" : "바꾸고 시작하기"}</Button>
    </form>
  );
}
