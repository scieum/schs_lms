"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { STATUS_CHIP, STATUS_DOT, STATUSES } from "@/components/event-style";
import { Button, Card, cx } from "@/components/ui";
import { monthGrid, shiftMonth, weekBars } from "@/lib/domain/program";
import { eventStatus, type SchoolEvent } from "@/lib/domain/school-info";
import { addEvent, deleteEvent, updateEvent, type EventState } from "./actions";

// 학사일정 (Figma N1 182:1522 / N1-2 183:1529): 이어진 날은 막대 하나, 상태 색, 막대를 누르면 정보(직접 추가한 일정은 수정·삭제),
// "+ 일정 추가"는 누구나 (PC 가운데 창 · 모바일 아래 시트)

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const MAX_LANES = 3;
const md = (d: string) => `${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, "0")}`;
const W = ["일", "월", "화", "수", "목", "금", "토"];
const full = (d: string) => `${md(d)} (${W[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
const keyOf = (e: SchoolEvent) => e.custom?.id ?? `${e.name}|${e.date}`;
const gradeText = (g: number[]) => (!g.length || g.length === 3 ? "전체 학년" : `${g.join("·")}학년`);

export function EventCalendar({ events, month, today, me, admin, neisOk }: {
  events: SchoolEvent[]; month: string; today: string; me: string; admin: boolean; neisOk: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<SchoolEvent | "new" | null>(null);
  const weeks = monthGrid(month);
  const items = events.map((e) => ({ ...e, id: keyOf(e), startDate: e.date }));
  const picked = items.find((e) => e.id === open) ?? null;
  const inMonth = items.filter((e) => e.date <= `${month}-31` && e.endDate >= `${month}-01`);
  const [y, m] = month.split("-");
  const nav = (n: number) => `/schedule?month=${shiftMonth(month, n)}`;
  const canEdit = (e: SchoolEvent) => !!e.custom && (e.custom.authorId === me || admin);

  return (
    <Card
      title={`${y}년 ${+m}월`}
      action={
        <div className="flex items-center gap-1.5">
          <Link href={nav(-1)} aria-label="이전 달" className="rounded-control border border-hair p-1 text-sub hover:bg-soft"><ChevronLeft size={16} /></Link>
          <Link href="/schedule" className="rounded-control px-2 py-1 text-[13px] text-sub hover:bg-soft">오늘</Link>
          <Link href={nav(1)} aria-label="다음 달" className="rounded-control border border-hair p-1 text-sub hover:bg-soft"><ChevronRight size={16} /></Link>
          <Button type="button" size="sm" onClick={() => setEditing("new")} className="ml-1"><Plus size={14} /> 일정 추가</Button>
        </div>
      }
    >
      {!neisOk && <p className="mb-2 rounded-inner bg-wait-soft px-3 py-2 text-[13px] text-[#9a6400]">나이스 일정을 불러오지 못했어요. 직접 추가한 일정만 보여요</p>}
      {/* PC: 주마다 이어진 막대 */}
      <div className="relative hidden md:block">
        <div className="grid grid-cols-7 text-center text-[12px] text-mute">
          {DOW.map((d, i) => <div key={d} className={cx("pb-2", i === 6 && "text-bad")}>{d}</div>)}
        </div>
        <div className="overflow-hidden rounded-inner border border-line">
          {weeks.map((week, wi) => {
            const bars = weekBars(week, inMonth);
            const lanes = Math.max(1, Math.min(MAX_LANES, Math.max(0, ...bars.map((b) => b.lane + 1))));
            const hidden = (i: number) => bars.filter((b) => b.lane >= MAX_LANES && b.from <= i && b.to >= i).length;
            return (
              <div key={week[0]} className={cx("relative", wi > 0 && "border-t border-line")} style={{ minHeight: 34 + lanes * 26 + 12 }}>
                <div className="absolute inset-0 grid grid-cols-7">
                  {week.map((d, i) => {
                    const out = !d.startsWith(month);
                    const holiday = items.some((e) => e.holiday && e.date <= d && e.endDate >= d);
                    return (
                      <div key={d} className={cx("px-2 pt-1.5", i > 0 && "border-l border-line", out && "bg-soft/60")}>
                        <span className={cx("text-[12px] tabular-nums", d === today ? "rounded-chip bg-key px-1.5 py-0.5 font-bold text-white" : out ? "text-faint" : i === 6 || holiday ? "text-bad" : "text-sub")}>{+d.slice(8)}</span>
                        {hidden(i) > 0 && <span className="ml-1 text-[11px] text-mute">+{hidden(i)}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="relative grid grid-cols-7 gap-y-1 px-0.5 pt-8" style={{ gridTemplateRows: `repeat(${lanes}, 22px)` }}>
                  {bars.filter((b) => b.lane < MAX_LANES).map((b) => {
                    const e = items.find((x) => x.id === b.id)!;
                    const status = eventStatus(e, today);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setOpen(open === b.id ? null : b.id)}
                        title={`${e.name} · ${md(e.date)}${e.endDate !== e.date ? `~${md(e.endDate)}` : ""}`}
                        style={{ gridColumn: `${b.from + 1} / ${b.to + 2}`, gridRow: b.lane + 1 }}
                        className={cx(
                          "mx-0.5 flex items-center gap-1 truncate px-1.5 text-left text-[11px] font-medium leading-[22px]",
                          STATUS_CHIP[status],
                          b.starts ? "rounded-l-[5px]" : "-ml-0.5 rounded-l-none",
                          b.ends ? "rounded-r-[5px]" : "-mr-0.5 rounded-r-none",
                          open === b.id && "ring-2 ring-key ring-offset-1",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{b.starts || b.from === 0 ? e.name + (!b.starts ? ` (~${md(e.endDate)})` : "") : ""}</span>
                        {e.custom && !e.custom.imported && b.ends && <span className="shrink-0 whitespace-nowrap rounded-[4px] bg-[#fff]/70 px-1 text-[10px] text-sub">추가</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {picked && (
          <div className="absolute bottom-12 right-4 z-10 w-[300px] rounded-card border border-line bg-[#fff] p-4">
            <Detail e={picked} today={today} canEdit={canEdit(picked)} onEdit={() => { setEditing(picked); setOpen(null); }} onClose={() => setOpen(null)} />
          </div>
        )}
        <Legend />
      </div>

      {/* 모바일: 이 달 목록 (누르면 펼침) */}
      <ul className="flex flex-col divide-y divide-line md:hidden">
        {inMonth.length === 0 && <li className="py-6 text-center text-sm text-mute">이 달에는 일정이 없어요</li>}
        {inMonth.map((e) => {
          const status = eventStatus(e, today);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="w-16 shrink-0 text-[13px] tabular-nums text-sub">{md(e.date)}{e.endDate !== e.date && "~"}</span>
                <span className="min-w-0 flex-1 text-[14px]">{e.name}{e.custom && !e.custom.imported && <span className="ml-1 rounded-[4px] bg-soft px-1 text-[10px] text-sub">추가</span>}</span>
                <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold", STATUS_CHIP[status])}>{status}</span>
              </button>
              {open === e.id && <div className="pb-3"><Detail e={e} today={today} canEdit={canEdit(e)} onEdit={() => { setEditing(e); setOpen(null); }} /></div>}
            </li>
          );
        })}
      </ul>
      <div className="md:hidden"><Legend /></div>
      <p className="mt-1 text-[12px] text-mute">나이스 학사일정 기준 · 빨간 날은 휴업일·공휴일 · 직접 추가한 일정은 올린 사람이 고치거나 지울 수 있어요</p>

      {editing && <EventForm event={editing === "new" ? null : editing} today={today} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-sub">
      {STATUSES.map((s) => <span key={s} className="flex items-center gap-1"><span className={cx("size-2.5 rounded-[3px] border-2", STATUS_DOT[s])} />{s}</span>)}
      <span className="flex items-center gap-1"><span className="rounded-[4px] bg-soft px-1 text-[10px]">추가</span>직접 추가한 일정</span>
    </div>
  );
}

function Detail({ e, today, canEdit, onEdit, onClose }: { e: SchoolEvent; today: string; canEdit: boolean; onEdit: () => void; onClose?: () => void }) {
  const status = eventStatus(e, today);
  const [err, setErr] = useState("");
  const remove = () => {
    if (!e.custom || !confirm(`'${e.name}' 일정을 지울까요?`)) return;
    startTransition(async () => { const r = await deleteEvent(e.custom!.id); if (r.error) setErr(r.error); else onClose?.(); });
  };
  return (
    <div className="flex flex-col gap-2 text-[14px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-bold">{e.name}</span>
        <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold", STATUS_CHIP[status])}>{status}</span>
        {onClose && <button type="button" onClick={onClose} aria-label="닫기" className="text-mute"><X size={16} /></button>}
      </div>
      <div className="text-[13px] text-sub">{full(e.date)}{e.endDate !== e.date && ` ~ ${full(e.endDate)}`} · {gradeText(e.grades)}{e.custom?.dept && ` · ${e.custom.dept}`}</div>
      {e.custom?.memo && <p className="rounded-inner bg-soft px-3 py-2 text-[13px]">{e.custom.memo}</p>}
      <div className="text-[12px] text-mute">{!e.custom ? "나이스 학사일정" : e.custom.imported ? "온라인 교무실 학사일정에서 옮김" : `${e.custom.authorName}이 추가 · 나이스 일정 아님`}</div>
      {err && <p className="text-[13px] text-bad">{err}</p>}
      {canEdit && (
        <div className="flex gap-2">
          <Button type="button" size="sm" kind="outline" onClick={onEdit}>수정</Button>
          <Button type="button" size="sm" kind="outline" onClick={remove} className="text-bad">삭제</Button>
        </div>
      )}
    </div>
  );
}

const INPUT = "h-10 w-full rounded-field border border-hair bg-[#fff] px-3 text-[14px] outline-none focus:ring-2 focus:ring-key";

/** 일정 추가·수정: PC 가운데 창, 모바일 아래 시트 */
function EventForm({ event, today, onClose }: { event: SchoolEvent | null; today: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<EventState, FormData>(event ? updateEvent : addEvent, {});
  const [start, setStart] = useState(event?.date ?? today);
  const [end, setEnd] = useState(event?.endDate ?? today);
  const [grades, setGrades] = useState<number[]>(event?.grades.length ? event.grades : []);
  useEffect(() => { if (state.done) onClose(); }, [state.done, onClose]);
  const toggle = (g: number) => setGrades(grades.includes(g) ? grades.filter((x) => x !== g) : [...grades, g].sort());

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 md:items-center" onClick={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-card bg-[#fff] p-5 md:max-w-[460px] md:rounded-card">
        {event?.custom && <input type="hidden" name="id" value={event.custom.id} />}
        <div>
          <div className="text-[17px] font-bold">{event ? "일정 수정" : "일정 추가"}</div>
          <div className="text-[13px] text-mute">선생님·학생 누구나 추가할 수 있어요</div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">일정 이름</span>
          <input name="title" required maxLength={60} defaultValue={event?.name ?? ""} placeholder="예: 2학년 진로 특강" className={INPUT} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">시작일</span>
            <input type="date" name="startDate" required value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">마감일</span>
            <input type="date" name="endDate" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={INPUT} />
          </label>
        </div>
        <p className="-mt-1 text-[12px] text-mute">하루 일정이면 시작일과 마감일을 같은 날로 두세요</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">대상 학년</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setGrades([])} className={cx("rounded-full px-3.5 py-1.5 text-[13px]", !grades.length ? "bg-key font-bold text-white" : "bg-soft text-sub")}>전체</button>
            {[1, 2, 3].map((g) => (
              <button key={g} type="button" onClick={() => toggle(g)} className={cx("rounded-full px-3.5 py-1.5 text-[13px]", grades.includes(g) ? "bg-key font-bold text-white" : "bg-soft text-sub")}>{g}학년</button>
            ))}
          </div>
          {grades.map((g) => <input key={g} type="hidden" name="grade" value={g} />)}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">메모 <span className="font-normal text-mute">(선택)</span></span>
          <textarea name="memo" rows={3} maxLength={200} defaultValue={event?.custom?.memo ?? ""} placeholder="장소·준비물 등 함께 볼 내용" className="w-full resize-y rounded-field border border-hair bg-[#fff] p-3 text-[14px] outline-none focus:ring-2 focus:ring-key" />
        </label>
        <p className="flex items-start gap-1.5 rounded-inner bg-soft px-3 py-2 text-[12px] text-sub"><span className="mt-0.5 shrink-0 whitespace-nowrap rounded-[4px] bg-[#fff] px-1 text-[10px]">추가</span> 직접 추가한 일정 · 나이스 일정과 함께 보여요. 올린 사람만 고치거나 지울 수 있어요</p>
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" kind="outline" onClick={onClose}>취소</Button>
          <Button disabled={pending}>{pending ? "저장 중…" : event ? "수정하기" : "추가하기"}</Button>
        </div>
      </form>
    </div>
  );
}
