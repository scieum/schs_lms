import Link from "next/link";
import { Utensils } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { addDays } from "@/lib/domain/program";
import { nextMealDay, ALLERGENS, type SchoolEvent } from "@/lib/domain/school-info";
import { getMeals, getSchedule } from "@/lib/server/school-info";

// 홈 화면 아래 두 칸: 오늘의 급식 · 다가오는 학사일정 (나이스 교육정보 개방 포털)

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d: string, today: string) => {
  const w = DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const md = `${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, "0")}`;
  return d === today ? `오늘 ${md} (${w})` : d === addDays(today, 1) ? `내일 ${md} (${w})` : `${md} (${w})`;
};

export async function MealCard({ today }: { today: string }) {
  const meals = await getMeals(today, addDays(today, 7));
  const day = meals ? nextMealDay(meals, today) : null;
  return (
    <Card title="오늘의 급식" action={day ? <span className="text-[13px] text-mute">{dayLabel(day.date, today)}</span> : undefined}>
      {!meals ? (
        <p className="py-4 text-center text-sm text-mute">급식 정보를 불러오지 못했어요</p>
      ) : !day ? (
        <p className="py-4 text-center text-sm text-mute">이번 주 급식 정보가 없어요</p>
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

export function EventRow({ e, today }: { e: SchoolEvent; today: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={cx("w-[86px] shrink-0 text-[13px] tabular-nums", e.date === today ? "font-bold text-key-strong" : "text-sub")}>{dayLabel(e.date, today)}</span>
      <span className={cx("min-w-0 flex-1 truncate text-[14px]", e.holiday && "text-bad")}>{e.name}</span>
      {e.grades.length > 0 && e.grades.length < 3 && <span className="shrink-0 rounded-chip bg-soft px-1.5 py-0.5 text-[11px] text-sub">{e.grades.join("·")}학년</span>}
    </li>
  );
}

export async function ScheduleCard({ today, grade }: { today: string; grade?: number }) {
  const events = await getSchedule(today, addDays(today, 30));
  const list = (events ?? []).filter((e) => !grade || !e.grades.length || e.grades.includes(grade)).slice(0, 6);
  return (
    <Card title="학사일정" action={<Link href="/schedule" className="text-[13px] text-mute hover:text-ink">전체 ›</Link>}>
      {!events ? (
        <p className="py-4 text-center text-sm text-mute">학사일정을 불러오지 못했어요</p>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-sm text-mute">한 달 안에 일정이 없어요</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{list.map((e) => <EventRow key={e.date + e.name} e={e} today={today} />)}</ul>
      )}
    </Card>
  );
}

/** 홈 아래에 급식·학사일정 두 칸 */
export function SchoolInfoRow({ today, grade }: { today: string; grade?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <MealCard today={today} />
      <ScheduleCard today={today} grade={grade} />
    </div>
  );
}

