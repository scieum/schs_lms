"use client";
import { useActionState, useState } from "react";
import { Avatar, Button, Card, Field, Row, Tag, cx } from "@/components/ui";
import { registerOne, type OneState } from "../actions";

export function OneForm() {
  const [state, action, pending] = useActionState<OneState, FormData>(registerOne, { history: [] });
  const [grade, setGrade] = useState("2");
  const added = state.history;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
      <Card title="학생 정보">
        {/* 추가에 성공하면 key가 바뀌어 입력칸이 비워진다 */}
        <form key={added.length} action={action} className="flex flex-col gap-4">
          <Field name="name" label="이름" required maxLength={20} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">학년</span>
            <input type="hidden" name="grade" value={grade} />
            <div className="flex gap-1 rounded-control bg-white p-1">
              {["1", "2", "3"].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  aria-pressed={grade === g}
                  className={cx("flex-1 rounded-chip py-2.5 text-sm", grade === g ? "bg-key font-bold text-white" : "text-mute")}
                >
                  {g}학년
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field name="classNo" label="반" inputMode="numeric" required placeholder="3" />
            <Field name="number" label="번호" inputMode="numeric" required placeholder="31" />
          </div>
          <Field name="birthDate" label="생년월일" required placeholder="2009-03-14" />
          {state.problems && <p className="text-sm text-bad" role="alert">{state.problems.join(" · ")}</p>}
          {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
          <Button disabled={pending}>{pending ? "추가하는 중…" : "추가하기"}</Button>
          <p className="text-[13px] text-mute">첫 비밀번호는 공통 인증코드로 발급되고, 첫 로그인 때 바꾸게 돼요</p>
        </form>
      </Card>
      <Card title="방금 추가한 학생">
        {added.length === 0 ? (
          <p className="text-sm text-mute">아직 없어요</p>
        ) : (
          added.map((a, i) => (
            <Row key={a.id} last={i === added.length - 1} lead={<Avatar name={a.name} />} title={a.name} meta={a.meta} right={<Tag>완료</Tag>} />
          ))
        )}
      </Card>
    </div>
  );
}
