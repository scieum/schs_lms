import Link from "next/link";
import { Card, cx } from "@/components/ui";
import { addDays } from "@/lib/domain/program";
import { eventStatus, forGrade, type SchoolEvent } from "@/lib/domain/school-info";
import { getEvents, getMealDay } from "@/lib/server/school-info";
import { STATUS_CHIP } from "./event-style";
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

export function EventRow({ e, today }: { e: SchoolEvent; today: string }) {
  const status = eventStatus(e, today);
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-[86px] shrink-0 text-[13px] tabular-nums text-sub">{dayLabel(e.date)}{e.endDate !== e.date && "~"}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">
        {e.name}
        {e.endDate !== e.date && <span className="text-[12px] text-mute"> (~{+e.endDate.slice(5, 7)}.{e.endDate.slice(8)})</span>}
      </span>
      {e.grades.length > 0 && e.grades.length < 3 && <span className="shrink-0 rounded-chip bg-soft px-1.5 py-0.5 text-[11px] text-sub">{e.grades.join("·")}학년</span>}
      <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold", STATUS_CHIP[status])}>{status}</span>
    </li>
  );
}

export async function ScheduleCard({ today, grade }: { today: string; grade?: number }) {
  const { events, neisOk } = await getEvents(addDays(today, -14), addDays(today, 30));
  // 진행 중 + 다가오는 일정 (끝난 일정은 빼고)
  const list = forGrade(events, grade).filter((e) => e.endDate >= today).slice(0, 6);
  return (
    <Card title="학사일정" action={<Link href="/schedule" className="text-[13px] text-mute hover:text-ink">전체 ›</Link>}>
      {!neisOk && <p className="pb-1 text-[12px] text-mute">나이스 일정을 불러오지 못했어요</p>}
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-mute">한 달 안에 일정이 없어요</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{list.map((e) => <EventRow key={e.custom?.id ?? e.date + e.name} e={e} today={today} />)}</ul>
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
