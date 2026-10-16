"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { login, type FormState } from "../actions";

const INPUT = "h-13 w-full rounded-field bg-soft px-4 text-base outline-none placeholder:text-mute focus:ring-2 focus:ring-key";

export function LoginForm() {
  const [kind, setKind] = useState<"student" | "teacher">("student");
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  const student = kind === "student";

  return (
    <form action={action} className="flex flex-col gap-6">
      <h1 className="text-[26px] font-bold lg:text-[28px]">로그인</h1>
      <div className="flex gap-1 rounded-full bg-soft p-1" role="tablist">
        {(["student", "teacher"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cx("h-11 flex-1 rounded-full text-[15px]", kind === k ? "bg-white font-bold text-key" : "font-medium text-mute")}
          >
            {k === "student" ? "학생" : "선생님"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">{student ? "학번" : "이름"}</span>
          <input
            name="loginId"
            placeholder={student ? "예: 20312" : "예: 이서연"}
            inputMode={student ? "numeric" : "text"}
            autoComplete="username"
            required
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">비밀번호</span>
          <span className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              placeholder="비밀번호"
              autoComplete="current-password"
              required
              className={cx(INPUT, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-pressed={show}
              className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-mute"
            >
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </span>
        </label>
      </div>

      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button disabled={pending} className="h-13 font-bold">
        {pending ? "확인 중…" : "로그인"}
      </Button>

      <p className="flex items-center gap-2.5 rounded-inner bg-key-soft px-4 py-3.5 text-[13px] text-sub">
        <Info size={18} className="shrink-0 text-key" />
        처음이면 학교에서 받은 인증코드로 로그인해요
      </p>

      <div className="text-center">
        <button type="button" onClick={() => setForgot((f) => !f)} aria-expanded={forgot} className="text-[13px] font-medium text-mute">
          비밀번호를 잊었어요
        </button>
        {forgot && <p className="mt-2 text-[13px] text-sub">관리자 선생님께 초기화를 요청해 주세요</p>}
        {!student && (
          <p className="mt-3 text-[13px] text-mute">
            처음이신가요? <Link href="/signup" className="font-medium text-key">교사 가입</Link>
          </p>
        )}
      </div>
    </form>
  );
}
