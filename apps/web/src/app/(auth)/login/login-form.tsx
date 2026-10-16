"use client";
import { useActionState, useState } from "react";
import { Button, Field, cx } from "@/components/ui";
import { login, type FormState } from "../actions";

export function LoginForm() {
  const [kind, setKind] = useState<"student" | "teacher">("student");
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-control bg-soft p-1" role="tablist">
        {(["student", "teacher"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cx("flex-1 rounded-chip py-2.5 text-sm", kind === k ? "bg-white font-bold text-key" : "text-mute")}
          >
            {k === "student" ? "학생" : "선생님"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <Field
        name="loginId"
        label={kind === "student" ? "학번" : "이름"}
        placeholder={kind === "student" ? "예: 20312" : "예: 이서연"}
        inputMode={kind === "student" ? "numeric" : "text"}
        autoComplete="username"
        required
        className="[&_input]:bg-soft"
      />
      <Field name="password" type="password" label="비밀번호" autoComplete="current-password" required className="[&_input]:bg-soft" />
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button disabled={pending} className="mt-2">{pending ? "확인 중…" : "로그인"}</Button>
      <p className="text-center text-[13px] text-mute">비밀번호를 잊으면 관리자 선생님께 초기화를 요청해 주세요</p>
    </form>
  );
}
