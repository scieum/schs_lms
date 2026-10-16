"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card, Tag, cx } from "@/components/ui";
import { AREA_LABEL, md, monthGrid, programsInMonth, shiftMonth, weekBars } from "@/lib/domain/program";
import type { ScheduleItem } from "./schedule";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const MAX_LANES = 4;
// 영역마다 막대 색 (인디고 계열 + 중립. 상태 색과 겹치지 않게)
const BAR: Record<ScheduleItem["area"], string> = {
  세특: "bg-key text-white",
  "창체-자율": "bg-[#C2CAFF] text-navy",
  "창체-동아리": "bg-navy text-white",
  "창체-진로": "bg-[#E5E8EB] text-ink",
};

// 캘린더: 이어진 날은 막대 하나로, 누르면 담당 부서·담당자·참여 학생
export function ScheduleCalendar({ items, month, today }: { items: ScheduleItem[]; month: string; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const weeks = monthGrid(month);
  const inMonth = programsInMonth(items, month);
  const picked = items.find((p) => p.id === open) ?? null;
  const [y, m] = month.split("-");
  const nav = (n: number) => `/teacher/programs?view=calendar&month=${shiftMonth(month, n)}`;

  return (
    <div className="grid gap-4 md:gap-6 xl:grid-cols-[1fr_340px]">
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
        {/* PC: 주마다 이어진 막대 */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 text-center text-[12px] text-mute">
            {DOW.map((d) => <div key={d} className="pb-2">{d}</div>)}
          </div>
          <div className="overflow-hidden rounded-inner border border-line">
            {weeks.map((week, wi) => {
              const bars = weekBars(week, inMonth);
              const shown = bars.filter((b) => b.lane < MAX_LANES);
              const lanes = Math.max(1, Math.min(MAX_LANES, Math.max(0, ...bars.map((b) => b.lane + 1))));
              const hidden = (i: number) => bars.filter((b) => b.lane >= MAX_LANES && b.from <= i && b.to >= i).length;
              return (
                <div key={week[0]} className={cx("relative", wi > 0 && "border-t border-line")} style={{ minHeight: 34 + lanes * 26 + 10 }}>
                  {/* 바탕 칸 + 날짜 */}
                  <div className="absolute inset-0 grid grid-cols-7">
                    {week.map((d, i) => {
                      const out = d.slice(0, 7) !== month;
                      return (
                        <div key={d} className={cx("px-2 pt-1.5", i > 0 && "border-l border-line", out && "bg-soft/60")}>
                          <span className={cx("text-[12px] tabular-nums", d === today ? "rounded-chip bg-key px-1.5 py-0.5 font-bold text-white" : out ? "text-faint" : "text-sub")}>{+d.slice(8)}</span>
                          {hidden(i) > 0 && <span className="ml-1 text-[11px] text-mute">+{hidden(i)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* 막대: 이어진 날은 한 줄로, 주를 넘으면 끝을 각지게 */}
                  <div className="relative grid grid-cols-7 gap-y-1 px-0.5 pt-8" style={{ gridTemplateRows: `repeat(${lanes}, 22px)` }}>
                    {shown.map((b) => {
                      const p = items.find((x) => x.id === b.id)!;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setOpen(open === b.id ? null : b.id)}
                          title={`${p.title} · ${md(p.startDate)}~${md(p.endDate)}`}
                          style={{ gridColumn: `${b.from + 1} / ${b.to + 2}`, gridRow: b.lane + 1 }}
                          className={cx(
                            "mx-0.5 truncate px-2 text-left text-[12px] font-medium leading-[22px]",
                            BAR[p.area],
                            b.starts ? "rounded-l-[6px]" : "-ml-0.5 rounded-l-none",
                            b.ends ? "rounded-r-[6px]" : "-mr-0.5 rounded-r-none",
                            open === b.id && "ring-2 ring-key ring-offset-1",
                          )}
                        >
                          {b.starts || b.from === 0 ? p.title : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-mute">
            {(Object.keys(BAR) as ScheduleItem["area"][]).map((a) => (
              <span key={a} className="flex items-center gap-1.5"><span className={cx("size-2.5 rounded-[3px]", BAR[a].split(" ")[0])} />{AREA_LABEL[a]}</span>
            ))}
            <span className="ml-auto">막대를 누르면 담당자·참여 학생이 보여요</span>
          </div>
        </div>

        {/* 모바일: 이 달 일정 목록 (누르면 펼침) */}
        <ul className="flex flex-col md:hidden">
          {inMonth.length === 0 && <li className="py-6 text-center text-sm text-mute">이 달에는 프로그램이 없어요</li>}
          {inMonth.map((p, i) => (
            <li key={p.id} className={cx(i > 0 && "border-t border-line")}>
              <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className={cx("h-8 w-1.5 shrink-0 rounded-full", BAR[p.area].split(" ")[0])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{p.title}</span>
                  <span className="block truncate text-[12px] text-mute">{md(p.startDate)} ~ {md(p.endDate)} · {p.owners}</span>
                </span>
                <ChevronRight size={16} className={cx("shrink-0 text-faint transition-transform", open === p.id && "rotate-90")} />
              </button>
              {open === p.id && <div className="pb-3"><Detail p={p} /></div>}
            </li>
          ))}
        </ul>
      </Card>

      {/* PC: 고른 프로그램 정보 */}
      <div className="hidden md:block">
        {picked ? (
          <Card title={picked.title} action={<button type="button" onClick={() => setOpen(null)} aria-label="닫기" className="text-mute hover:text-ink"><X size={18} /></button>}>
            <Detail p={picked} />
          </Card>
        ) : (
          <Card title="프로그램 정보"><p className="py-6 text-center text-sm text-mute">캘린더에서 막대를 눌러 보세요</p></Card>
        )}
      </div>
    </div>
  );
}

function Detail({ p }: { p: ScheduleItem }) {
  // 반별로 묶어 보여 준다 (학번 앞 3자리 = 학년+반)
  const byClass = new Map<string, string[]>();
  for (const s of p.students) {
    const k = `${s.no.slice(0, 1)}학년 ${+s.no.slice(1, 3)}반`;
    byClass.set(k, [...(byClass.get(k) ?? []), `${s.no} ${s.name}`]);
  }
  return (
    <div className="flex flex-col gap-3 text-[14px]">
      <dl className="flex flex-col gap-2">
        {[
          ["기간", `${md(p.startDate)} ~ ${md(p.endDate)}`],
          ["영역", `${AREA_LABEL[p.area]}${p.subject ? ` · ${p.subject}` : ""}`],
          ["담당 부서", p.depts || "미정"],
          ["담당자", p.ownerNames.join(", ") || "미정"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-16 shrink-0 text-mute">{k}</dt>
            <dd className="min-w-0 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-mute">참여 학생</span>
          <Tag tone="bg-soft text-sub">{`${p.students.length}명`}</Tag>
        </div>
        {p.students.length === 0 ? <p className="text-[13px] text-mute">대상 학생이 없어요</p> : (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-inner bg-soft p-3">
            {[...byClass.entries()].map(([k, list]) => (
              <div key={k}>
                <div className="mb-1 text-[12px] font-bold text-sub">{k} · {list.length}명</div>
                <div className="flex flex-wrap gap-1">
                  {list.map((x) => <span key={x} className="rounded-chip bg-white px-2 py-0.5 text-[12px] tabular-nums">{x}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {p.mine && <Link href={`/teacher/programs/${p.id}`} className="text-[13px] font-medium text-key-strong">프로그램 상세 열기 →</Link>}
    </div>
  );
}
