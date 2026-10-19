"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, ChevronDown, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ACTIVITY_MAX, cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { byNo, currentLesson, lessonDate, lessonMd, pickAllWithout, type LessonView } from "@/lib/domain/lesson-plan";
import { neisBytes } from "@/lib/domain/length";
import { PIECE_MAX, PIECE_MIN } from "@/lib/domain/merge";
import { addLessonMemosBulk, undoLessonMemos } from "@/app/(app)/teacher/lesson-actions";
import type { LessonMemoRef } from "@/lib/server/repo/modules/lessons";
import { PieceChip } from "./piece-chip";
import { useUndoSnack } from "./undo-snack";

// 같은 메모를 여러 학생에게 (Figma N43 (g) 494:12389): 차시 · 학생 체크(처음 0명) · 활동명 · 날짜 · 같이 남길 메모 · 미리보기 → "n명에게 남기기".
// AI 없음. 남기면 스낵바 "n명에게 남겼어요 · 되돌리기"(5초 — 되돌리면 방금 만든 메모를 지운다).

const SHOWN = 8;

export function useLessonBulk(view: LessonView | undefined) {
  const [open, setOpen] = useState<string | null | false>(false);
  const snack = useUndoSnack();
  const router = useRouter();
  const node = view && open !== false ? (
    <LessonBulkDialog view={view} itemId={open} onClose={() => setOpen(false)}
      onSaved={(refs) => {
        setOpen(false);
        router.refresh();
        snack.show(`${refs.length}명에게 남겼어요`, () => {
          void undoLessonMemos({ scope: view.scope, refs }).then(() => router.refresh());
        });
      }} />
  ) : null;
  return { open: (itemId?: string | null) => setOpen(itemId ?? null), node: <>{node}{snack.node}</> };
}

function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]", on ? "border-key bg-key text-white" : "border-hair bg-[#fff]")}>
      {on && <Check size={12} strokeWidth={3.5} />}
    </span>
  );
}

