"use client";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { AiBanner, Button } from "@/components/ui";
import { FoldButtons, FoldRow } from "./fold";
import type { DailyCheckItem } from "@/lib/domain/accounts";
import { dailyBriefAction, explainFlagsAction, type BriefResult, type FlagExplain } from "@/app/(app)/admin/audit/ai-actions";
import { explainDemandAction, type DemandExplain } from "@/app/(app)/admin/offerings/ai-actions";

// 관리자 화면의 한 줄 AI 배너들. 처음엔 규칙("자동") 결과를 보여 주고, 버튼을 눌렀을 때만 AI 를 부른다.
// 키가 없으면 서버가 규칙 결과를 "자동"으로 돌려준다.

/** A1 오늘 점검 */
export function DailyBrief({ initial, aiOn, link }: { initial: { line: string; items: DailyCheckItem[] }; aiOn: boolean; link?: ReactNode }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<BriefResult | null>(null);
  const [fold, setFold] = useState(false);
  const items = r?.items ?? initial.items;
  const buttons = (
    <>
      {items.length > 0 && (
        <Button type="button" kind="outline" size="sm" disabled={pending} onClick={() => start(async () => setR(await dailyBriefAction()))}>
          {pending ? "정리 중…" : r ? "다시 정리" : aiOn ? "AI로 정리" : "순서 정리"}
        </Button>
      )}
      {link}
    </>
  );
  const hasButtons = items.length > 0 || !!link;
  return (
    <div className="flex flex-col gap-2">
      <AiBanner
        title="오늘 점검"
        label={r ? r.label : "자동"}
        line={pending ? "읽는 중이에요" : r?.line ?? initial.line}
        action={hasButtons ? <FoldButtons open={fold} onToggle={() => setFold(!fold)}>{buttons}</FoldButtons> : undefined}
      />
      <FoldRow open={fold}>{buttons}</FoldRow>
      {r && r.items.length > 0 && (
        <ol className="flex flex-col gap-1.5 px-1">
          {r.items.map((it, i) => (
            <li key={it.key}>
              <Link href={it.href} className="flex items-center gap-3 rounded-inner bg-white px-4 py-2.5 text-[14px] hover:bg-key-soft">
                <span className="w-5 shrink-0 font-bold text-key">{i + 1}</span>
                <span className="min-w-0 flex-1">{it.text}</span>
              </Link>
            </li>
          ))}
          {r.note && <li className="text-[12px] text-mute">{r.note}</li>}
        </ol>
      )}
    </div>
  );
}

/** A5 이상 접근 살펴보기: 규칙 한 줄 + "설명 보기"로 사람이 읽을 문장 */
export function FlagExplainBanner({ line, period, has, link }: { line: string; period: string; has: boolean; link?: ReactNode }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<FlagExplain | null>(null);
  const [fold, setFold] = useState(false);
  const buttons = (
    <>
      {has && (
        <Button type="button" kind="outline" size="sm" disabled={pending} onClick={() => start(async () => setR(await explainFlagsAction(period)))}>
          {pending ? "읽는 중…" : r ? "다시 보기" : "설명 보기"}
        </Button>
      )}
      {link}
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <AiBanner
        title="이상 접근 살펴보기"
        label={r ? r.label : "자동"}
        line={pending ? "읽는 중이에요" : r?.lines[0] ?? line}
        action={has || link ? <FoldButtons open={fold} onToggle={() => setFold(!fold)}>{buttons}</FoldButtons> : undefined}
      />
      <FoldRow open={fold}>{buttons}</FoldRow>
      {r && r.lines.length > 1 && (
        <ul className="flex flex-col gap-1 px-1 text-[13px] text-sub">
          {r.lines.slice(1).map((l) => <li key={l}>· {l}</li>)}
          {r.note && <li className="text-[12px] text-mute">{r.note}</li>}
        </ul>
      )}
    </div>
  );
}

/** A6 신청 예측: 규칙 한 줄 + "예측 설명" */
export function DemandBanner({ line, roundId, action }: { line: string; roundId: string; action?: ReactNode }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<DemandExplain | null>(null);
  const [fold, setFold] = useState(false);
  const buttons = (
    <>
      {!r?.ok && (
        <Button type="button" kind="outline" size="sm" disabled={pending} onClick={() => start(async () => setR(await explainDemandAction(roundId)))}>
          {pending ? "보는 중…" : "마감 예측"}
        </Button>
      )}
      {action}
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <AiBanner
        title="신청 예측"
        label={r?.ok ? r.label : "자동"}
        line={pending ? "읽는 중이에요" : r ? (r.ok ? r.line : r.error) : line}
        action={!r?.ok || action ? <FoldButtons open={fold} onToggle={() => setFold(!fold)}>{buttons}</FoldButtons> : undefined}
      />
      <FoldRow open={fold}>{buttons}</FoldRow>
    </div>
  );
}
