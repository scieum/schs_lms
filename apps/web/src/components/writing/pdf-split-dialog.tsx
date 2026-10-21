"use client";
import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { quickSplit, rangeLabel, validateRanges, type PageRange } from "@/lib/domain/program";
import { pdfPageCount, splitPdfRanges } from "@/lib/client/shrink-upload";

// 합본 PDF 나누기 창 (Figma N59 634:2031): 합본 하나 → 번호순(한 사람 n쪽) | 페이지 지정(구간 · 학생) → 학생마다 PDF 한 개.
// 브라우저에서 나눈다(pdf-lib). 나눈 파일로 무엇을 할지는 run 이 정한다 — 수행평가는 바로 읽고, 공통 활동은 학생 칸에 붙인다.

export type SplitStudent = { id: string; no: string; name: string };
export type SplitPart = { studentId: string; file: File; range: PageRange };

export function PdfSplitDialog({ students, note, confirm, run, onClose }: {
  students: SplitStudent[];
  /** 아래 안내 한 줄 */
  note: ReactNode;
  /** 주 버튼 글 (n = 학생 수) */
  confirm: (n: number) => string;
  /** 나눈 파일 처리. report 로 진행 글을 띄우고, 실패 글을 돌려주면 창을 닫지 않는다 */
  run: (parts: SplitPart[], report: (msg: string) => void) => Promise<string | null>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [mode, setMode] = useState<"order" | "manual">("order");
  const [per, setPer] = useState(2);
  const [manual, setManual] = useState<PageRange[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ids = students.map((s) => s.id);
  const nameOf = new Map(students.map((s) => [s.id, `${s.no} ${s.name}`]));
  const pickFile = async (f: File | null) => {
    setError(""); setFile(f); setPages(null); setManual([]);
    if (!f) return;
    const n = await pdfPageCount(f);
    if (!n) return setError("PDF를 읽지 못했어요. 합본은 PDF로 올려 주세요");
    setPages(n);
    setPer(Math.max(1, Math.round(n / Math.max(1, ids.length))));
    setManual([{ from: 1, to: Math.min(n, 2), studentId: ids[0] ?? null }]);
  };
  const ranges = pages ? (mode === "order" ? quickSplit(pages, per, ids) : manual) : [];
  const assigned = ranges.filter((r) => r.studentId);
  const problem = pages ? validateRanges(assigned.length ? assigned : ranges, pages) : null;
  const fit = pages ? (per * ids.length === pages ? "ok" : per * ids.length > pages ? "short" : "over") : null;
  const go = () => file && pages && !problem && start(async () => {
    setError("");
    const files = await splitPdfRanges(file, assigned);
    const parts = assigned.map((r, k) => ({ studentId: r.studentId!, file: files[k], range: r }));
    const e = await run(parts, setProgress).catch(() => "나누지 못했어요. 다시 해 주세요");
    setProgress("");
    if (e) return setError(e);
    onClose();
  });
  const setRow = (i: number, patch: Partial<PageRange>) => setManual((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const num = "h-8 w-14 rounded-chip bg-soft px-2 text-[13px] outline-none focus:ring-2 focus:ring-key";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="합본 PDF 나누기">
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[640px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">합본 PDF 나누기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        {!file ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-control border border-dashed border-faint px-4 py-8 text-center text-[14px] font-bold text-key-strong">
            합본 PDF 고르기
            <span className="text-[12px] font-normal text-mute">학생 자료를 한 파일로 스캔한 PDF · 브라우저에서 나눠요</span>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <div className="flex items-center gap-2 rounded-control bg-bg px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{file.name}</span>
            {pages && <span className="shrink-0 text-[13px] font-medium text-sub">{pages}쪽</span>}
            <button type="button" onClick={() => pickFile(null)} className="shrink-0 text-[13px] font-bold text-key-strong">다른 파일</button>
          </div>
        )}
        {pages && (
          <>
            <div className="flex gap-1 rounded-inner bg-soft p-1">
              {([["order", "번호순"], ["manual", "페이지 지정"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                  className={cx("h-[34px] flex-1 rounded-control text-[14px]", mode === k ? "border border-line bg-[#fff] font-bold" : "font-medium text-mute")}>{l}</button>
              ))}
            </div>
            {mode === "order" ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[14px] font-medium text-sub">한 사람</span>
                  <span className="flex items-center rounded-control border border-hair">
                    <button type="button" aria-label="한 쪽 줄이기" onClick={() => setPer(Math.max(1, per - 1))} className="px-2.5 py-1.5"><Minus size={14} /></button>
                    <span className="min-w-10 text-center text-[14px] font-bold">{per}쪽</span>
                    <button type="button" aria-label="한 쪽 늘리기" onClick={() => setPer(Math.min(pages, per + 1))} className="px-2.5 py-1.5"><Plus size={14} /></button>
                  </span>
                  <span className={cx("text-[13px] font-medium", fit === "ok" ? "text-ok" : "text-[#9a6400]")}>
                    씩 · 명렬표 번호순 · {ids.length}명 {fit === "ok" ? `= ${pages}쪽 딱 맞음` : fit === "short" ? `— ${pages}쪽이라 뒤 학생은 비어요` : `— ${pages - per * ids.length}쪽이 남아요`}
                  </span>
                </div>
                <ul className="max-h-64 overflow-y-auto rounded-inner border border-line">
                  {ranges.map((r, i) => (
                    <li key={i} className="flex h-11 items-center gap-3 border-t border-soft px-3.5 first:border-0">
                      <span className="w-16 shrink-0 text-[13px] font-bold text-key-strong">{rangeLabel(r)}</span>
                      <span className={cx("min-w-0 flex-1 truncate text-[14px] font-medium", !r.studentId && "text-mute")}>{r.studentId ? nameOf.get(r.studentId) : "학생 없음 (빼요)"}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="overflow-hidden rounded-inner border border-line">
                {manual.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 border-t border-soft px-3 py-2 first:border-0">
                    <input aria-label="시작 쪽" inputMode="numeric" value={r.from || ""} onChange={(e) => setRow(i, { from: Number(e.target.value.replace(/\D/g, "")) })} className={num} />
                    <span className="text-mute">–</span>
                    <input aria-label="끝 쪽" inputMode="numeric" value={r.to || ""} onChange={(e) => setRow(i, { to: Number(e.target.value.replace(/\D/g, "")) })} className={num} />
                    <span className="text-[13px] text-mute">쪽</span>
                    <select aria-label="학생" value={r.studentId ?? ""} onChange={(e) => setRow(i, { studentId: e.target.value || null })} className="h-8 min-w-0 flex-1 rounded-chip bg-soft px-2 text-[13px]">
                      <option value="">학생 고르기</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.no} {s.name}</option>)}
                    </select>
                    <button type="button" aria-label="구간 빼기" onClick={() => setManual((rs) => rs.filter((_, k) => k !== i))} className="text-faint hover:text-bad"><X size={15} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => { const last = manual.at(-1); const from = Math.min(pages, (last?.to ?? 0) + 1); const used = new Set(manual.map((m) => m.studentId)); setManual([...manual, { from, to: Math.min(pages, from + per - 1), studentId: ids.find((x) => !used.has(x)) ?? null }]); }}
                  className="flex h-11 w-full items-center gap-1.5 border-t border-soft px-3 text-[14px] font-bold text-key-strong hover:bg-soft"><Plus size={14} /> 구간 추가</button>
              </div>
            )}
            <p className="rounded-control bg-bg px-3 py-2 text-[12px] text-sub">{note}</p>
          </>
        )}
        {problem && pages && <p className="text-[13px] text-bad" role="alert">{problem}</p>}
        {progress && <p className="text-[13px] font-medium text-key-strong" role="status">{progress}</p>}
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending || !pages || !!problem || !assigned.length} onClick={go}>{pending ? "나누는 중…" : confirm(assigned.length)}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
