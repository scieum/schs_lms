"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { BriefingLine } from "@/lib/domain/teacher-assist";
import { makeBriefing, type BriefingResult } from "./home-actions";

/** T1 오늘 브리핑: 처음엔 규칙 한 줄, 누르면 우선순위 3줄(AI, 키가 없으면 자동) */
export function TodayBriefing({ line, first, aiOn }: { line: string; first: BriefingLine | null; aiOn: boolean }) {
  const [res, setRes] = useState<BriefingResult | null>(null);
  const [pending, start] = useTransition();
  const label = res?.label ?? (aiOn ? "AI" : "자동");
  const go = () => start(async () => {
    try {
      setRes(await makeBriefing());
    } catch {
      setRes({ lines: first ? [first] : [], label: "자동", error: "브리핑을 만들지 못했어요" });
    }
  });

  return (
    <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
      <div className="flex items-center gap-3 md:gap-4">
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">오늘 브리핑</div>
          <div className="truncate text-[13px] text-sub">{pending ? "만드는 중이에요" : res ? (res.lines.length ? "먼저 할 일 순서예요" : "오늘 먼저 볼 일이 없어요") : line}</div>
        </div>
        <Button kind="outline" size="sm" onClick={go} disabled={pending}>{pending ? "만드는 중…" : res ? "다시 만들기" : "브리핑 보기"}</Button>
      </div>
      {res && res.lines.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5">
          {res.lines.map((l, i) => (
            <li key={i}>
              <Link href={l.href} className="flex items-center gap-3 rounded-inner bg-white px-3.5 py-2.5 text-[14px] hover:bg-white/70">
                <span className="w-4 shrink-0 text-[13px] font-bold tabular-nums text-key-strong">{i + 1}</span>
                <span className="min-w-0 flex-1">{l.text}</span>
                <ChevronRight size={16} className="shrink-0 text-mute" />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {res?.error && <p className="mt-2 text-[12px] text-mute">AI 대신 규칙으로 정리했어요 ({res.error})</p>}
    </div>
  );
}
