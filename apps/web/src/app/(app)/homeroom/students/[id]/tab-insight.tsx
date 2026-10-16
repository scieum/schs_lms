"use client";
import { useState, useTransition } from "react";
import { AiBanner, Button } from "@/components/ui";
import { tabInsight, type InsightResult } from "./actions";

/** 탭 위 한 줄 해석. 누를 때만 AI 를 부르고, 키가 없으면 규칙 문장("자동") */
export function TabInsight({ studentId, tab, title, line, ai }: { studentId: string; tab: "scores" | "night"; title: string; line: string; ai: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<InsightResult | null>(null);
  const ok = res?.ok ? res : null;
  return (
    <AiBanner
      title={title}
      label={ok ? ok.source : ai ? "AI" : "자동"}
      line={pending ? "읽는 중이에요" : res && !res.ok ? res.error : ok ? ok.line : line}
      action={
        <Button size="sm" kind="outline" disabled={pending} onClick={() => start(async () => setRes(await tabInsight(studentId, tab)))}>
          {pending ? "읽는 중…" : ok ? "다시" : "해석 보기"}
        </Button>
      }
    />
  );
}
