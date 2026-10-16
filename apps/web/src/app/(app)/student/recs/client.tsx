"use client";
import { useState, useTransition } from "react";
import { BookOpen, Check, Plus, Sparkles, Target, Users, X } from "lucide-react";
import { Button, Card, Tag, cx } from "@/components/ui";
import type { RecKind } from "@/lib/domain/counsel";
import { addAiInterest, aiRecommend, removeInterest, toggleInterest, type AiRecResult } from "./actions";

const ICON: Record<RecKind, typeof BookOpen> = { 도서: BookOpen, 대회: Sparkles, 활동: Users, 진로: Target };

export function KindIcon({ kind }: { kind: RecKind }) {
  const I = ICON[kind];
  return <span className="flex size-11 items-center justify-center rounded-field bg-white"><I size={20} /></span>;
}

export function InterestButton({ itemId, on }: { itemId: string; on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => toggleInterest(itemId))} aria-pressed={on}
      className={cx("inline-flex items-center gap-1.5 self-start rounded-control px-3 py-2 text-sm font-medium", on ? "bg-key-soft text-key-strong" : "text-ink hover:bg-white")}>
      {on ? <Check size={16} /> : <Plus size={16} />} {on ? "담았어요" : "관심 담기"}
    </button>
  );
}

export function RemoveInterest({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => removeInterest(id))} aria-label="빼기" className="rounded-control p-1.5 text-mute hover:bg-soft">
      <X size={16} />
    </button>
  );
}

/** AI 추천 기준 배너 + 결과 확인 → 하나씩 "확인 후 담기" */
export function AiRecs({ goal, aiOn }: { goal: string | null; aiOn: boolean }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<AiRecResult | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
        <span className={(r?.ok ? r.label : aiOn ? "AI" : "자동") === "AI" ? "rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new" : "rounded-chip bg-key-soft px-2.5 py-1 text-xs font-bold text-key-strong"}>{r?.ok ? r.label : aiOn ? "AI" : "자동"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">추천 기준</div>
          <div className="truncate text-[13px] text-sub">희망 진로: {goal ?? "아직 없어요"}{" "}· 확정 기록 키워드</div>
        </div>
        <Button size="sm" kind="outline" disabled={pending || !goal} onClick={() => start(async () => setR(await aiRecommend()))}>
          {pending ? "찾는 중…" : r?.ok ? "다시 추천" : "추천 받기"}
        </Button>
      </div>
      {r && !r.ok && <p className="px-1 text-[13px] text-bad" role="alert">{r.error}</p>}
      {r?.ok && (
        <Card title={r.label === "AI" ? "AI 추천" : "진로 맞춤 추천"} action={<Tag>추천</Tag>}>
          <p className="mb-3 text-[13px] text-mute">{r.note ?? (r.label === "AI" ? "AI가 고른 후보예요. 확인하고 마음에 드는 것만 담아요" : "희망 진로로 고른 후보예요. 마음에 드는 것만 담아요")}</p>
          {r.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">맞는 추천을 찾지 못했어요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {r.items.map((it) => {
                const key = `${it.kind}-${it.title}`;
                const done = added.has(key);
                return (
                  <li key={key} className="flex items-start gap-3 rounded-inner bg-white p-3.5">
                    <Tag tone="bg-soft text-sub">{it.kind}</Tag>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{it.title}</div>
                      {it.meta && <div className="text-xs text-mute">{it.meta}</div>}
                      <div className="mt-1 text-[13px] text-sub">{it.reason}</div>
                    </div>
                    <Button size="sm" kind={done ? "soft" : "outline"} className="w-[88px] shrink-0 px-0" disabled={done || pending} onClick={() => start(async () => {
                      const res = await addAiInterest(it);
                      if (res.error) setErr(res.error);
                      else setAdded((s) => new Set(s).add(key));
                    })}>
                      {done ? "담았어요" : "확인 후 담기"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {err && <p className="mt-2 text-[13px] text-bad" role="alert">{err}</p>}
        </Card>
      )}
    </div>
  );
}
