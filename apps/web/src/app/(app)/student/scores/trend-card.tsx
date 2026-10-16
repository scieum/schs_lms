"use client";
import { useState } from "react";
import { BarChart } from "@/components/scores/parts";
import { Card, cx } from "@/components/ui";

type Point = { label: string; average: number | null; ko: number | null; ma: number | null; en: number | null; tam: number | null };
const KEYS = [["average", "평균"], ["ko", "국어"], ["ma", "수학"], ["en", "영어"], ["tam", "탐구"]] as const;

/** 모의고사 평균 등급 추이. '과목별 보기'로 과목을 바꿔 볼 수 있다 (1등급이 가장 긴 막대) */
export function TrendCard({ series }: { series: Point[] }) {
  const [bySubject, setBySubject] = useState(false);
  const [key, setKey] = useState<(typeof KEYS)[number][0]>("average");
  const k = bySubject ? key : "average";
  return (
    <Card
      title={k === "average" ? "모의고사 평균 등급 추이" : `${KEYS.find((x) => x[0] === k)![1]} 등급 추이`}
      action={
        <button type="button" onClick={() => { setBySubject((x) => !x); setKey("ma"); }} className="text-[13px] text-sub hover:text-ink">
          {bySubject ? "평균 보기" : "과목별 보기"}
        </button>
      }
    >
      {bySubject && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {KEYS.slice(1).map(([kk, label]) => (
            <button key={kk} type="button" onClick={() => setKey(kk)} className={cx("rounded-full px-3 py-1.5 text-[13px]", key === kk ? "bg-key font-bold text-white" : "bg-white text-sub")}>
              {label}
            </button>
          ))}
        </div>
      )}
      {series.length === 0 ? (
        <p className="py-8 text-center text-sm text-mute">아직 모의고사 성적이 없어요</p>
      ) : (
        <BarChart items={series.map((p) => ({ label: p.label, value: p[k] }))} invert max={9} height={120} format={(n) => (Number.isInteger(n) && k !== "average" ? String(n) : n.toFixed(1))} />
      )}
    </Card>
  );
}
