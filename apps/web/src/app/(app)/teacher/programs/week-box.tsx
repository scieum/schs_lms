"use client";
import { useActionState } from "react";
import { Button, ButtonLink, cx } from "@/components/ui";
import { weekTodoAction, type WeekState } from "./actions";

/** 프로그램 목록 "이번 주 할 일": 규칙 한 줄(자동) → "AI로 정리"를 누르면 한 문장으로 */
export function WeekBox({ line, href, all, aiOn }: { line: string; href: string; all: boolean; aiOn: boolean }) {
  const [st, act, busy] = useActionState<WeekState, FormData>(weekTodoAction, {});
  const label = st.label ?? "자동";
  return (
    <form action={act} className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
      <input type="hidden" name="all" value={all ? "1" : ""} />
      <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">이번 주 할 일</div>
        <div className="truncate text-[13px] text-sub" title={st.text ?? line}>{busy ? "만드는 중이에요" : st.text ?? line}</div>
      </div>
      {aiOn && !st.text && <Button size="sm" kind="outline" disabled={busy}>{busy ? "만드는 중…" : "AI로 정리"}</Button>}
      <span className="hidden md:block"><ButtonLink href={href} kind="outline" size="sm">먼저 보기</ButtonLink></span>
    </form>
  );
}
