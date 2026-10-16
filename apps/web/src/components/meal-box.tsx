"use client";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { mealDayAction } from "@/app/(app)/schedule/actions";
import { ALLERGENS, type Meal } from "@/lib/domain/school-info";

// 오늘의 급식 (Figma N1 오른쪽 카드): ‹ 날짜 › 로 앞뒤 급식일을 옮겨 본다. 오늘이 아니면 "오늘" 버튼
type Day = { date: string; meals: Meal[] } | null;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const label = (d: string) => `${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, "0")} (${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;

export function MealBox({ initial, today, failed }: { initial: Day; today: string; failed: boolean }) {
  const [day, setDay] = useState<Day>(initial);
  const [error, setError] = useState(failed ? "급식 정보를 불러오지 못했어요" : "");
  const [pending, start] = useTransition();
  const at = day?.date ?? today;
  const go = (from: string, dir: -1 | 0 | 1) => start(async () => {
    const r = await mealDayAction(from, dir);
    if (r === "error") { setError("급식 정보를 불러오지 못했어요"); return; }
    setError("");
    if (r) setDay(r);
    else setError(dir === 1 ? "2주 안에 다음 급식이 없어요" : dir === -1 ? "2주 안에 이전 급식이 없어요" : "급식 정보가 없어요");
  });

  return (
    <Card
      title="오늘의 급식"
      action={
        <div className={cx("flex items-center gap-1", pending && "opacity-60")}>
          {at !== today && at !== initial?.date && <button type="button" onClick={() => go(today, 0)} className="rounded-chip bg-key-soft px-2 py-0.5 text-[12px] font-bold text-key-strong">오늘</button>}
          <button type="button" onClick={() => go(at, -1)} aria-label="이전 급식" className="rounded-control border border-hair p-1 text-sub hover:bg-soft"><ChevronLeft size={14} /></button>
          <span className="min-w-[72px] text-center text-[13px] font-bold tabular-nums">{label(at)}</span>
          <button type="button" onClick={() => go(at, 1)} aria-label="다음 급식" className="rounded-control border border-hair p-1 text-sub hover:bg-soft"><ChevronRight size={14} /></button>
        </div>
      }
    >
      {error && <p className="pb-2 text-center text-[13px] text-mute">{error}</p>}
      {!day ? (
        !error && <p className="py-4 text-center text-sm text-mute">이번 주 급식 정보가 없어요</p>
      ) : (
        <div className={cx("grid gap-3", day.meals.length > 1 && "sm:grid-cols-2")}>
          {day.meals.map((m) => (
            <div key={m.kind} className="rounded-inner bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold"><Utensils size={14} className="text-key" /> {m.kind}{m.kcal && <span className="ml-auto font-normal text-mute">{m.kcal}</span>}</div>
              <ul className="flex flex-col gap-1 text-[14px]">
                {m.dishes.map((d) => (
                  <li key={d.name} className="flex items-baseline gap-1.5">
                    <span>{d.name}</span>
                    {d.allergens.length > 0 && <span className="text-[11px] text-faint" title={d.allergens.map((a) => ALLERGENS[a] ?? a).join(", ")}>{d.allergens.join(".")}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
