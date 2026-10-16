"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AiBanner, Button, ButtonLink } from "@/components/ui";
import type { TodoStep } from "@/lib/domain/student-assist";
import { planMyDay, type PlanResult } from "./home-actions";

/** S1 할 일 정리: 처음엔 규칙 한 줄, "순서 정리"를 누르면 오늘 순서 3개 */
export function TodoPlan({ initial, aiOn }: { initial: { steps: TodoStep[]; line: string }; aiOn: boolean }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<PlanResult | null>(null);
  const steps = r?.ok ? r.steps : initial.steps;
  const first = steps[0];
  const line = pending ? "정리하는 중이에요" : r ? (r.ok ? r.line : r.error) : initial.line;

  return (
    <div className="flex flex-col gap-2">
      <AiBanner
        title="할 일 정리"
        label={r?.ok ? r.label : aiOn ? "AI" : "자동"}
        line={line}
        action={
          <div className="flex shrink-0 gap-2">
            {steps.length > 1 && (
              <Button type="button" kind="outline" size="sm" disabled={pending} onClick={() => start(async () => setR(await planMyDay()))}>
                {pending ? "정리 중…" : r?.ok ? "다시 정리" : "순서 정리"}
              </Button>
            )}
            {/* 화면당 인디고 버튼 1개 → 홈 인디고는 "설문 응답하기", 여기는 소프트 */}
            {first && <span className="hidden md:block"><ButtonLink href={first.href} kind="soft" size="sm">이어서 하기</ButtonLink></span>}
          </div>
        }
      />
      {r?.ok && (
        <ol className="flex flex-col gap-1.5 px-1">
          {r.steps.map((s, i) => (
            <li key={s.key}>
              <Link href={s.href} className="flex items-center gap-3 rounded-inner bg-white px-4 py-2.5 text-[14px] hover:bg-key-soft">
                <span className="w-5 shrink-0 font-bold text-key">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                <span className="shrink-0 text-[13px] text-mute">{s.why}</span>
              </Link>
            </li>
          ))}
          {r.note && <li className="text-[12px] text-mute">{r.note}</li>}
        </ol>
      )}
    </div>
  );
}
