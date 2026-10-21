"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Minus, PencilLine, Plus, Upload, X } from "lucide-react";
import { Button, ButtonLink, cx } from "@/components/ui";
import { ASSESS_LIMITS } from "@/lib/domain/assessment";
import { quickSplit, rangeLabel, validateRanges, type PageRange } from "@/lib/domain/program";
import { pdfPageCount, prepareUpload, splitPdfRanges } from "@/lib/client/shrink-upload";
import { ACCEPT } from "@/components/writing/evidence-files";
import { deleteAssessment, readAssessmentFile, saveAssessment } from "./actions";

// 세특 · 수행평가 (Figma N59): 목록 · 고른 수행평가 칸 · 등록 창 · 한 명씩 올리기 · 합본 PDF 나누기(번호순 | 페이지 지정).
// 나누기는 브라우저에서 하고(큰 합본도 됨), 학생마다 한 파일씩 서버가 AI로 읽어 요약만 조각으로 남긴다.

type Item = { id: string; title: string; date: string; description: string; done: number };
type Sel = { id: string; title: string; date: string; description: string };
type Stu = { id: string; no: string; name: string; summary: string | null };

const dot = (d: string) => `${Number(d.slice(5, 7))}. ${Number(d.slice(8, 10))}.`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 한 학생 파일(크면 쪽을 나눠 여러 번) → 요약 조각 */
async function readFor(assessmentId: string, studentId: string, file: File): Promise<string | null> {
  for (const part of await prepareUpload(file)) {
    const fd = new FormData();
    fd.set("assessmentId", assessmentId);
    fd.set("studentId", studentId);
    fd.set("file", part);
    const r = await readAssessmentFile(fd);
    if (!r.ok) return r.error;
  }
  return null;
}

