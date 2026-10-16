"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AiBanner, Button, ButtonLink, Card, Tag } from "@/components/ui";
import { classBriefing, type BriefResult } from "./actions";

/** 우리 반 브리핑: 누르면 먼저 볼 학생 3명과 이유. "상담 일정 잡기"는 상담 기록 화면으로 */
export function Briefing({ line, ai, names }: { line: string; ai: boolean; names: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<BriefResult | null>(null);
  const ok = res?.ok ? res : null;
  return (
    <>
      <AiBanner
        title="우리 반 브리핑"
        label={ok ? ok.source : ai ? "AI" : "자동"}
        line={pending ? "만드는 중이에요" : res && !res.ok ? res.error : ok?.line ?? line}
        action={
          ok ? (
            <Button size="sm" kind="ghost" onClick={() => setRes(null)}>닫기</Button>
          ) : (
            <Button size="sm" kind="outline" disabled={pending} onClick={() => start(async () => setRes(await classBriefing()))}>
              {pending ? "만드는 중…" : "먼저 볼 학생"}
            </Button>
          )
        }
      />
      {ok && (
        <Card title="먼저 볼 학생" action={<Tag tone="bg-new-soft text-new">{ok.source === "AI" ? "AI 추천" : "규칙으로 고름"}</Tag>}>
          {ok.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">지금 먼저 챙길 학생이 없어요</p>
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-3">
              {ok.items.map((it) => (
                <li key={it.studentId} className="flex flex-col gap-1.5 rounded-inner bg-white p-4">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/homeroom/students/${it.studentId}`} className="min-w-0 flex-1 truncate font-bold hover:text-key-strong">{names[it.studentId] ?? "학생"}</Link>
                    {it.tags.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}
                  </div>
                  <p className="flex-1 text-[13px] text-sub">{it.reason}</p>
                  <ButtonLink href={`/teacher/counseling?student=${it.studentId}#new-counsel`} kind="soft" size="sm" className="w-fit">상담 일정 잡기</ButtonLink>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-mute">{ok.error ? `AI 대신 규칙으로 골랐어요 (${ok.error})` : "가명ID·신호만 AI에 보냈어요 · 저장하지 않아요"}</p>
        </Card>
      )}
    </>
  );
}
