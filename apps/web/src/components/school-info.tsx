import { addDays, monthGrid } from "@/lib/domain/program";
import { forGrade } from "@/lib/domain/school-info";
import { getEvents, getMealDay } from "@/lib/server/school-info";
import { HomeSchedule } from "./home-schedule";
import { MealBox } from "./meal-box";

// 홈 화면 아래 두 칸: 오늘의 급식(날짜 옮기기) · 학사일정(상태 색) — 나이스 교육정보 개방 포털 + 직접 추가한 일정

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const dayLabel = (d: string, today?: string) => {
  const w = DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const md = `${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, "0")}`;
  if (today && d === today) return `오늘 ${md} (${w})`;
  return `${md} (${w})`;
};

export async function MealCard({ today }: { today: string }) {
  const r = await getMealDay(today, 0);
  return <MealBox initial={r === "error" ? null : r} today={today} failed={r === "error"} />;
}

export async function ScheduleCard({ today, grade }: { today: string; grade?: number }) {
  // 이번 달 달력이 덮는 칸부터 40일 뒤까지 (목록·이번 주·이번 달 모두)
  const grid = monthGrid(today.slice(0, 7));
  const end = addDays(today, 40) > grid.at(-1)!.at(-1)! ? addDays(today, 40) : grid.at(-1)!.at(-1)!;
  const { events, neisOk } = await getEvents(grid[0][0] < addDays(today, -7) ? grid[0][0] : addDays(today, -7), end);
  return <HomeSchedule events={forGrade(events, grade)} today={today} neisOk={neisOk} />;
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
