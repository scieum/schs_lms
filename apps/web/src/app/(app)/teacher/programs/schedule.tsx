import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, Tag, cx } from "@/components/ui";
import { AREA_LABEL, ddayLabel, effectiveStatus, md, monthGrid, programsInMonth, shiftMonth, type Program } from "@/lib/domain/program";

// 전체 일정: 담당이 아니어도 어떤 프로그램이 언제 있는지 본다 (학생 응답·초안은 담당자만)
export type ScheduleItem = Pick<Program, "id" | "title" | "area" | "subject" | "startDate" | "endDate" | "status" | "targetIds"> & {
  owners: string;
  /** 상세를 열 수 있나 (담당자·관리자) */
  mine: boolean;
};

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
// 영역마다 점 색 하나 (상태 색과 겹치지 않게 인디고 계열 + 중립)
const AREA_DOT: Record<Program["area"], string> = { 세특: "bg-key", "창체-자율": "bg-[#9EAAFF]", "창체-동아리": "bg-navy", "창체-진로": "bg-faint" };

function StatusTag({ p, today }: { p: ScheduleItem; today: string }) {
  const s = effectiveStatus(p, today);
  if (s === "closed") return <Tag tone="bg-soft text-mute">마감</Tag>;
  if (p.startDate > today) return <Tag tone="bg-soft text-sub">예정</Tag>;
  return <Tag>{ddayLabel(p.endDate, today)}</Tag>;
}

function Title({ p, className }: { p: ScheduleItem; className?: string }) {
  return p.mine ? <Link href={`/teacher/programs/${p.id}`} className={cx("hover:text-key-strong", className)}>{p.title}</Link> : <span className={className}>{p.title}</span>;
}

export function ScheduleList({ items, today }: { items: ScheduleItem[]; today: string }) {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const now = sorted.filter((p) => effectiveStatus(p, today) !== "closed");
  const past = sorted.filter((p) => effectiveStatus(p, today) === "closed").reverse();
  const section = (title: string, list: ScheduleItem[]) => (
    <Card title={`${title} ${list.length}`}>
      {list.length === 0 ? <p className="py-6 text-center text-sm text-mute">없어요</p> : (
        <ul className="flex flex-col">
          {list.map((p, i) => (
            <li key={p.id} className={cx("flex items-center gap-3 py-3", i > 0 && "border-t border-line")}>
              <span className={cx("size-2 shrink-0 rounded-full", AREA_DOT[p.area])} aria-hidden />
              <span className="w-[92px] shrink-0 text-[13px] tabular-nums text-sub md:w-[110px]">{md(p.startDate)} ~ {md(p.endDate)}</span>
              <span className="min-w-0 flex-1">
                <Title p={p} className="block truncate text-[15px] font-bold" />
                <span className="block truncate text-[12px] text-mute">{AREA_LABEL[p.area]}{p.subject ? ` ${p.subject}` : ""} · {p.owners} · {p.targetIds.length}명</span>
              </span>
              <span className="shrink-0"><StatusTag p={p} today={today} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  return (
    <>
      {section("진행·예정", now)}
      {past.length > 0 && section("지난 프로그램", past)}
    </>
  );
}

export function ScheduleCalendar({ items, month, today }: { items: ScheduleItem[]; month: string; today: string }) {
  const weeks = monthGrid(month);
  const inMonth = programsInMonth(items, month);
  const [y, m] = month.split("-");
  const nav = (n: number) => `/teacher/programs?view=calendar&month=${shiftMonth(month, n)}`;
  return (
    <Card
      title={`${y}년 ${+m}월`}
      action={
        <div className="flex items-center gap-1">
          <Link href={nav(-1)} aria-label="이전 달" className="rounded-control p-1.5 text-sub hover:bg-soft"><ChevronLeft size={18} /></Link>
          <Link href={`/teacher/programs?view=calendar&month=${today.slice(0, 7)}`} className="rounded-control px-2 py-1 text-[13px] text-sub hover:bg-soft">오늘</Link>
          <Link href={nav(1)} aria-label="다음 달" className="rounded-control p-1.5 text-sub hover:bg-soft"><ChevronRight size={18} /></Link>
        </div>
      }
    >
      {/* PC: 달력 칸마다 그날 진행 중인 프로그램 */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 text-center text-[12px] text-mute">
          {DOW.map((d) => <div key={d} className="pb-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-inner border border-line">
          {weeks.flat().map((d, i) => {
            const on = inMonth.filter((p) => p.startDate <= d && p.endDate >= d);
            const out = d.slice(0, 7) !== month;
            return (
              <div key={d} className={cx("min-h-[104px] p-1.5", i % 7 !== 0 && "border-l border-line", i >= 7 && "border-t border-line", out && "bg-soft/60")}>
                <div className={cx("mb-1 px-1 text-[12px] tabular-nums", d === today ? "inline-block rounded-chip bg-key px-1.5 font-bold text-white" : out ? "text-faint" : "text-sub")}>{+d.slice(8)}</div>
                <div className="flex flex-col gap-0.5">
                  {on.slice(0, 3).map((p) => (
                    <div key={p.id} title={`${p.title} · ${md(p.startDate)}~${md(p.endDate)} · ${p.owners}`}
                      className={cx("flex items-center gap-1 truncate rounded-[4px] px-1 py-0.5 text-[11px]", p.endDate === d ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-sub")}>
                      <span className={cx("size-1.5 shrink-0 rounded-full", AREA_DOT[p.area])} aria-hidden />
                      <Title p={p} className="truncate" />
                    </div>
                  ))}
                  {on.length > 3 && <div className="px-1 text-[11px] text-mute">+{on.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-mute">진한 칸은 마감일이에요</p>
      </div>
      {/* 모바일: 이 달 일정 목록 */}
      <ul className="flex flex-col md:hidden">
        {inMonth.length === 0 && <li className="py-6 text-center text-sm text-mute">이 달에는 프로그램이 없어요</li>}
        {inMonth.map((p, i) => (
          <li key={p.id} className={cx("flex items-center gap-3 py-3", i > 0 && "border-t border-line")}>
            <span className={cx("size-2 shrink-0 rounded-full", AREA_DOT[p.area])} aria-hidden />
            <span className="min-w-0 flex-1">
              <Title p={p} className="block truncate text-[15px] font-bold" />
              <span className="block truncate text-[12px] text-mute">{md(p.startDate)} ~ {md(p.endDate)} · {p.owners}</span>
            </span>
            <StatusTag p={p} today={today} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
