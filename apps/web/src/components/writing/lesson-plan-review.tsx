"use client";
import { useState, useTransition } from "react";
import { ChevronRight, Paperclip, Plus, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ACTIVITY_MAX } from "@/lib/domain/activity-name";
import { DETAIL_MAX, needDate, type LessonDraft } from "@/lib/domain/lesson-plan";
import { saveLessonPlan } from "@/app/(app)/teacher/lesson-actions";

// 차시 목록 확인 (Figma N43 (e) 494:11715): 머리("AI" · 운영계획서에서 차시 n개를 찾았어요) → 파일 칩 · 차시 n · 날짜 확인 m → 표 머리 → N43 차시 행(바로 고치는 칸, × 지우기)
// → 6행 + "n개 더 보기" → 바닥: + 차시 더하기 · 안내 ↔ 취소 · "n차시 저장". 날짜를 못 찾은 행 = 확인 필요(#FFFBF2 · "날짜?").
// 이미 계획이 있으면 저장 전에 "지금 차시 n개를 바꿔요 · 이미 남긴 메모는 그대로예요" 확인.

type Row = LessonDraft & { key: string };
const SHOWN = 6;
let seq = 0;
const keyed = (items: LessonDraft[]): Row[] => items.map((i) => ({ ...i, key: `r${++seq}` }));
/** "2026-10-14" ↔ 칸 글 "10.14" */
const md = (d: string | null) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");

export type ReviewSource = { kind: "doc"; label: "AI" | "자동"; fileName: string } | { kind: "excel"; fileName: string } | { kind: "edit" };