export function NewAssessButton({ courseId, section, base }: { courseId: string; section: string | null; base: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> <span className="md:hidden">등록</span><span className="hidden md:inline">수행평가 등록</span></Button>
      {open && <RegisterDialog courseId={courseId} section={section} base={base} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AssessBoard({ base, aiOn, items, selected, total, students, composeHref }: {
  base: string; aiOn: boolean; items: Item[]; selected: Sel | null; total: number; students: Stu[]; composeHref: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "edit" | "one" | "split">(null);
  const [who, setWho] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!items.length) {
    return (
      <div className="surface flex flex-col items-center gap-2 rounded-card px-4 py-10 text-center">
        <p className="text-[16px] font-bold">이 반에 등록한 수행평가가 없어요</p>
        <p className="text-[13px] text-sub">수행평가를 등록하고 학생 자료를 올리면 AI가 읽어 글 짓기 조각으로 넣어요</p>
      </div>
    );
  }
  const done = students.filter((s) => s.summary).length;
  const pick = students.find((s) => s.id === who) ?? students.find((s) => s.summary) ?? null;
  const remove = () => selected && start(async () => {
    const r = await deleteAssessment(selected.id);
    if (!r.ok) return setError(r.error);
    router.push(base);
  });
  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(260px,376px)_minmax(0,1fr)] md:gap-6">
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:overflow-visible">
        {items.map((a) => {
          const on = a.id === selected?.id;
          return (
            <li key={a.id} className="shrink-0 md:shrink">
              <Link href={`${base}&a=${a.id}`} aria-current={on ? "true" : undefined}
                className={cx("flex flex-col gap-1 whitespace-nowrap rounded-inner px-4 py-3 md:whitespace-normal md:py-3.5", on ? "bg-key-soft" : "bg-[#fff] hover:bg-soft")}>
                <span className={cx("text-[15px] font-bold", on && "text-key-strong")}>{a.title}</span>
                <span className="text-[13px] text-mute">{dot(a.date)} · 자료 {a.done} / {total}명</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {selected && (
        <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:p-6">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-[18px] font-bold">{selected.title}</h2>
            <span className="shrink-0 rounded-chip bg-soft px-1.5 py-px text-[12px] font-bold text-sub">{dot(selected.date)}</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setDialog("edit")} className="shrink-0 text-[13px] font-medium text-sub hover:text-ink">고치기</button>
            <button type="button" onClick={remove} disabled={pending} className="shrink-0 text-[13px] font-medium text-bad">지우기</button>
          </div>
          {selected.description && <p className="whitespace-pre-line text-[13px] leading-5 text-sub">{selected.description}</p>}
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-bold">자료</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-key" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
            <span className="text-[13px] font-bold tabular-nums text-key-strong">{done} / {total}명</span>
          </div>
          {!aiOn && <p className="rounded-control bg-wait-soft px-3 py-2 text-[12px] text-[#9a6400]">AI가 꺼져 있어 글자 파일(hwpx · txt)만 앞부분을 그대로 넣어요</p>}
          <div className="flex flex-col gap-2 md:flex-row">
            <Button type="button" className="md:flex-none" onClick={() => setDialog("split")}><Upload size={15} /> 합본 PDF 나누기</Button>
            <Button type="button" kind="outline" className="md:flex-none" onClick={() => { setWho(null); setDialog("one"); }}>학생 자료 한 명씩</Button>
            <span className="hidden flex-1 md:block" />
            <ButtonLink href={composeHref} kind="soft" className="md:flex-none"><PencilLine size={15} /> 글 짓기</ButtonLink>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {students.map((s) => (
              <button key={s.id} type="button" onClick={() => (s.summary ? setWho(s.id) : (setWho(s.id), setDialog("one")))}
                className={cx("flex h-11 items-center gap-2 rounded-control border px-3 text-left", s.summary ? "border-line bg-[#fff]" : "border-line bg-bg", pick?.id === s.id && s.summary && "border-key")}>
                <span className="shrink-0 text-[12px] font-medium text-mute">{s.no}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[14px] font-bold", !s.summary && "text-mute")}>{s.name}</span>
                <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[11px] font-bold", s.summary ? "bg-ok-soft text-ok" : "bg-key-soft text-key-strong")}>{s.summary ? "✓ 자료" : "올리기"}</span>
              </button>
            ))}
          </div>
          {pick?.summary && (
            <div className="flex flex-col gap-1.5 rounded-control bg-bg px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold">
                <span className="rounded-chip bg-new-soft px-1.5 text-[11px] font-bold text-new">AI</span>{pick.no} {pick.name} 자료 요약
                <span className="ml-auto text-[12px] font-medium text-ok">조각으로 들어감</span>
              </p>
              <p className="whitespace-pre-line text-[13px] leading-5 text-[#333d4b]">{pick.summary}</p>
            </div>
          )}
          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        </section>
      )}

      {selected && dialog === "edit" && <RegisterDialog item={selected} base={base} onClose={() => setDialog(null)} />}
      {selected && dialog === "one" && <OneDialog assessmentId={selected.id} students={students} first={who} onClose={() => setDialog(null)} />}
      {selected && dialog === "split" && <SplitDialog assessmentId={selected.id} students={students} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Shell({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx("flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:rounded-[16px] md:px-7 md:py-6", wide ? "md:max-w-[640px]" : "md:max-w-[560px]")}>
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RegisterDialog({ courseId, section, item, base, onClose }: { courseId?: string; section?: string | null; item?: Sel; base: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.date ?? today());
  const [description, setDescription] = useState(item?.description ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError("");
    const r = await saveAssessment({ id: item?.id, courseId: courseId ?? "", section: section ?? null, title, date, description });
    if (!r.ok) return setError(r.error);
    onClose();
    router.push(`${base}&a=${r.id}`);
  });
  const field = "h-11 rounded-control bg-soft px-3 text-[15px] text-ink outline-none focus:ring-2 focus:ring-key";
  return (
    <Shell title={item ? "수행평가 고치기" : "수행평가 등록"} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-[1fr_170px]">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">이름<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ASSESS_LIMITS.title} placeholder="예: 빗면 실험 보고서" className={field} /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">날짜<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">평가 내용 · 기준 (선택)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={ASSESS_LIMITS.description} rows={4} placeholder="무엇을 했고 어떻게 평가했는지 — AI가 학생 자료를 읽을 때 참고해요"
          className="resize-y rounded-control bg-soft px-3 py-2.5 text-[14px] leading-6 text-ink outline-none focus:ring-2 focus:ring-key" />
      </label>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
        <Button type="button" className="flex-1 md:flex-none" disabled={pending} onClick={save}>{pending ? "저장 중…" : item ? "고치기" : "등록"}</Button>
      </div>
    </Shell>
  );
}

function OneDialog({ assessmentId, students, first, onClose }: { assessmentId: string; students: Stu[]; first: string | null; onClose: () => void }) {
  const router = useRouter();
  const [who, setWho] = useState(first ?? students.find((s) => !s.summary)?.id ?? students[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const go = () => file && start(async () => {
    setError("");
    const e = await readFor(assessmentId, who, file);
    if (e) return setError(e);
    onClose();
    router.refresh();
  });
  return (
    <Shell title="학생 자료 한 명씩" onClose={onClose}>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">학생
        <select value={who} onChange={(e) => setWho(e.target.value)} className="h-11 rounded-control bg-soft px-3 text-[15px] text-ink">
          {students.map((s) => <option key={s.id} value={s.id}>{s.no} {s.name}{s.summary ? " · 자료 있음" : ""}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">파일 (PDF · 사진 · hwpx · txt)
        <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-control border border-dashed border-faint px-3 py-3 text-[14px]" />
      </label>
      <p className="rounded-control bg-bg px-3 py-2 text-[12px] text-sub">AI가 읽어 요약만 조각으로 남겨요 · 파일은 저장하지 않아요 · 다시 올리면 새 요약이 더해져요</p>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
        <Button type="button" className="flex-1 md:flex-none" disabled={pending || !file || !who} onClick={go}>{pending ? "읽는 중…" : "올리고 읽기"}</Button>
      </div>
    </Shell>
  );
}

function SplitDialog({ assessmentId, students, onClose }: { assessmentId: string; students: Stu[]; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [mode, setMode] = useState<"order" | "manual">("order");
  const [per, setPer] = useState(2);
  const [manual, setManual] = useState<PageRange[]>([]);
  const [progress, setProgress] = useState<string>("");
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
  const run = () => file && pages && !problem && start(async () => {
    setError("");
    const todo = assigned;
    const parts = await splitPdfRanges(file, todo);
    const fails: string[] = [];
    for (let k = 0; k < todo.length; k++) {
      setProgress(`${k + 1} / ${todo.length}명 읽는 중 · ${nameOf.get(todo[k].studentId!)}`);
      const e = await readFor(assessmentId, todo[k].studentId!, parts[k]);
      if (e) fails.push(`${nameOf.get(todo[k].studentId!)}: ${e}`);
    }
    setProgress("");
    if (fails.length) { setError(`${todo.length - fails.length}명 넣었어요 · ${fails.length}명 못 읽음 — ${fails.slice(0, 2).join(" / ")}`); router.refresh(); return; }
    onClose();
    router.refresh();
  });
  const setRow = (i: number, patch: Partial<PageRange>) => setManual((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const num = "h-8 w-14 rounded-chip bg-soft px-2 text-[13px] outline-none focus:ring-2 focus:ring-key";
  return (
    <Shell title="합본 PDF 나누기" onClose={onClose} wide>
      {!file ? (
        <label className="flex flex-col items-center gap-2 rounded-control border border-dashed border-faint px-4 py-8 text-center text-[14px] font-bold text-key-strong">
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
              <button type="button" onClick={() => { const last = manual.at(-1); const from = Math.min(pages, (last?.to ?? 0) + 1); const usedIds = new Set(manual.map((m) => m.studentId)); setManual([...manual, { from, to: Math.min(pages, from + per - 1), studentId: ids.find((x) => !usedIds.has(x)) ?? null }]); }}
                className="flex h-11 w-full items-center gap-1.5 border-t border-soft px-3 text-[14px] font-bold text-key-strong hover:bg-soft"><Plus size={14} /> 구간 추가</button>
            </div>
          )}
          <p className="rounded-control bg-bg px-3 py-2 text-[12px] text-sub">나눈 파일은 학생마다 AI가 읽어 요약만 조각으로 남겨요 · 파일은 저장하지 않아요</p>
        </>
      )}
      {problem && pages && <p className="text-[13px] text-bad" role="alert">{problem}</p>}
      {progress && <p className="text-[13px] font-medium text-key-strong" role="status">{progress}</p>}
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
        <Button type="button" className="flex-1 md:flex-none" disabled={pending || !pages || !!problem || !assigned.length} onClick={run}>{pending ? "읽는 중…" : `${assigned.length}명 자료 만들기`}</Button>
      </div>
    </Shell>
  );
}
