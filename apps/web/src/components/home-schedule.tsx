"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, cx } from "@/components/ui";
import { monthGrid, weekBars, weekOf } from "@/lib/domain/program";
import { eventStatus, type SchoolEvent } from "@/lib/domain/school-info";
import { STATUS_CHIP } from "./event-style";

// 홈 학사일정 칸 (Figma T1 토글 202:1762 · N6 이번 주 202:1777 · N6-2 이번 달 202:2442): 목록 | 이번 주 | 이번 달

type View = "list" | "week" | "month";
const VIEWS: [View, string][] = [["list", "목록"], ["week", "이번 주"], ["month", "이번 달"]];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const W = DOW;
const md = (d: string) => `${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, "0")}`;
const dayLabel = (d: string) => `${md(d)} (${W[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
const DOT: Record<string, string> = { "진행 중": "bg-key", "시작 전": "bg-wait", "완료": "bg-faint", "휴업일": "bg-bad" };

export function HomeSchedule({ events, today, neisOk }: { events: SchoolEvent[]; today: string; neisOk: boolean }) {
  const [view, setView] = useState<View>("list");
  const items = events.map((e) => ({ ...e, id: e.custom?.id ?? `${e.name}|${e.date}`, startDate: e.date }));
  return (
    <Card
      title="학사일정"
      action={
        <div className="flex items-center gap-2">
          <nav className="flex rounded-full border border-hair bg-[#fff] p-0.5 text-[12px]" aria-label="보기">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={v === view}
                className={cx("rounded-full px-2.5 py-1", v === view ? "bg-key-soft font-bold text-key-strong" : "text-mute hover:text-sub")}>
                {label}
              </button>
            ))}
          </nav>
          <Link href={`/schedule?view=${view === "list" ? "list" : view}`} className="text-[13px] text-mute hover:text-ink">전체 ›</Link>
        </div>
      }
    >
      {!neisOk && <p className="pb-1 text-[12px] text-mute">나이스 일정을 불러오지 못했어요</p>}
      {view === "list" && <List items={items} today={today} />}
      {view === "week" && <Week items={items} today={today} />}
      {view === "month" && <Month items={items} today={today} />}
    </Card>
  );
}

type Item = SchoolEvent & { id: string; startDate: string };

function Tag({ e, today }: { e: SchoolEvent; today: string }) {
  const s = eventStatus(e, today);
  return <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold", STATUS_CHIP[s])}>{s}</span>;
}

function List({ items, today }: { items: Item[]; today: string }) {
  // 진행 중 + 다가오는 일정
  const list = items.filter((e) => e.endDate >= today).slice(0, 6);
  if (!list.length) return <p className="py-4 text-center text-sm text-mute">한 달 안에 일정이 없어요</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {list.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2">
          <span className="w-[86px] shrink-0 text-[13px] tabular-nums text-sub">{dayLabel(e.date)}{e.endDate !== e.date && "~"}</span>
          <span className="min-w-0 flex-1 truncate text-[14px]">
            {e.name}
            {e.endDate !== e.date && <span className="text-[12px] text-mute"> (~{md(e.endDate)})</span>}
          </span>
          {e.grades.length > 0 && e.grades.length < 3 && <span className="shrink-0 rounded-chip bg-soft px-1.5 py-0.5 text-[11px] text-sub">{e.grades.join("·")}학년</span>}
          <Tag e={e} today={today} />
        </li>
      ))}
    </ul>
  );
}

function Week({ items, today }: { items: Item[]; today: string }) {
  const week = weekOf(today);
  const bars = weekBars(week, items).filter((b) => b.lane < 4);
  const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
  const inWeek = items.filter((e) => e.date <= week[6] && e.endDate >= week[0]);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-inner border border-line">
        <div className="grid grid-cols-7 text-center text-[12px]">
          {week.map((d, i) => (
            <div key={d} className={cx("py-1.5", i > 0 && "border-l border-line", d === today && "bg-key-soft/50")}>
              <div className={cx(i === 0 ? "text-bad" : i === 6 ? "text-key-strong" : "text-mute")}>{DOW[i]}</div>
              <div className={cx("mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums", d === today ? "bg-key font-bold text-white" : "text-ink")}>{+d.slice(8)}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 border-t border-line px-0.5 py-1.5" style={{ gridTemplateRows: `repeat(${lanes}, 20px)` }}>
          {bars.map((b) => {
            const e = items.find((x) => x.id === b.id)!;
            return (
              <div key={b.id} title={e.name} style={{ gridColumn: `${b.from + 1} / ${b.to + 2}`, gridRow: b.lane + 1 }}
                className={cx("mx-0.5 truncate px-1.5 text-[11px] leading-5", STATUS_CHIP[eventStatus(e, today)], b.starts ? "rounded-l-[5px]" : "rounded-l-none", b.ends ? "rounded-r-[5px]" : "rounded-r-none")}>
                <span className="hidden sm:inline">{e.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* 좁은 화면에서는 막대에 글이 안 들어가 아래에 목록으로 */}
      <ul className="flex flex-col gap-1 sm:hidden">
        {inWeek.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-[13px]">
            <span className="w-14 shrink-0 tabular-nums text-sub">{md(e.date)}</span>
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <Tag e={e} today={today} />
          </li>
        ))}
      </ul>
      {inWeek.length === 0 && <p className="text-center text-sm text-mute">이번 주에는 일정이 없어요</p>}
    </div>
  );
}

function Month({ items, today }: { items: Item[]; today: string }) {
  const month = today.slice(0, 7);
  const weeks = monthGrid(month);
  const next = items.filter((e) => e.endDate >= today).slice(0, 2);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="grid grid-cols-7 text-center text-[11px] text-mute">{DOW.map((d, i) => <div key={d} className={cx("pb-1", i === 0 && "text-bad")}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {weeks.flat().map((d, i) => {
            const on = items.filter((e) => e.date <= d && e.endDate >= d);
            const out = !d.startsWith(month);
            const red = i % 7 === 0 || on.some((e) => e.holiday);
            return (
              <div key={d} className="flex flex-col items-center gap-0.5 py-0.5" title={on.map((e) => e.name).join(", ")}>
                <span className={cx("flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums", d === today ? "bg-key font-bold text-white" : out ? "text-faint" : red ? "text-bad" : "text-ink")}>{+d.slice(8)}</span>
                <span className="flex h-1.5 gap-0.5">
                  {on.slice(0, 3).map((e) => <span key={e.id} className={cx("size-1.5 rounded-full", DOT[eventStatus(e, today)])} />)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {next.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {next.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-[86px] shrink-0 tabular-nums text-sub">{dayLabel(e.date)}</span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <Tag e={e} today={today} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