export function LessonPlanReview({ scope, source, items, existing, year, onClose, onSaved }: {
  scope: string; source: ReviewSource; items: LessonDraft[];
  /** 지금 저장된 차시 수 (0이면 새 계획) */
  existing: number;
  /** 학년도 (월.일 → 날짜) */
  year: number;
  onClose: () => void; onSaved: (count: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => keyed(items.length ? items : [{ no: 1, date: null, title: "", detail: "" }]));
  const [all, setAll] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const [dateText, setDateText] = useState<Record<string, string>>({});
  const filled = rows.filter((r) => r.title.trim());
  const missing = needDate(filled);
  const shown = all ? rows : rows.slice(0, SHOWN);

  const patch = (key: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: string) => setRows((cur) => cur.filter((r) => r.key !== key));
  const add = () => { setRows((cur) => [...cur, ...keyed([{ no: Math.max(0, ...cur.map((r) => r.no)) + 1, date: null, title: "", detail: "" }])]); setAll(true); };
  /** 날짜 칸: "10.14" · "2026-10-14" → 날짜, 비우면 null */
  const setDate = (key: string, v: string) => {
    setDateText((cur) => ({ ...cur, [key]: v }));
    const t = v.trim();
    const m = /^(\d{1,2})[./-](\d{1,2})$/.exec(t) ?? /^\d{4}-(\d{2})-(\d{2})$/.exec(t);
    if (!t) return patch(key, { date: null });
    if (!m) return;
    const mo = +m[1], d = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const y = /^\d{4}/.test(t) ? +t.slice(0, 4) : mo <= 2 ? year + 1 : year;
    patch(key, { date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  };

  const save = () => start(async () => {
    setError("");
    const r = await saveLessonPlan({
      scope, source: source.kind === "doc" ? "doc" : "excel", fileName: source.kind === "edit" ? null : source.fileName,
      items: filled.map(({ id, no, date, title, detail }) => ({ ...(id ? { id } : {}), no, date, title: title.trim(), detail: detail.trim() })),
    }).catch(() => ({ error: "저장하지 못했어요" }) as { error?: string; count?: number });
    if (r.error) { setAsking(false); return setError(r.error); }
    onSaved(r.count ?? filled.length);
  });
  const trySave = () => (existing > 0 && source.kind !== "edit" ? setAsking(true) : save());

  const title = source.kind === "doc" ? <><span className="max-md:hidden">운영계획서에서 </span>차시 {filled.length}개를 찾았어요</>
    : source.kind === "excel" ? <><span className="max-md:hidden">엑셀에서 </span>차시 {filled.length}개를 읽었어요</> : <>차시 {filled.length}개 고치기</>;
  const cell = "h-10 min-w-0 rounded-control bg-soft px-3 text-[14px] outline-none focus:ring-2 focus:ring-key md:h-9";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-center md:px-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="차시 목록 확인" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[#fff] md:max-h-[calc(100dvh-80px)] md:w-[888px] md:rounded-card">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 pt-2.5 md:p-6">
          <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
          <div className="flex items-center gap-2">
            {source.kind === "doc" && <span className={cx("shrink-0 rounded-[4px] px-1.5 py-px text-[11px] font-bold", source.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{source.label}</span>}
            <h2 className="min-w-0 flex-1 text-[17px] font-bold md:text-[20px]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 items-center justify-center text-sub"><X size={20} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {source.kind !== "edit" && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-chip border border-line px-2 py-0.5 text-[12px] font-medium">
                <Paperclip size={12} className="shrink-0 text-mute" aria-hidden /><span className="min-w-0 truncate">{source.fileName}</span>
              </span>
            )}
            <span className="rounded-chip bg-key-soft px-1.5 py-0.5 text-[12px] font-bold text-key-strong">차시 {filled.length}</span>
            {missing > 0 && <span className="rounded-chip bg-wait-soft px-1.5 py-0.5 text-[12px] font-bold text-[#9A6400]">날짜 확인 {missing}</span>}
            <span className="ml-auto text-[13px] text-sub max-md:hidden">고쳐서 저장해요</span>
          </div>

          <div className="hidden items-center gap-2 rounded-control bg-bg px-3 py-2 text-[12px] font-medium text-mute md:flex">
            <span className="w-12 shrink-0">차시</span><span className="w-24 shrink-0">날짜</span><span className="w-[200px] shrink-0">활동명</span><span className="flex-1">활동 내용</span><span className="w-8" />
          </div>
          <ul className="flex flex-col gap-2 md:gap-0">
            {shown.map((r) => {
              const need = !r.date && !!r.title.trim();
              const dt = dateText[r.key] ?? md(r.date);
              return (
                <li key={r.key} className={cx("flex flex-col gap-2 rounded-inner border border-line p-3 md:flex-row md:items-center md:gap-2 md:rounded-none md:border-0 md:border-b md:border-soft md:px-3 md:py-2", need && "bg-[#FFFBF2]")}>
                  <div className="flex items-center gap-2 md:contents">
                    <input value={r.no || ""} inputMode="numeric" onChange={(e) => patch(r.key, { no: Number.parseInt(e.target.value, 10) || 0 })} aria-label="차시"
                      className="h-9 w-12 shrink-0 bg-transparent text-center text-[14px] font-bold text-key-strong outline-none focus:ring-2 focus:ring-key md:rounded-control" />
                    <input value={dt} onChange={(e) => setDate(r.key, e.target.value)} placeholder={need ? "날짜?" : "월.일"} aria-label="날짜" aria-invalid={need || undefined}
                      className={cx(cell, "w-24 shrink-0", need && "bg-wait-soft font-medium text-[#9A6400] placeholder:text-[#9A6400]")} />
                    <span className="flex-1 md:hidden" />
                    <button type="button" onClick={() => remove(r.key)} aria-label={`${r.no}차시 지우기`} className="flex size-8 shrink-0 items-center justify-center text-mute hover:text-bad md:order-last"><X size={16} /></button>
                  </div>
                  <input value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} maxLength={ACTIVITY_MAX} placeholder="활동명" aria-label="활동명" className={cx(cell, "md:w-[200px] md:shrink-0")} />
                  <input value={r.detail} onChange={(e) => patch(r.key, { detail: e.target.value })} maxLength={DETAIL_MAX} placeholder="활동 내용" aria-label="활동 내용" className={cx(cell, "md:flex-1")} />
                </li>
              );
            })}
          </ul>
          {rows.length > SHOWN && !all && (
            <button type="button" onClick={() => setAll(true)} className="inline-flex items-center gap-0.5 self-start text-[13px] font-medium text-sub">
              {rows.length - SHOWN}개 더 보기 <ChevronRight size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 md:px-6 md:pb-5 md:pt-4">
          {asking ? (
            <div className="flex flex-col gap-2 md:flex-row md:items-center" role="alertdialog" aria-label="차시 바꾸기 확인">
              <p className="min-w-0 flex-1 text-[14px] font-medium">지금 차시 {existing}개를 바꿔요 · 이미 남긴 메모는 그대로예요</p>
              <div className="flex gap-2">
                <Button type="button" kind="outline" onClick={() => setAsking(false)} className="h-12 flex-1 md:h-10 md:flex-none">취소</Button>
                <Button type="button" disabled={busy} onClick={save} className="h-12 flex-[2] md:h-10 md:flex-none">{busy ? "저장하는 중…" : "바꾸기"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button type="button" onClick={add} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-key-strong"><Plus size={15} /> 차시 더하기</button>
                {error ? <p className="min-w-0 text-[13px] text-bad" role="alert">{error}</p> : <p className="min-w-0 truncate text-[12px] text-mute max-md:hidden">날짜를 못 찾은 칸은 비워 둬도 저장돼요</p>}
              </div>
              <div className="flex gap-2">
                <Button type="button" kind="outline" onClick={onClose} className="h-12 flex-1 md:h-10 md:flex-none max-md:hidden">취소</Button>
                <Button type="button" disabled={busy || !filled.length} onClick={trySave} className="h-12 flex-1 disabled:bg-key disabled:opacity-40 md:h-10 md:flex-none">
                  {busy ? "저장하는 중…" : `${filled.length}차시 저장`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
