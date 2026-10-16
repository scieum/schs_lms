import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MealCard } from "@/components/school-info";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, cx } from "@/components/ui";
import { seoulNow } from "@/lib/domain/night";
import { monthGrid, shiftMonth } from "@/lib/domain/program";
import { getSchedule } from "@/lib/server/school-info";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "학사일정 · 속초고등학교 학생관리시스템" };

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

/** 학사일정 (나이스 교육정보 개방 포털). 학생은 자기 학년 일정만 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const v = await requireViewer();
  const today = seoulNow().date;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const weeks = monthGrid(month);
  const grade = v.kind === "student" ? v.student.grade : undefined;
  const all = await getSchedule(weeks[0][0], weeks.at(-1)!.at(-1)!);
  const events = (all ?? []).filter((e) => !grade || !e.grades.length || e.grades.includes(grade));
  const inMonth = events.filter((e) => e.date.startsWith(month));
  const [y, m] = month.split("-");
  const nav = (n: number) => `/schedule?month=${shiftMonth(month, n)}`;

  return (
    <>
      <PageHeader title="학사일정" />
      <PageBody>
        <div className="grid gap-4 md:gap-6 xl:grid-cols-[1fr_340px]">
          <Card
            title={`${y}년 ${+m}월`}
            action={
              <div className="flex items-center gap-1">
                <Link href={nav(-1)} aria-label="이전 달" className="rounded-control p-1.5 text-sub hover:bg-soft"><ChevronLeft size={18} /></Link>
                <Link href="/schedule" className="rounded-control px-2 py-1 text-[13px] text-sub hover:bg-soft">오늘</Link>
                <Link href={nav(1)} aria-label="다음 달" className="rounded-control p-1.5 text-sub hover:bg-soft"><ChevronRight size={18} /></Link>
              </div>
            }
          >
            {!all && <p className="py-6 text-center text-sm text-mute">학사일정을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요</p>}
            {/* PC: 달력 */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 text-center text-[12px] text-mute">{DOW.map((d) => <div key={d} className="pb-2">{d}</div>)}</div>
              <div className="grid grid-cols-7 overflow-hidden rounded-inner border border-line">
                {weeks.flat().map((d, i) => {
                  const list = events.filter((e) => e.date === d);
                  const out = !d.startsWith(month);
                  const red = i % 7 === 6 || list.some((e) => e.holiday);
                  return (
                    <div key={d} className={cx("min-h-[92px] p-1.5", i % 7 !== 0 && "border-l border-line", i >= 7 && "border-t border-line", out && "bg-soft/60")}>
                      <div className={cx("mb-1 px-1 text-[12px] tabular-nums", d === today ? "inline-block rounded-chip bg-key px-1.5 font-bold text-white" : out ? "text-faint" : red ? "text-bad" : "text-sub")}>{+d.slice(8)}</div>
                      {list.map((e) => (
                        <div key={e.name} title={e.name} className={cx("mb-0.5 truncate rounded-[4px] px-1 py-0.5 text-[11px]", e.holiday ? "bg-bad-soft text-bad" : "bg-key-soft text-key-strong")}>
                          {e.name}{e.grades.length > 0 && e.grades.length < 3 ? ` (${e.grades.join("·")})` : ""}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 모바일: 목록 */}
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {all && inMonth.length === 0 && <li className="py-6 text-center text-sm text-mute">이 달에는 일정이 없어요</li>}
              {inMonth.map((e) => (
                <li key={e.date + e.name} className="flex items-center gap-3 py-2.5">
                  <span className={cx("w-14 shrink-0 text-[13px] tabular-nums", e.date === today ? "font-bold text-key-strong" : "text-sub")}>{+e.date.slice(5, 7)}.{e.date.slice(8)}</span>
                  <span className={cx("min-w-0 flex-1 text-[14px]", e.holiday && "text-bad")}>{e.name}</span>
                  {e.grades.length > 0 && e.grades.length < 3 && <span className="rounded-chip bg-soft px-1.5 py-0.5 text-[11px] text-sub">{e.grades.join("·")}학년</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-mute">나이스 학사일정 기준 · 빨간 날은 휴업일·공휴일</p>
          </Card>
          <MealCard today={today} />
        </div>
      </PageBody>
    </>
  );
}
