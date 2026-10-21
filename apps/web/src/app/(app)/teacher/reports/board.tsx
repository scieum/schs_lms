"use client";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button, cx } from "@/components/ui";
import {
  itemsFor, LOGS_ON_PAPER, REPORT_ITEM_LABEL, reportTiles, TERM_LABEL,
  type ReportItem, type ReportScopeKind, type ReportStatus, type ReportTerm, type StudentReport,
} from "@/lib/domain/report";
import { reportAiAction, type ReportAi } from "./actions";

// 학생 리포트 (Figma N55): 만들기 칸 · 학생 넘기기 · 리포트 종이(화면 = 읽기 좋은 카드, 인쇄 = 학생마다 A4 한 장).
// 한마디 · AI 한눈에 보기는 이 화면에만 (저장 안 함). 인쇄는 브라우저 인쇄 → "PDF로 저장"으로 파일도 된다.

type Scope = { key: string; kind: ReportScopeKind; label: string; count: number };
type Ai = Extract<ReportAi, { ok: true }>;

export function PrintButton({ count, className }: { count: number; className?: string }) {
  return <Button type="button" className={className} onClick={() => window.print()}><Download size={16} /> {count}명 인쇄 · PDF로 저장</Button>;
}

export function ReportBoard({ scopes, scope, kind, term, items: initialItems, reports, head, byLine, nowTerm, aiOn }: {
  scopes: Scope[]; scope: string; kind: ReportScopeKind; term: ReportTerm; items: ReportItem[]; reports: StudentReport[];
  head: string; byLine: string; nowTerm: 1 | 2; aiOn: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  // AI 가 꺼져 있으면 AI 한눈에 보기는 처음부터 뺀다
  const [items, setItems] = useState(aiOn ? initialItems : initialItems.filter((x) => x !== "ai"));
  const logsLabel = kind === "course" ? "세특 조각" : kind === "club" ? "동아리 누가기록" : "누가기록";
  const [noteOn, setNoteOn] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<Record<string, Ai>>({});
  const [aiError, setAiError] = useState("");
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  // 인쇄용 portal 은 브라우저에서만 (서버 렌더에는 document 가 없다)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const go = (q: { scope?: string; term?: ReportTerm; items?: ReportItem[] | null }) => {
    const p = new URLSearchParams({ scope: q.scope ?? scope, term: String(q.term ?? term) });
    const its = q.items === undefined ? items : q.items;
    if (its) p.set("items", its.join(","));
    start(() => router.push(`${path}?${p}`, { scroll: false }));
  };
  const toggle = (it: ReportItem) => {
    const next = items.includes(it) ? items.filter((x) => x !== it) : itemsFor(kind).filter((x) => x === it || items.includes(x));
    setItems(next);
    router.replace(`${path}?${new URLSearchParams({ scope, term: String(term), items: next.join(",") })}`, { scroll: false });
  };
  const r = reports[Math.min(i, reports.length - 1)];
  const makeAi = () => r && start(async () => {
    setAiError("");
    const res = await reportAiAction({ scope, term: String(term), items: items.join(","), studentId: r.id });
    if (!res.ok) return setAiError(res.error);
    setAi((m) => ({ ...m, [r.id]: res }));
  });
  const choices = itemsFor(kind);
  const terms: ReportTerm[] = [1, 2, "year"];

  const config = (
    <div className="surface flex flex-col gap-4 rounded-card p-4 md:p-5">
      <h2 className="hidden text-[17px] font-bold md:block">리포트 만들기</h2>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-sub">
        대상
        <select value={scope} onChange={(e) => { setI(0); go({ scope: e.target.value, items: null }); }} className="h-11 rounded-control bg-soft px-3 text-[15px] font-medium text-ink">
          {scopes.map((s) => <option key={s.key} value={s.key}>{s.label} · {s.count}명</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-sub">학기</span>
        <div className="flex gap-1 rounded-inner bg-soft p-1">
          {terms.map((t) => (
            <button key={String(t)} type="button" aria-pressed={term === t} onClick={() => go({ term: t })}
              className={cx("h-[34px] flex-1 whitespace-nowrap rounded-control text-[13px]", term === t ? "border border-line bg-[#fff] font-bold text-ink" : "font-medium text-mute")}>
              {TERM_LABEL(t)}{t === nowTerm && " · 지금"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center pb-1"><span className="flex-1 text-[13px] font-bold text-sub">넣을 것</span><span className="text-[12px] text-mute">{choices.length}개 중 {items.length}</span></div>
        {choices.map((it) => (
          <label key={it} className="flex h-9 cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={items.includes(it)} onChange={() => toggle(it)} className="size-[18px] accent-[#536DFE]" disabled={it === "ai" && !aiOn} />
            <span className={cx("text-[14px] font-medium", !items.includes(it) && "text-mute")}>{it === "logs" ? logsLabel : kind === "club" && it === "record" ? "동아리 특기사항" : REPORT_ITEM_LABEL[it]}</span>
            {it === "ai" && <span className="rounded-chip bg-new-soft px-1.5 text-[10px] font-bold text-new">AI</span>}
            <span className="flex-1" />
            {it === "logs" && <span className="text-[12px] text-mute">최근 {LOGS_ON_PAPER}건</span>}
            {it === "counsel" && <span className="text-[12px] text-mute">민감 · 처음엔 꺼짐</span>}
          </label>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2.5">
        <span className="flex-1 text-[13px] font-bold text-sub">선생님 한마디 칸</span>
        <button type="button" role="switch" aria-checked={noteOn} onClick={() => setNoteOn(!noteOn)} className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", noteOn ? "bg-key" : "bg-faint")}>
          <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", noteOn ? "left-[18px]" : "left-0.5")} />
        </button>
      </label>
    </div>
  );

  return (
    <div className={cx("grid items-start gap-4 md:grid-cols-[320px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]", pending && "opacity-70")}>
      <div className="flex flex-col gap-4 md:sticky md:top-6">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="surface flex items-center gap-3 rounded-card px-4 py-3.5 text-left md:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold">{scopes.find((s) => s.key === scope)?.label} · {reports.length}명</span>
            <span className="block text-[13px] text-mute">{TERM_LABEL(term)} · {items.length}가지{noteOn ? " · 한마디 칸" : ""}</span>
          </span>
          <span className="flex items-center gap-1 text-[13px] font-bold text-key-strong">바꾸기 <ChevronDown size={14} className={cx(open && "rotate-180")} /></span>
        </button>
        <div className={cx(!open && "hidden md:block")}>{config}</div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {!r ? (
          <div className="surface rounded-card px-4 py-10 text-center text-[14px] text-sub">이 범위에 학생이 없어요</div>
        ) : (
          <>
            <div className="surface flex items-center gap-2 rounded-card p-1.5 md:gap-2.5 md:p-2">
              <button type="button" aria-label="이전 학생" disabled={i === 0} onClick={() => setI(i - 1)} className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line text-sub disabled:opacity-40 md:size-10"><ChevronLeft size={18} /></button>
              <select value={r.id} onChange={(e) => setI(reports.findIndex((x) => x.id === e.target.value))} aria-label="학생 고르기"
                className="h-10 min-w-0 flex-1 truncate bg-transparent text-center text-[15px] font-bold md:flex-none md:text-left md:text-[16px]">
                {reports.map((x) => <option key={x.id} value={x.id}>{x.classLine.split(" · ").at(-1)} {x.name}</option>)}
              </select>
              <span className="hidden shrink-0 text-[13px] font-medium text-mute md:inline">{i + 1} / {reports.length}</span>
              <span className="hidden flex-1 md:block" />
              {items.includes("ai") && aiOn && (
                <button type="button" onClick={makeAi} disabled={pending} className="hidden h-9 shrink-0 items-center gap-1.5 rounded-control border border-hair px-3 text-[13px] font-medium md:flex">
                  <span className="rounded-chip bg-new-soft px-1.5 text-[11px] font-bold text-new">AI</span>{ai[r.id] ? "한눈에 보기 다시 만들기" : "한눈에 보기 만들기"}
                </button>
              )}
              <button type="button" aria-label="다음 학생" disabled={i >= reports.length - 1} onClick={() => setI(i + 1)} className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line text-sub disabled:opacity-40 md:size-10"><ChevronRight size={18} /></button>
            </div>
            {aiError && <p className="text-[13px] text-bad" role="alert">{aiError}</p>}
            <Paper logsLabel={logsLabel} r={r} n={i + 1} total={reports.length} items={items} head={head} byLine={byLine} ai={ai[r.id]} onAi={aiOn ? makeAi : undefined} aiBusy={pending}
              note={noteOn ? notes[r.id] ?? "" : null} onNote={(t) => setNotes((m) => ({ ...m, [r.id]: t }))} />
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+66px)] z-20 -mx-4 border-t border-line bg-[#fff] px-4 py-3 md:hidden">
              <PrintButton count={reports.length} className="h-12 w-full" />
            </div>
          </>
        )}
      </div>

      {/* 인쇄용: 학생마다 A4 한 장 (화면에서는 숨김, body 바로 아래로 — 인쇄 때만 보인다) */}
      {mounted && createPortal(
        <div className="print-root hidden print:block">
          {reports.map((x, k) => (
            <Paper key={x.id} print logsLabel={logsLabel} r={x} n={k + 1} total={reports.length} items={items} head={head} byLine={byLine} ai={ai[x.id]} note={noteOn ? notes[x.id] ?? "" : null} />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

const STATUS_CHIP: Record<ReportStatus, string> = { 확정: "bg-ok-soft text-ok", 임시: "bg-wait-soft text-[#9a6400]", "비어 있음": "bg-soft text-mute" };
const Chip = ({ s }: { s: ReportStatus }) => <span className={cx("rounded-chip px-1.5 py-px text-[11px] font-bold", STATUS_CHIP[s])}>{s}</span>;

const H = ({ t, right }: { t: string; right?: ReactNode }) => <div className="flex items-center gap-1.5"><h3 className="text-[14px] font-bold">{t}</h3>{right}</div>;

/** 리포트 한 장. print 이면 A4 (210mm, 쪽 나눔) */
function Paper({ r, n, total, items, head, byLine, ai, onAi, aiBusy, note, onNote, print, logsLabel }: {
  logsLabel: string; r: StudentReport; n: number; total: number; items: ReportItem[]; head: string; byLine: string; ai?: Ai; onAi?: () => void; aiBusy?: boolean;
  note: string | null; onNote?: (t: string) => void; print?: boolean;
}) {
  const on = new Set(items);
  const tiles = reportTiles(r, items);
  const nothing = <p className="text-[12px] text-faint">아직 없어요</p>;
  return (
    <article className={cx("flex flex-col gap-4 bg-[#fff] text-ink", print ? "print-paper min-h-[297mm] w-[210mm] px-[14mm] py-[12mm]" : "rounded-card border border-line p-4 md:p-10")}>
      <header className="flex flex-col gap-2 md:flex-row md:items-end print:flex-row print:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-mute">{head}</p>
          <p className="text-[24px] font-bold md:text-[26px]">{r.name}</p>
          <p className="text-[14px] text-sub">{r.classLine}</p>
        </div>
        <div className="md:text-right print:text-right">
          <p className="text-[13px] font-bold">속초고등학교</p>
          <p className="text-[12px] text-mute">{byLine}</p>
        </div>
      </header>
      <hr className="border-t-2 border-ink" />
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 print:grid-cols-4">
          {tiles.map((t) => <div key={t.label} className="rounded-control bg-bg px-3 py-2.5"><p className="text-[11px] font-medium text-mute">{t.label}</p><p className="text-[18px] font-bold">{t.value}</p></div>)}
        </div>
      )}
      {on.has("ai") && (ai ? (
        <div className="flex flex-col gap-1.5 rounded-control bg-key-soft px-3.5 py-3">
          <div className="flex items-center gap-1.5"><span className="rounded-chip bg-new px-1.5 text-[11px] font-bold text-white">AI</span><span className="text-[13px] font-bold text-key-strong">한눈에 보기</span></div>
          {([["강점", ai.strength], ["자란 점", ai.growth], ["다음에", ai.next]] as const).map(([k, t]) => (
            <p key={k} className="flex gap-2.5 text-[12px] leading-5"><span className="w-[52px] shrink-0 font-bold text-key-strong">{k}</span><span>{t}</span></p>
          ))}
        </div>
      ) : onAi && !print ? (
        <button type="button" onClick={onAi} disabled={aiBusy} className="flex items-center justify-center gap-1.5 rounded-control border border-dashed border-faint py-3 text-[13px] font-bold text-key-strong hover:bg-key-soft">
          <span className="rounded-chip bg-new-soft px-1.5 text-[11px] font-bold text-new">AI</span>{aiBusy ? "만드는 중…" : "한눈에 보기 만들기"}
        </button>
      ) : null)}
      {on.has("setuk") && (
        <section className="flex flex-col gap-2">
          <H t="교과 세특" />
          {r.setuk.length ? r.setuk.map((t) => (
            <div key={t.label} className="flex flex-col gap-1"><p className="flex items-center gap-1.5 text-[12px] font-bold text-sub">{t.label} <Chip s={t.status} /></p><p className="whitespace-pre-line text-[12px] leading-5 text-[#333d4b]">{t.text || "—"}</p></div>
          )) : nothing}
        </section>
      )}
      {on.has("record") && r.record.length > 0 && (
        <section className="flex flex-col gap-2">
          <H t={r.record.length === 1 ? "동아리 특기사항" : "창의적 체험활동"} />
          <div className={cx("grid gap-2.5", r.record.length > 1 && "md:grid-cols-3 print:grid-cols-3")}>
            {r.record.map((t) => (
              <div key={t.label} className="flex flex-col gap-1 rounded-control border border-line px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-bold">{t.label} <Chip s={t.status} /></p>
                <p className={cx("whitespace-pre-line text-[11px] leading-[18px] text-sub", !print && r.record.length > 1 && "line-clamp-6 md:line-clamp-none")}>{t.text || "아직 없어요"}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {on.has("behavior") && r.behavior && (
        <section className="flex flex-col gap-1.5"><H t="행동특성 및 종합의견" right={<Chip s={r.behavior.status} />} /><p className="whitespace-pre-line text-[12px] leading-5 text-[#333d4b]">{r.behavior.text || "아직 없어요"}</p></section>
      )}
      {on.has("logs") && (
        <section className="flex flex-col gap-1.5">
          <H t={logsLabel} right={r.logs.length > LOGS_ON_PAPER ? <span className="rounded-chip bg-soft px-1.5 text-[11px] font-bold text-mute">{r.logs.length}건 중 최근 {LOGS_ON_PAPER}</span> : undefined} />
          {r.logs.length ? r.logs.slice(0, LOGS_ON_PAPER).map((l, k) => (
            <p key={k} className="flex items-start gap-2 text-[12px] leading-5">
              <span className="w-9 shrink-0 font-medium text-mute">{l.date.slice(5).replace("-", ".")}</span>
              <span className="shrink-0 rounded-chip bg-soft px-1.5 text-[11px] font-bold text-sub">{l.tag}</span>
              <span className="min-w-0 flex-1 text-[#333d4b]">{l.text}</span>
            </p>
          )) : nothing}
        </section>
      )}
      {(on.has("program") || on.has("service")) && (
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
          {on.has("program") && <section className="flex flex-col gap-1.5"><H t="특색활동" />{r.programs.length ? r.programs.map((p) => <p key={p.title + p.date} className="text-[12px] text-[#333d4b]">{p.title} · 확정</p>) : nothing}</section>}
          {on.has("service") && (
            <section className="flex flex-col gap-1.5">
              <H t="봉사" right={r.service.length ? <span className="rounded-chip bg-key-soft px-1.5 text-[11px] font-bold text-key-strong">{r.service.reduce((a, s) => a + s.hours, 0)}시간</span> : undefined} />
              {r.service.length ? r.service.slice(0, 5).map((s, k) => <p key={k} className="text-[12px] text-[#333d4b]">{s.date.slice(5).replace("-", ".")} {s.activity} {s.hours}시간</p>) : nothing}
            </section>
          )}
        </div>
      )}
      {on.has("counsel") && (
        <section className="flex flex-col gap-1.5">
          <H t="상담 기록" />
          {r.counsel.length ? r.counsel.slice(0, 4).map((c, k) => <p key={k} className="flex gap-2 text-[12px] leading-5"><span className="w-9 shrink-0 text-mute">{c.date.slice(5).replace("-", ".")}</span><span className="shrink-0 font-bold text-sub">{c.tag}</span><span className="min-w-0 flex-1">{c.text}</span></p>) : nothing}
        </section>
      )}
      <div className="flex-1" />
      {note !== null && (
        <section className="flex flex-col gap-1 rounded-control border border-dashed border-hair px-3.5 py-2.5">
          <p className="text-[12px] font-bold text-sub">선생님 한마디</p>
          {print || !onNote
            ? <p className="min-h-10 whitespace-pre-line text-[12px] leading-5">{note}</p>
            : <textarea value={note} onChange={(e) => onNote(e.target.value)} rows={2} maxLength={300} placeholder="학생에게 건넬 말 (인쇄에만 들어가요 · 저장 안 됨)" className="resize-none bg-transparent text-[13px] leading-5 outline-none" />}
        </section>
      )}
      <footer className="flex text-[10px] text-faint"><span className="flex-1">속초고등학교 학생관리시스템 · 교사 확인용</span><span className="font-medium text-mute">{n} / {total}</span></footer>
    </article>
  );
}
