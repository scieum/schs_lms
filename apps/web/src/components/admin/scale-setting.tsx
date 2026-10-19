"use client";
import { useState, useTransition } from "react";
import { Toggle } from "@/components/ui";
import { SCALE_TAG, type ScaleKey } from "@/lib/domain/achievement";
import { setAchievementScale } from "@/app/(app)/admin/settings-actions";

/** 관리 홈 · 학교 설정: 성취수준 단계 세그먼트 한 줄 (Figma N35 ③) */
export function ScaleSetting({ initial }: { initial: ScaleKey }) {
  const [scale, setScale] = useState<ScaleKey>(initial);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const pick = (v: string) => {
    const next = v as ScaleKey;
    const prev = scale;
    setScale(next);
    start(async () => {
      const r = await setAchievementScale({ scale: next });
      if (r.ok) setMsg("저장했어요");
      else { setScale(prev); setMsg(r.error); }
    });
  };
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold">성취수준 단계</p>
        <p className="text-[13px] text-sub">세특 본문 만들기에서 고르는 수준이에요 · AI 초안의 말투만 바꿔요</p>
      </div>
      <div className={busy ? "opacity-60" : undefined}>
        <Toggle size="sm" tone="soft" value={scale} onChange={pick} options={[["A-E", SCALE_TAG["A-E"]], ["상중하", SCALE_TAG["상중하"]]]} />
      </div>
      {msg && <span className="text-[12px] text-mute" role="status">{msg}</span>}
    </div>
  );
}
