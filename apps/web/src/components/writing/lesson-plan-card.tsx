"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileUp, List, Pencil, Upload, Users } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { TEMPLATES } from "@/lib/domain/excel-template";
import { byNo, currentLesson, nearToday, type LessonChipItem, type LessonDraft, type LessonView } from "@/lib/domain/lesson-plan";
import { commonFromLesson, readLessonDoc, readLessonExcel } from "@/app/(app)/teacher/lesson-actions";
import { ChipMenu, LessonChip } from "./lesson-chips";
import { LessonPlanReview, type ReviewSource } from "./lesson-plan-review";
import { useLessonBulk } from "./lesson-bulk-dialog";
import { useUndoSnack } from "./undo-snack";

// 차시별 활동 카드 (Figma N43 (d) 493:11349 · 올린 뒤 (f) 머리): 학생 목록 위 · 공통 활동 카드 바로 위.
// 계획 없음 = 안내 + [양식 받기(#1D6F42)] [계획 올리기(#191F28)] [운영계획서로 만들기(외곽선)] — 엑셀은 N25 규칙 그대로(AI 없음), 운영계획서만 AI.
// 올린 뒤 = "차시별 활동 16" ↔ 고치기 · 여러 학생에게 → 차시 칩 한 줄(오늘 차시가 고름) + "n개 더 ›". 모바일은 머리 줄만.

const BTN = "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3.5 text-[14px] font-bold md:h-10 md:text-[13px]";
const ROW = 5;

export function LessonPlanCard({ view, year }: { view: LessonView; year: number }) {
  const router = useRouter();
  const excel = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ source: ReviewSource; items: LessonDraft[] } | null>(null);
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState<{ item: LessonChipItem; at: { x: number; y: number } } | null>(null);
  const bulk = useLessonBulk(view);
  const snack = useUndoSnack(3000);
  const has = view.items.length > 0;

  const read = (f: File, kind: "excel" | "doc") => start(async () => {
    setError("");
    const fd = new FormData();
    fd.set("scope", view.scope);
    fd.set("file", f);
    try {
      if (kind === "excel") {
        const r = await readLessonExcel(fd);
        if ("error" in r) return setError(r.error);
        setReview({ source: { kind: "excel", fileName: r.fileName }, items: r.items });
      } else {
        const r = await readLessonDoc(fd);
        if ("error" in r) return setError(r.error);
        setReview({ source: { kind: "doc", label: r.label, fileName: r.fileName }, items: r.items });
      }
    } catch {
      setError("파일을 읽지 못했어요. 다시 올려 주세요");
    }
  });
  const edit = () => setReview({ source: { kind: "edit" }, items: byNo(view.items).map((i) => ({ id: i.id, no: i.no, date: i.date, title: i.title, detail: i.detail })) });
  const toCommon = (item: LessonChipItem) => start(async () => {
    const r = await commonFromLesson({ scope: view.scope, itemId: item.id }).catch(() => ({ error: "만들지 못했어요" }) as { error?: string });
    snack.show(r.error ?? `공통 활동 '${item.title}'을 만들었어요`);
    if (!r.error) router.refresh();
  });

  const inputs = (
    <>
      <input ref={excel} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="수업 계획 엑셀"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f, "excel"); }} />
      <input ref={doc} type="file" accept=".hwpx,.hwp,.pdf,application/pdf" className="hidden" aria-label="운영계획서 파일"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f, "doc"); }} />
    </>
  );
  const reviewNode = review && (
    <LessonPlanReview scope={view.scope} source={review.source} items={review.items} existing={view.items.length} year={year}
      onClose={() => setReview(null)} onSaved={(n) => { setReview(null); snack.show(`차시 ${n}개를 저장했어요`); router.refresh(); }} />
  );

  if (!has) {
    return (
      <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:px-6 md:py-5" aria-label="차시별 활동">
        <h2 className="text-[15px] font-bold md:text-[17px]">차시별 활동 <span className="text-[13px] font-normal text-mute">{view.label}</span></h2>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-key-soft text-key max-md:hidden"><List size={18} /></span>
            <span className="flex min-w-0 flex-col">
              <span className="break-keep text-[14px] font-medium">수업 계획을 올리면 메모 칸에서 차시를 눌러 써요</span>
              <span className="truncate text-[12px] text-mute max-md:hidden">엑셀 양식(차시 · 날짜 · 활동명 · 활동 내용) 또는 운영계획서 HWPX · PDF</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
            <a href="/teacher/lesson-template" download={TEMPLATES.lesson.file} className={cx(BTN, "bg-[#1D6F42] text-white hover:bg-[#185C37]")}>
              <FileSpreadsheet size={16} aria-hidden /> 양식 받기
            </a>
            <button type="button" disabled={busy} onClick={() => excel.current?.click()} className={cx(BTN, "bg-[#191F28] text-white hover:bg-[#333D4B] disabled:opacity-60")}>
              <Upload size={16} aria-hidden /> {busy ? "읽는 중…" : "계획 올리기"}
            </button>
            <button type="button" disabled={busy} onClick={() => doc.current?.click()} className={cx(BTN, "col-span-2 border border-hair bg-[#fff] text-ink hover:bg-soft disabled:opacity-60")}>
              <FileUp size={16} aria-hidden /> 운영계획서로 만들기
            </button>
          </div>
        </div>
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        {inputs}
        {reviewNode}
        {snack.node}
      </section>
    );
  }

  const now = currentLesson(view.items, view.today);
  const row = nearToday(view.items, view.today).slice(0, ROW).sort((a, b) => a.no - b.no);
  const list = more ? byNo(view.items) : row;
  return (
    <section className="surface flex flex-col gap-3 rounded-card p-4 md:px-6 md:py-5" aria-label="차시별 활동">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-bold md:text-[17px]">차시별 활동 <span className="text-mute">{view.items.length}</span></h2>
        <Button type="button" kind="outline" size="sm" onClick={edit} className="h-8 border-0 bg-transparent px-1 md:h-9 md:border md:bg-[#fff] md:px-3">
          <Pencil size={14} className="max-md:hidden" /> 고치기
        </Button>
        <Button type="button" kind="soft" size="sm" onClick={() => bulk.open(now?.id)} className="h-9 font-bold max-md:hidden">
          <Users size={14} /> 여러 학생에게
        </Button>
      </div>
      <div className={cx("flex items-center gap-1.5 max-md:hidden", more ? "flex-wrap" : "overflow-x-auto [scrollbar-width:none]")}>
        {list.map((i) => (
          <LessonChip key={i.id} item={i} state={i.id === now?.id ? "picked" : "base"} onClick={() => bulk.open(i.id)}
            onMenu={(at) => setMenu({ item: i, at })} />
        ))}
        {view.items.length > ROW && (
          <button type="button" onClick={() => setMore(!more)} className="shrink-0 whitespace-nowrap px-1 text-[13px] font-medium text-key-strong">
            {more ? "접기" : `${view.items.length - ROW}개 더 ›`}
          </button>
        )}
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      {menu && <ChipMenu at={menu.at} onClose={() => setMenu(null)} onCommon={() => toCommon(menu.item)} />}
      {inputs}
      {reviewNode}
      {bulk.node}
      {snack.node}
    </section>
  );
}
