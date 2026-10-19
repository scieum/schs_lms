"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, ChevronRight, Layers, Plus } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ACTIVITY_MAX } from "@/lib/domain/activity-name";
import { createCommonActivity } from "@/app/(app)/teacher/common-actions";
import { byNo, lessonMd, type LessonChipItem } from "@/lib/domain/lesson-plan";

// 공통 활동 카드 (Figma N26 344:412): 학생 목록 위. 목록(이름 · 날짜 · 학생·자료 · 조각 진행) + "+ 공통 활동" 새 활동 칸.

export type CommonRow = {
  id: string; name: string; date: string | null; students: number; files: number; made: number;
  chip: { label: string; tone: "key" | "ok" | "none" };
};

const CHIP = { key: "bg-key-soft text-key-strong", ok: "bg-ok-soft text-ok", none: "bg-soft text-mute" } as const;
const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "");

export function CommonActivitiesCard({ scope, rows, detailBase, today, lessons }: {
  scope: string; rows: CommonRow[]; detailBase: string; today: string;
  /** 수업 계획 차시 (N43): 새 활동 칸 "차시에서 고르기" — 활동명 · 날짜 · 설명을 채운다 */
  lessons?: LessonChipItem[];
}) {
  const [lessonId, setLessonId] = useState("");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  const reset = () => { setOpen(false); setName(""); setDesc(""); setDate(today); setError(""); setLessonId(""); };
  const fromLesson = (id: string) => {
    setLessonId(id);
    const l = lessons?.find((x) => x.id === id);
    if (!l) return;
    setName(l.title);
    if (l.date) setDate(l.date);
    setDesc(l.detail.slice(0, 300));
  };
  const submit = () => start(async () => {
    const r = await createCommonActivity({ scope, name, date: date || null, description: desc, lessonItemId: lessonId || null }).catch(() => ({ error: "등록하지 못했어요" }) as { error?: string });
    if (r.error) return setError(r.error);
    reset();
    router.refresh();
  });

  return (
    <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:px-6 md:py-5" aria-label="공통 활동">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-bold md:text-[17px]">
          공통 활동 <span className="font-normal text-mute">{rows.length}</span>
        </h2>
        <Button type="button" kind="soft" size="sm" className="h-8 font-bold md:h-9" onClick={() => (open ? reset() : setOpen(true))} aria-expanded={open}>
          <Plus size={14} /> 공통 활동
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-inner bg-bg p-4">
          {lessons && lessons.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-sub">차시에서 고르기</span>
              <select value={lessonId} onChange={(e) => fromLesson(e.target.value)} aria-label="차시에서 고르기"
                className="h-11 rounded-field bg-[#fff] px-3 text-[14px] outline-none focus:ring-2 focus:ring-key">
                <option value="">직접 적기</option>
                {byNo(lessons).map((l) => <option key={l.id} value={l.id}>{l.no}차시 · {l.title}{l.date ? ` · ${lessonMd(l.date)}` : ""}</option>)}
              </select>
            </label>
          )}
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[12px] font-medium text-sub">활동명</span>
              <input value={name} onChange={(e) => { setName(e.target.value); setError(""); if (lessonId && e.target.value !== lessons?.find((x) => x.id === lessonId)?.title) setLessonId(""); }} maxLength={ACTIVITY_MAX} placeholder="예: 수행평가 · 빗면 실험" autoFocus
                className="h-11 rounded-field bg-[#fff] px-3 text-[14px] outline-none focus:ring-2 focus:ring-key" />
            </label>
            <label className="flex flex-col gap-1.5 md:w-[180px]">
              <span className="text-[12px] font-medium text-sub">날짜</span>
              <span className="flex h-11 items-center gap-2 rounded-field bg-[#fff] px-3 focus-within:ring-2 focus-within:ring-key">
                <Calendar size={16} className="shrink-0 text-mute" />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
              </span>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-sub">설명</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} placeholder="간단한 설명"
              className="h-11 rounded-field bg-[#fff] px-3 text-[14px] outline-none focus:ring-2 focus:ring-key" />
          </label>
          <div className="flex items-center justify-end gap-2">
            {error && <p className="mr-auto min-w-0 text-[13px] text-bad" role="alert">{error}</p>}
            <Button type="button" kind="ghost" size="sm" onClick={reset}>취소</Button>
            <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={submit} className="disabled:bg-key disabled:opacity-40">
              {busy ? "등록 중…" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        !open && <p className="rounded-inner bg-bg py-5 text-center text-[13px] text-mute">수행평가처럼 다 같이 한 활동을 등록해 보세요</p>
      ) : (
        <ul className="overflow-hidden rounded-inner border border-line">
          {rows.map((r) => (
            <li key={r.id} className="border-t border-soft first:border-0">
              <Link href={`${detailBase}/${r.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-bg md:px-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-key-soft text-key"><Layers size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{r.name}</span>
                    <span className="truncate text-[12px] text-mute">{[md(r.date), `학생 ${r.students}명`, `자료 ${r.files}개`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={cx("self-start whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] font-bold md:self-center", CHIP[r.chip.tone])}>{r.chip.label}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
