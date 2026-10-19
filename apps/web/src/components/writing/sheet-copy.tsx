"use client";
import { useEffect, useState } from "react";
import { Copy, Lock, Plus, Check, X } from "lucide-react";
import { cx } from "@/components/ui";
import { COPY_COLS, copyCells, DEFAULT_COPY_COLS, type CopyCol } from "@/lib/domain/records-export";
import { toTsv } from "@/lib/domain/tsv";
import { classRoster, copyRows, type ClassRoster, type ScopeArg } from "@/app/(app)/teacher/class-actions";
import { useToast } from "./toast";

// 시트용 복사 (Figma N42 ③ (e) 492:36650 팝오버 380 · 모바일 494:30967 바텀시트 · (f) 토스트 492:36949).
// 탭으로 나눈 글(TSV)만 클립보드에 (text/html 표는 넣지 않음). 실명이 들어가므로 경고 줄 고정 · 서버에서 권한 확인 + 감사(숫자만).

const LETTERS = "ABCDEFGHIJ";

export function SheetCopy({ scope, roster: given, open, onClose, lockScroll = true }: { scope: ScopeArg; roster?: ClassRoster | null; open: boolean; onClose: () => void; lockScroll?: boolean }) {
  const [own, setOwn] = useState<ClassRoster | null>(null);
  // roster 를 넘기면(null = 불러오는 중) 그대로, 안 넘기면(undefined) 열 때 직접 불러온다
  const roster = given !== undefined ? given : own;
  const [who, setWho] = useState<"confirmed" | "all">("confirmed");
  const [cols, setCols] = useState<CopyCol[]>(DEFAULT_COPY_COLS);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!open || given !== undefined || own) return;
    void classRoster(scope).then(setOwn).catch(() => setOwn({ ok: false, error: "불러오지 못했어요" }));
  }, [open, given, own, scope]);
  // 모바일 바텀시트가 열리면 뒤 화면 스크롤을 막는다
  useEffect(() => {
    if (!open || !lockScroll || window.matchMedia("(min-width: 768px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, lockScroll]);

  const ok = roster?.ok ? roster : null;
  const all = ok?.rows ?? [];
  const confirmed = all.filter((r) => r.상태 === "확정");
  const rows = who === "confirmed" ? confirmed : all;
  const allowed = COPY_COLS.filter((c) => c !== "성취수준" || ok?.levels);
  const picked = allowed.filter((c) => cols.includes(c));
  const toggle = (c: CopyCol) => setCols((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const copy = async () => {
    if (!rows.length || !picked.length) return;
    setBusy(true);
    const text = copyRows({ scope, who, cols: picked }).then((r) => {
      if (!r.ok) throw new Error(r.error);
      return { tsv: toTsv(r.header, r.rows), n: r.rows.length };
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t.tsv], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText((await text).tsv);
      }
      const { n } = await text;
      toast.show(`${n}명 복사했어요 · 시트 첫 칸에 붙여 넣으세요`);
      onClose();
    } catch {
      toast.show("복사하지 못했어요 · 다시 눌러 주세요", true);
    } finally {
      setBusy(false);
    }
  };

  const preview = [picked as string[], ...rows.slice(0, 2).map((r) => copyCells(r, picked).map(String))];
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Copy size={17} className="shrink-0 text-key-strong" />
        <span className="text-[17px] font-bold md:text-[15px]">시트용 복사</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label="시트용 복사 닫기" className="flex size-7 items-center justify-center text-mute"><X size={17} /></button>
      </div>
      <p className="-mt-1 text-[13px] text-sub md:text-[12px]">구글 시트·엑셀 칸에 그대로 붙어요</p>
      {!roster ? <p className="py-6 text-center text-[13px] text-mute" role="status">불러오는 중이에요</p> : !ok ? <p className="text-[13px] text-bad">{roster.ok ? "" : roster.error}</p> : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-inner bg-bg p-1" role="radiogroup" aria-label="학생">
            {([["confirmed", "확정만", confirmed.length], ["all", "전체", all.length]] as const).map(([k, label, n]) => (
              <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)}
                className={cx("flex h-12 flex-col items-center justify-center rounded-control text-[14px]", who === k ? "border border-key bg-[#fff] font-bold text-key-strong" : "font-medium text-sub")}>
                {label}<span className="text-[11px] font-medium text-mute">{n}명</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">열</span>
            <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {allowed.map((c) => {
                const on = cols.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => toggle(c)}
                    className={cx("inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-[16px] border px-3 text-[13px]", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub")}>
                    {on ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}{c}
                  </button>
                );
              })}
            </div>
          </div>
          {picked.length > 0 && (
            <div className="overflow-hidden rounded-[6px] border border-line text-[11px]" aria-label="시트 미리보기">
              <div className="flex bg-bg text-mute">
                <span className="w-6 shrink-0 border-r border-line" />
                {picked.map((c, i) => <span key={c} className={cx("min-w-0 border-r border-line px-1.5 py-0.5 last:border-r-0", c === "글" ? "flex-[3]" : "flex-1")}>{LETTERS[i]}</span>)}
              </div>
              {preview.map((cells, r) => (
                <div key={r} className="flex border-t border-line">
                  <span className="w-6 shrink-0 border-r border-line bg-bg px-1 py-1 text-center text-mute">{r + 1}</span>
                  {cells.map((v, i) => <span key={i} className={cx("min-w-0 truncate border-r border-line px-1.5 py-1 last:border-r-0", picked[i] === "글" ? "flex-[3]" : "flex-1", r === 0 && "font-medium")}>{v}</span>)}
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] text-mute">칸은 탭으로 나눠요 · 글 안 줄바꿈은 따옴표로 감싸 한 칸에 들어가요</p>
          <p className="flex items-center gap-1.5 rounded-control bg-wait-soft px-3 py-2 text-[12px] font-bold text-[#9A6400]"><Lock size={12} className="shrink-0" /> 학생 이름이 들어 있어요 · 학교 밖으로 보내지 마세요</p>
          <button type="button" onClick={copy} disabled={busy || !rows.length || !picked.length}
            className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-control bg-key text-[15px] font-bold text-white hover:bg-key-strong disabled:opacity-40 md:h-11 md:text-[14px]">
            <Copy size={15} /> {busy ? "복사하는 중…" : rows.length ? `${rows.length}명 복사` : "복사할 글이 없어요"}
          </button>
        </>
      )}
    </>
  );

  return (
    <>
      {open && (
        <>
          <div role="dialog" aria-label="시트용 복사" className="absolute right-0 top-full z-50 mt-2 hidden w-[380px] flex-col gap-3.5 rounded-card border border-line bg-[#fff] p-4 shadow-[0_8px_24px_rgba(28,32,51,0.16)] md:flex">
            {body}
          </div>
          <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:hidden" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label="시트용 복사" onClick={(e) => e.stopPropagation()}
              className="flex max-h-[88dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2.5">
              <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
              {body}
            </div>
          </div>
        </>
      )}
      {toast.node}
    </>
  );
}
