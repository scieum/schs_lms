"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/domain/password";
import { signup, type SignupState } from "./actions";

const INPUT = "h-13 w-full rounded-field bg-soft px-4 text-base outline-none placeholder:text-mute focus:ring-2 focus:ring-key";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-sub">{label}</span>
      {children}
    </label>
  );
}

// 로그인 화면(Figma 103:33)과 같은 모양: 제목 → 입력 → 큰 버튼 → 안내 한 줄
export function SignupForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, undefined);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-bold lg:text-[28px]">교사 가입</h1>
        {first && (
          <p className="w-fit rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">첫 가입자는 관리자가 돼요</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Labeled label="이름 (로그인 ID)">
          <input name="name" placeholder="예: 영랑이" autoComplete="username" required maxLength={20} className={INPUT} />
        </Labeled>
        <Labeled label="비밀번호">
          <span className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              placeholder={`${PASSWORD_MIN}자 이상`}
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
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
        </Labeled>
        <Labeled label="비밀번호 확인">
          <input name="confirm" type={show ? "text" : "password"} placeholder="한 번 더" autoComplete="new-password" required className={INPUT} />
        </Labeled>
        <Labeled label="학교 인증코드">
          <input name="code" placeholder="교육과정부에서 받은 코드" autoComplete="off" required className={INPUT} />
        </Labeled>
      </div>

      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button disabled={pending} className="h-13 font-bold">
        {pending ? "가입하는 중…" : "가입하고 시작하기"}
      </Button>

      <p className="flex items-center gap-2.5 rounded-inner bg-key-soft px-4 py-3.5 text-[13px] text-sub">
        <Info size={18} className="shrink-0 text-key" />
        역할·담임 반은 관리자 선생님이 정해요
      </p>

      <p className="text-center text-[13px] text-mute">
        이미 계정이 있나요? <Link href="/login" className="font-medium text-key">로그인</Link>
      </p>
    </form>
  );
}