export function LessonBulkDialog({ view, itemId, onClose, onSaved }: { view: LessonView; itemId: string | null; onClose: () => void; onSaved: (refs: LessonMemoRef[]) => void }) {
  const items = byNo(view.items);
  const [id, setId] = useState(() => itemId ?? currentLesson(view.items, view.today)?.id ?? items[0]?.id ?? "");
  const item = items.find((i) => i.id === id);
  const [activity, setActivity] = useState(item?.title ?? "");
  const [date, setDate] = useState(lessonDate(item, view.today));
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [change, setChange] = useState(false);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const done = useMemo(() => new Set(view.marks.filter((m) => m.itemId === id).map((m) => m.studentId)), [view.marks, id]);
  const shown = all ? view.students : view.students.slice(0, SHOWN);
  const n = picked.size;
  const body = withActivity(activity, text.trim());
  const ready = n > 0 && !!cleanActivity(activity) && text.trim().length >= PIECE_MIN && body.length <= PIECE_MAX;

  const pickItem = (nid: string) => {
    const it = items.find((i) => i.id === nid);
    setId(nid);
    setActivity(it?.title ?? "");
    setDate(lessonDate(it, view.today));
    setChange(false);
  };
  const toggle = (sid: string) => setPicked((cur) => { const next = new Set(cur); if (next.has(sid)) next.delete(sid); else next.add(sid); return next; });
  const without = pickAllWithout(view.students.map((s) => s.id), view.marks, id);
  const allOn = without.length > 0 && without.every((s) => picked.has(s));
  const submit = () => start(async () => {
    setError("");
    const r = await addLessonMemosBulk({ scope: view.scope, itemId: id, studentIds: [...picked], activity, date, text }).catch(() => ({ error: "남기지 못했어요" }) as { error?: string; refs?: LessonMemoRef[] });
    if (r.error || !r.refs) return setError(r.error ?? "남기지 못했어요");
    onSaved(r.refs);
  });

  const studentList = (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-inner border border-line md:w-[320px] md:shrink-0">
      <div className="flex items-center justify-between bg-bg px-3.5 py-2.5">
        <span className="text-[13px] font-bold">{n}명 고름</span>
        <button type="button" onClick={() => setPicked(allOn ? new Set() : new Set(without))} className="text-[13px] font-medium text-key-strong">
          {allOn ? "모두 빼기" : "전체 고르기"}
        </button>
      </div>
      <ul className="flex flex-col">
        {shown.map((s) => {
          const on = picked.has(s.id);
          return (
            <li key={s.id} className="border-t border-soft">
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.id)}
                className={cx("flex h-11 w-full items-center gap-2.5 px-3.5 text-left md:h-10", on && "bg-[#F8F9FF]")}>
                <Box on={on} />
                <span className="w-11 shrink-0 text-[13px] tabular-nums text-mute">{s.no}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{s.name}</span>
                {done.has(s.id) && item && <span className="shrink-0 rounded-chip bg-soft px-1.5 py-0.5 text-[11px] font-medium text-mute">{item.no}차시 남김</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {view.students.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="border-t border-soft px-3.5 py-2.5 text-left text-[13px] font-medium text-sub">
          {all ? "접기" : `${view.students.length - SHOWN}명 더 보기`}
        </button>
      )}
    </div>
  );

  const memoSide = (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control bg-soft px-3 focus-within:ring-2 focus-within:ring-key md:h-10">
          <span className="shrink-0 text-[13px] font-bold text-sub">활동명</span>
          <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={ACTIVITY_MAX} aria-label="활동명" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        <label className="flex h-11 shrink-0 items-center gap-1.5 rounded-control bg-soft px-3 focus-within:ring-2 focus-within:ring-key md:h-10">
          <Calendar size={15} className="shrink-0 text-mute" aria-hidden />
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜" className="w-[118px] bg-transparent text-[14px] outline-none" />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">같이 남길 메모</span>
        <div className="flex flex-col rounded-inner border-[1.5px] border-key bg-[#fff] px-3.5 py-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={PIECE_MAX} aria-label="같이 남길 메모" placeholder="모두에게 같은 관찰 한 줄 (예: 모둠별로 경사각을 바꿔 가속도를 측정함)"
            className="min-h-[72px] w-full resize-none bg-transparent text-[14px] leading-[22px] outline-none placeholder:text-mute" />
          <span className="text-[12px] tabular-nums text-mute">{[...text.trim()].length}자 · {neisBytes(body).toLocaleString()}B</span>
        </div>
      </div>
      <p className="rounded-control bg-bg px-3 py-2.5 text-[13px] text-sub">학생마다 다른 점은 각 학생 메모 칸에서 한 줄 더 남겨요</p>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">이렇게 남아요</span>
        <div className="flex items-start gap-2 rounded-inner border border-line px-3 py-2.5">
          <PieceChip source="차시" />
          <span className="shrink-0 pt-px text-[12px] tabular-nums text-mute">{lessonMd(date)}</span>
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5">{text.trim() ? body : <span className="text-mute">메모를 적으면 보여요</span>}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-center md:px-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="같은 메모를 여러 학생에게" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[#fff] md:max-h-[calc(100dvh-80px)] md:w-[800px] md:rounded-card">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 pt-2.5 md:p-6">
          <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-[17px] font-bold md:text-[20px]">같은 메모를 여러 학생에게</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 items-center justify-center text-sub"><X size={20} /></button>
          </div>
          <div className="relative flex items-center gap-2">
            <span className="text-[13px] font-bold text-sub">차시</span>
            {item && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-control border-[1.5px] border-key bg-key-soft px-2.5 text-[13px]">
                <span className="text-[12px] font-bold text-key-strong">{item.no}차시</span><span className="font-medium">{item.title}</span>
                {item.date && <span className="text-[12px] text-mute">{lessonMd(item.date)}</span>}
              </span>
            )}
            <button type="button" aria-expanded={change} onClick={() => setChange(!change)} className="inline-flex items-center text-[13px] font-medium text-key-strong">
              바꾸기 <ChevronDown size={14} />
            </button>
            {change && (
              <ul role="listbox" aria-label="차시 바꾸기" className="absolute left-0 top-10 z-10 max-h-[260px] w-[300px] max-w-full overflow-y-auto rounded-inner border border-line bg-[#fff] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                {items.map((i) => (
                  <li key={i.id}>
                    <button type="button" role="option" aria-selected={i.id === id} onClick={() => pickItem(i.id)}
                      className={cx("flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px]", i.id === id ? "bg-key-soft" : "hover:bg-bg")}>
                      <span className="w-11 shrink-0 font-bold text-key-strong">{i.no}차시</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                      <span className="shrink-0 text-[12px] text-mute">{lessonMd(i.date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* 모바일: 차시 → 메모 칸 → 학생 목록 · PC: 학생 | 메모 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
            <div className="order-2 md:order-1">{studentList}</div>
            <div className="order-1 md:order-2 md:flex-1">{memoSide}</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 md:flex-row md:items-center md:px-6 md:pb-5 md:pt-4">
          {error ? <p className="min-w-0 flex-1 text-[13px] text-bad" role="alert">{error}</p>
            : <p className="min-w-0 flex-1 text-[12px] text-mute">{item ? `이미 ${item.no}차시 메모가 있는 학생은 빼고 골라요` : ""}</p>}
          <div className="flex gap-2">
            <Button type="button" kind="outline" onClick={onClose} className="h-12 flex-1 md:h-10 md:flex-none">취소</Button>
            <Button type="button" disabled={busy || !ready} onClick={submit} className="h-12 flex-[2] disabled:bg-key disabled:opacity-40 md:h-10 md:flex-none">
              {busy ? "남기는 중…" : `${n}명에게 남기기`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
