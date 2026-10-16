"use client";
import { useState, useTransition } from "react";
import { Button, Card, Tag } from "@/components/ui";
import type { CounselArea } from "@/lib/domain/counsel";
import { CounselForm } from "./counsel-form";

export type AiSummary = { ok: true; summary: string; topics: string[] } | { ok: false; error: string };

/**
 * AI 한 줄 배너 + 결과 확인 카드. 버튼을 눌렀을 때만 AI를 부르고,
 * 결과는 고칠 수 있는 칸에 넣어 "확인 후 ○○" 을 눌러야 상담 기록으로 저장된다.
 */
export function AiAttach({
  title, line, run, studentId, today, attachLabel, topicsLabel = "다음 상담 주제", area = "진로", disabled,
}: {
  title: string;
  line: string;
  run: (studentId: string) => Promise<AiSummary>;
  studentId: string;
  today: string;
  attachLabel: string;
  topicsLabel?: string;
  area?: CounselArea;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AiSummary | null>(null);
  const [n, setN] = useState(0);
  const go = () => start(async () => { setResult(await run(studentId)); setN((x) => x + 1); });
  const draft = result?.ok ? [result.summary, result.topics.length ? `${topicsLabel}: ${result.topics.join(" · ")}` : ""].filter(Boolean).join("\n") : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
        <span className="rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">AI</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{title}</div>
          <div className="truncate text-[13px] text-sub">{result?.ok ? result.summary : line}</div>
        </div>
        <Button size="sm" onClick={go} disabled={pending || disabled}>
          {pending ? "만드는 중…" : result?.ok ? "다시 만들기" : attachLabel}
        </Button>
      </div>
      {result && !result.ok && <p className="px-1 text-[13px] text-bad" role="alert">{result.error}</p>}
      {result?.ok && (
        <Card title={title} action={<Tag>요약</Tag>}>
          <p className="mb-3 text-[13px] text-mute">AI가 쓴 초안이에요. 고친 뒤 저장해야 기록에 붙어요</p>
          <CounselForm key={n} studentId={studentId} today={today} initial={draft} initialArea={area}
            submitLabel={`확인 후 ${attachLabel}`} onSaved={() => setResult(null)} />
        </Card>
      )}
    </div>
  );
}
