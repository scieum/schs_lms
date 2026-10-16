"use client";
import { useState, useTransition } from "react";
import { AiBanner, Button } from "@/components/ui";
import { serviceSummary, type ServiceLineResult } from "./actions";

/** 봉사 누적 한 줄. 처음엔 규칙 문장, 누르면 AI 한 줄 (키가 없으면 규칙 그대로 "자동") */
export function ServiceAi({ line, ai }: { line: string; ai: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ServiceLineResult | null>(null);
  const ok = res?.ok ? res : null;
  return (
    <AiBanner
      title="봉사 누적 살펴보기"
      label={ok ? ok.source : ai ? "AI" : "자동"}
      line={pending ? "읽는 중이에요" : res && !res.ok ? res.error : ok ? ok.line : line}
      action={
        ai && !ok ? (
          <Button size="sm" kind="outline" disabled={pending} onClick={() => start(async () => setRes(await serviceSummary()))}>
            {pending ? "읽는 중…" : "AI 한 줄"}
          </Button>
        ) : undefined
      }
    />
  );
}
