"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, PencilLine, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button, ButtonLink, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import {
  GRADE_LIMITS, RUBRIC_LIMITS, SCALE_LABELS, SCALE_NAME, changePoints, changeScale, gradeLine, gradeTotal, newCriterion, rubricTotal,
  type GradePick, type GradeStatus, type Rubric, type RubricScale,
} from "@/lib/domain/rubric";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "@/components/writing/evidence-files";
import { confirmGrade, courseStandards, draftRubricAction, gradeAssessmentFile, gradeAssessmentText, readAnswerPart, type StandardItem } from "./actions";

// 루브릭 채점 (Figma N72): 등록 창의 루브릭 표(N72 c) · 수행평가 칸(N72 a · d) · 채점 확인 창(N72 b · 모바일 시트 e).
// AI는 버튼으로만 — 루브릭 초안 · 답안 채점 제안. 확정은 교사가 수준을 보고 누른다(AI 없이 직접 골라도 된다).

export type GradeView = { status: GradeStatus; total: number; picks: GradePick[]; reading: string; piece: string };
export type RStu = { id: string; no: string; name: string; grade: GradeView | null };
type RSel = { id: string; title: string; rubric: Rubric };

// 머리(제목 · 닫기)와 footer(취소 · 저장)는 고정, 본문만 스크롤 (N72 f 733:2, 2026-10-26 — 모바일에서 [등록]이 맨 아래까지 내려야 보이던 것)
export function Shell({ title, onClose, children, footer, wide = false, label }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean | "xl"; label?: string }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : undefined)}>
      <div className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[#fff] md:rounded-[16px]",
        wide === "xl" ? "md:max-w-[920px]" : wide ? "md:max-w-[760px]" : "md:max-w-[560px]")}>
        <div className="flex shrink-0 items-center gap-2 border-b border-hair px-5 pb-3 pt-4 md:border-0 md:px-7 md:pb-4 md:pt-6">
          <h2 className="min-w-0 flex-1 text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <div className={cx("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-3 md:px-7 md:pt-0", footer ? "pb-4 md:pb-5" : "pb-5 md:pb-6")}>{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-hair px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 md:border-0 md:px-7 md:pb-6 md:pt-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const AiTag = ({ off = false }: { off?: boolean }) => <span className="rounded-[6px] bg-new-soft px-1.5 py-px text-[11px] font-bold text-new">{off ? "자동" : "AI"}</span>;

/** 답안 하나 → AI 채점 제안. 큰 PDF는 쪽마다 글로 옮겨 모은 뒤 한 번에 채점한다 */
export async function gradeFor(assessmentId: string, studentId: string, file: File): Promise<{ grade: GradeView } | { error: string }> {
  const parts = await prepareUpload(file);
  const fd = (part: File) => { const f = new FormData(); f.set("assessmentId", assessmentId); f.set("studentId", studentId); f.set("file", part); return f; };
  if (parts.length === 1) {
    const r = await gradeAssessmentFile(fd(parts[0]));
    return r.ok ? { grade: r.grade } : { error: r.error };
  }
  const texts: string[] = [];
  for (const part of parts) {
    const r = await readAnswerPart(fd(part));
    if (!r.ok) return { error: r.error };
    texts.push(r.text);
  }
  const r = await gradeAssessmentText({ assessmentId, studentId, text: texts.join("\n") });
  return r.ok ? { grade: r.grade } : { error: r.error };
}

// ---------- 등록 창 · 루브릭 표 (N72 c) ----------

export function RubricEditor({ courseId, section, title, description, rubric, setRubric, aiOn }: {
  courseId: string; section: string | null; title: string; description: string; rubric: Rubric; setRubric: (r: Rubric) => void; aiOn: boolean;
}) {
  const [std, setStd] = useState<{ subject: string | null; items: StandardItem[] } | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { let live = true; courseStandards(courseId, section).then((x) => live && setStd(x)).catch(() => live && setStd({ subject: null, items: [] })); return () => { live = false; }; }, [courseId, section]);
  const picked = rubric.standards;
  const found = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (std?.items ?? []).filter((s) => !picked.includes(s.code) && words.every((w) => `${s.code} ${s.text} ${s.unit}`.toLowerCase().includes(w))).slice(0, 8);
  }, [std, q, picked]);
  const textOf = (code: string) => std?.items.find((s) => s.code === code)?.text ?? "";
  const n = SCALE_LABELS[rubric.scale].length;
  const set = (i: number, c: Rubric["criteria"][number]) => setRubric({ ...rubric, criteria: rubric.criteria.map((x, k) => (k === i ? c : x)) });
  const draft = () => start(async () => {
    setError("");
    if (rubric.criteria.some((c) => c.name.trim()) && !window.confirm("지금 표를 AI 초안으로 바꿀까요?")) return;
    // 빈 표(처음 한 줄 10점)면 총점 20점으로, 기준을 적어 둔 표면 지금 총점을 지킨다
    const total = rubric.criteria.some((c) => c.name.trim()) ? rubricTotal(rubric) : 20;
    const r = await draftRubricAction({ courseId, section, title, description, standards: picked, scale: rubric.scale, total }).catch(() => ({ ok: false as const, error: "만들지 못했어요" }));
    if (!r.ok) return setError(r.error);
    setRubric({ ...r.rubric, standards: picked });
  });
  const cols = { "--cols": `150px 64px repeat(${n}, minmax(0, 1fr)) 36px` } as React.CSSProperties;
  const cell = "md:border-r md:border-line md:px-2.5 md:py-2";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center text-[13px] font-medium text-sub">
          <span>성취기준{std?.subject ? ` · ${std.subject}` : ""}</span>
          <span className="ml-auto text-[12px] text-mute">2022 개정</span>
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1.5 rounded-control bg-soft px-2.5 py-2">
            {picked.map((code) => (
              <span key={code} title={textOf(code)} className="inline-flex max-w-full items-center gap-1 rounded-chip bg-key-soft px-2 py-1 text-[12px] font-bold text-key-strong">
                <span className="truncate">{code} {textOf(code).slice(0, 18)}{textOf(code).length > 18 ? "…" : ""}</span>
                <button type="button" aria-label={`${code} 빼기`} onClick={() => setRubric({ ...rubric, standards: picked.filter((x) => x !== code) })}><X size={12} /></button>
              </span>
            ))}
            {std && !std.items.length ? (
              <span className="text-[13px] text-mute">이 과목은 성취기준 자료가 없어요 · 기준만 적어도 돼요</span>
            ) : picked.length < RUBRIC_LIMITS.standards && (
              <label className="flex min-w-[180px] flex-1 items-center gap-1.5">
                <Search size={13} className="shrink-0 text-mute" aria-hidden />
                <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                  placeholder={std ? "성취기준 찾기 — 낱말이나 코드" : "성취기준 불러오는 중…"} aria-label="성취기준 찾기"
                  className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute" />
              </label>
            )}
          </div>
          {open && found.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-[240px] overflow-y-auto rounded-inner border border-line bg-[#fff] p-1 shadow-lg">
              {found.map((s) => (
                <li key={s.code}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setRubric({ ...rubric, standards: [...picked, s.code] }); setQ(""); setOpen(false); }}
                    className="flex w-full flex-col gap-0.5 rounded-control px-2.5 py-2 text-left hover:bg-key-soft">
                    <span className="text-[12px] font-bold text-key-strong">{s.code} <span className="font-medium text-mute">· {s.unit}</span></span>
                    <span className="text-[13px] leading-5 text-ink">{s.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold">루브릭</span>
        <div className="flex rounded-control bg-soft p-[3px]" role="radiogroup" aria-label="수준 단계">
          {(["상중하", "A-E"] as RubricScale[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={rubric.scale === s} onClick={() => setRubric(changeScale(rubric, s))}
              className={cx("h-7 whitespace-nowrap rounded-chip px-3 text-[12px]", rubric.scale === s ? "border border-line bg-[#fff] font-bold text-key-strong" : "font-medium text-sub")}>{SCALE_NAME[s]}</button>
          ))}
        </div>
        <span className="hidden flex-1 md:block" />
        {aiOn && (
          <button type="button" onClick={draft} disabled={pending}
            className="flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50 md:h-9 md:w-auto">
            <AiTag /> {pending ? "만드는 중…" : "성취기준으로 루브릭 만들기"}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-inner border border-line" style={cols}>
        <div className="hidden bg-bg text-[12px] font-bold text-sub md:grid md:[grid-template-columns:var(--cols)]">
          <span className={cell}>평가 기준</span><span className={cell}>배점</span>
          {SCALE_LABELS[rubric.scale].map((l) => <span key={l} className={cell}>{l}</span>)}
          <span />
        </div>
        {/* 모바일(N72 f 733:2): 이름 · 배점 · 빼기 한 줄 + 수준마다 [수준 | 설명 | 점수] 한 줄. 컴퓨터는 표 한 줄(N72 c) */}
        {rubric.criteria.map((c, i) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2 border-t border-line p-3 first:border-t-0 md:items-stretch md:gap-0 md:p-0 md:[grid-template-columns:var(--cols)] md:first:border-t">
            <label className={cx("flex min-w-0 flex-col gap-1", cell)}>
              <span className="text-[12px] font-bold text-sub md:hidden">평가 기준 {i + 1}</span>
              <input value={c.name} onChange={(e) => set(i, { ...c, name: e.target.value })} maxLength={RUBRIC_LIMITS.name} placeholder="예: 근거 활용"
                className="h-9 rounded-control bg-soft px-2 text-[14px] font-bold outline-none focus:ring-2 focus:ring-key md:bg-transparent md:px-0" />
            </label>
            <label className={cx("flex flex-col gap-1 md:items-start", cell)}>
              <span className="text-[12px] font-bold text-sub md:hidden">배점</span>
              <input type="number" min={1} max={RUBRIC_LIMITS.points} value={c.points} aria-label={`${c.name || `기준 ${i + 1}`} 배점`}
                onChange={(e) => set(i, changePoints(c, rubric.scale, Math.max(1, Math.min(RUBRIC_LIMITS.points, Math.round(Number(e.target.value) || 1)))))}
                className="h-9 w-16 rounded-control bg-soft px-2 text-[14px] font-medium outline-none focus:ring-2 focus:ring-key md:w-full md:bg-transparent md:px-0" />
            </label>
            {c.levels.map((l, k) => (
              <div key={l.label} className={cx("col-span-3 grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2 max-md:order-last md:col-span-1 md:flex md:flex-col md:gap-1", cell)}>
                <span className="pt-2 text-center text-[13px] font-bold text-sub md:hidden">{l.label}</span>
                <textarea value={l.desc} rows={2} maxLength={RUBRIC_LIMITS.desc} aria-label={`${c.name || `기준 ${i + 1}`} ${l.label} 설명`} placeholder="이 수준에서 보이는 모습"
                  onChange={(e) => set(i, { ...c, levels: c.levels.map((x, j) => (j === k ? { ...x, desc: e.target.value } : x)) })}
                  className="min-h-[52px] resize-y rounded-control bg-soft px-2.5 py-2 text-[12px] leading-[18px] outline-none focus:ring-2 focus:ring-key md:min-h-[72px] md:bg-transparent md:px-0 md:py-1.5" />
                <label className="flex h-9 items-center gap-1 rounded-control bg-key-soft pr-2 text-[12px] font-bold text-key-strong md:h-auto md:bg-transparent md:pr-0">
                  <input type="number" min={0} max={c.points} value={l.points} aria-label={`${c.name || `기준 ${i + 1}`} ${l.label} 점수`}
                    onChange={(e) => set(i, { ...c, levels: c.levels.map((x, j) => (j === k ? { ...x, points: Math.max(0, Math.min(c.points, Math.round(Number(e.target.value) || 0))) } : x)) })}
                    className="h-9 w-10 rounded-[6px] bg-transparent px-1.5 text-right text-[12px] font-bold text-key-strong outline-none md:h-7 md:w-12 md:bg-key-soft md:text-left" />점
                </label>
              </div>
            ))}
            <div className="flex h-9 items-center md:h-auto md:items-start md:justify-center md:py-2">
              <button type="button" aria-label={`${c.name || `기준 ${i + 1}`} 빼기`} disabled={rubric.criteria.length < 2}
                onClick={() => setRubric({ ...rubric, criteria: rubric.criteria.filter((x) => x.id !== c.id) })} className="p-1 text-mute hover:text-bad disabled:opacity-30"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center">
        <button type="button" disabled={rubric.criteria.length >= RUBRIC_LIMITS.criteria} onClick={() => setRubric({ ...rubric, criteria: [...rubric.criteria, newCriterion(rubric.scale)] })}
          className="flex items-center gap-1 text-[13px] font-bold text-key-strong disabled:opacity-40"><Plus size={14} /> 기준 더하기</button>
        <span className="ml-auto text-[14px] font-bold">총점 {rubricTotal(rubric)}점</span>
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}

// ---------- 수행평가 칸 (N72 a · d) ----------

export function RubricPanel({ a, students, total, aiOn, composeHref, onSplit }: {
  a: RSel; students: RStu[]; total: number; aiOn: boolean; composeHref: string; onSplit: () => void;
}) {
  const [grading, setGrading] = useState<string | null>(null);
  const r = a.rubric;
  const done = students.filter((s) => s.grade?.status === "confirmed").length;
  const waiting = students.filter((s) => s.grade?.status === "ai");
  const firstOpen = students.find((s) => s.grade?.status !== "confirmed") ?? students[0];
  const max = rubricTotal(r);
  return (
    <>
      {r.standards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{r.standards.map((s) => <span key={s} className="rounded-chip bg-soft px-1.5 py-px text-[12px] font-bold text-sub">{s}</span>)}</div>
      )}
      <div className="grid overflow-hidden rounded-inner border border-line" style={{ gridTemplateColumns: `repeat(${r.criteria.length}, minmax(0, 1fr))` }}>
        {r.criteria.map((c, i) => (
          <div key={c.id} className={cx("flex min-w-0 flex-col gap-0.5 px-3 py-2.5 md:px-3.5", i > 0 && "border-l border-line")}>
            <span className="truncate text-[13px] font-bold">{c.name}</span>
            <span className="truncate text-[12px] text-mute">{c.points}점 · {SCALE_LABELS[r.scale].join(" · ")}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[13px] font-bold">확정</span>
        <span className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-key" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
        <span className="text-[13px] font-bold tabular-nums text-key-strong">{done} / {total}명</span>
        {waiting.length > 0 && <span className="rounded-chip bg-new-soft px-1.5 py-px text-[12px] font-bold text-new">AI 제안 {waiting.length}명 확인 기다림</span>}
      </div>
      {!aiOn && <p className="rounded-control bg-wait-soft px-3 py-2 text-[12px] text-[#9a6400]">AI가 꺼져 있어 답안을 읽지 못해요 · 학생을 눌러 수준을 직접 골라 확정할 수 있어요</p>}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        {aiOn && <Button type="button" className="md:flex-none" onClick={onSplit}><Upload size={15} /> 합본 PDF 나누기</Button>}
        <div className="flex gap-2">
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={() => firstOpen && setGrading(firstOpen.id)}>{aiOn ? "학생 답안 한 명씩" : "학생마다 채점"}</Button>
          <a href={`/teacher/setuk/assessments/scores?a=${a.id}`} className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-4 py-3 text-[15px] font-medium hover:bg-soft md:hidden"><Download size={15} /> 점수 엑셀</a>
        </div>
        <span className="hidden flex-1 md:block" />
        <a href={`/teacher/setuk/assessments/scores?a=${a.id}`} className="hidden items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-5 py-3 text-[15px] font-medium hover:bg-soft md:inline-flex"><Download size={15} /> 점수 엑셀로 받기</a>
        <ButtonLink href={composeHref} kind="soft" className="md:flex-none"><PencilLine size={15} /> 글 짓기</ButtonLink>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {students.map((s) => {
          const g = s.grade;
          return (
            <button key={s.id} type="button" onClick={() => setGrading(s.id)}
              className={cx("flex h-11 items-center gap-2 rounded-control border px-3 text-left", g ? "border-line bg-[#fff] hover:bg-soft" : "border-line bg-bg")}>
              <span className="shrink-0 text-[12px] font-medium text-mute">{s.no}</span>
              <span className={cx("min-w-0 flex-1 truncate text-[14px] font-bold", !g && "text-mute")}>{s.name}</span>
              <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[11px] font-bold",
                g?.status === "confirmed" ? "bg-ok-soft text-ok" : "bg-key-soft text-key-strong")}>
                {g?.status === "confirmed" ? `✓ ${g.total}` : g ? `AI ${g.total}` : aiOn ? "올리기" : "채점"}
              </span>
            </button>
          );
        })}
      </div>
      {waiting[0]?.grade && (
        <button type="button" onClick={() => setGrading(waiting[0].id)} className="flex flex-col gap-1 rounded-control bg-bg px-3.5 py-3 text-left">
          <span className="flex w-full items-center gap-1.5 text-[13px] font-bold">
            <AiTag /> {waiting[0].no} {waiting[0].name} · {waiting[0].grade.total} / {max}점 제안
            <span className="ml-auto text-[12px] text-key-strong">확인하기 ›</span>
          </span>
          <span className="text-[13px] leading-5 text-[#333d4b]">{gradeLine(r, waiting[0].grade.picks)}</span>
        </button>
      )}
      {grading && <GradeDialog a={a} students={students} startId={grading} aiOn={aiOn} onClose={() => setGrading(null)} />}
    </>
  );
}

// ---------- 채점 확인 창 (N72 b · 모바일 시트 e) ----------

function GradeDialog({ a, students, startId, aiOn, onClose }: { a: RSel; students: RStu[]; startId: string; aiOn: boolean; onClose: () => void }) {
  const [i, setI] = useState(() => Math.max(0, students.findIndex((s) => s.id === startId)));
  const s = students[i];
  if (!s) return null;
  const go = (d: number) => setI((x) => Math.min(students.length - 1, Math.max(0, x + d)));
  const next = () => {
    const k = students.findIndex((x, j) => j > i && x.grade?.status !== "confirmed");
    if (k >= 0) setI(k); else onClose();
  };
  return (
    <Shell wide="xl" label={`${s.no} ${s.name} 채점`} onClose={onClose}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[14px] font-medium text-mute">{s.no}</span>
          <span className="shrink-0">{s.name}</span>
          <span className="hidden min-w-0 truncate text-[14px] font-normal text-sub md:inline">{a.title}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" aria-label="이전 학생" disabled={i === 0} onClick={() => go(-1)} className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-soft disabled:opacity-30"><ChevronLeft size={18} /></button>
            <button type="button" aria-label="다음 학생" disabled={i >= students.length - 1} onClick={() => go(1)} className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-soft disabled:opacity-30"><ChevronRight size={18} /></button>
          </span>
        </span>
      }>
      <GradeBody key={s.id} a={a} s={s} aiOn={aiOn} onDone={next} />
    </Shell>
  );
}

function GradeBody({ a, s, aiOn, onDone }: { a: RSel; s: RStu; aiOn: boolean; onDone: () => void }) {
  const router = useRouter();
  const r = a.rubric;
  const [g, setG] = useState<GradeView | null>(s.grade);
  const [picks, setPicks] = useState<Record<string, number>>(() => Object.fromEntries((s.grade?.picks ?? []).map((p) => [p.criterionId, p.level])));
  const [piece, setPiece] = useState(s.grade?.piece ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const aiPick = (id: string) => (g && g.status === "ai" ? g.picks.find((p) => p.criterionId === id)?.level : undefined);
  const reason = (id: string) => g?.picks.find((p) => p.criterionId === id)?.reason ?? "";
  const list: GradePick[] = r.criteria.filter((c) => picks[c.id] !== undefined).map((c) => ({ criterionId: c.id, level: picks[c.id], reason: reason(c.id) }));
  const sum = gradeTotal(r, list);
  const all = list.length === r.criteria.length;

  const read = () => file && start(async () => {
    setError("");
    const x = await gradeFor(a.id, s.id, file).catch(() => ({ error: "읽지 못했어요. 다시 해 주세요" }));
    if ("error" in x) return setError(x.error);
    setG(x.grade);
    setPicks(Object.fromEntries(x.grade.picks.map((p) => [p.criterionId, p.level])));
    setPiece(x.grade.piece);
    setFile(null);
    router.refresh();
  });
  const confirm = () => start(async () => {
    setError("");
    const x = await confirmGrade({ assessmentId: a.id, studentId: s.id, picks: list, piece, reading: g?.reading ?? "" }).catch(() => ({ ok: false as const, error: "확정하지 못했어요" }));
    if (!x.ok) return setError(x.error);
    router.refresh();
    onDone();
  });

  const upload = (
    <div className="flex flex-col gap-2 rounded-inner border border-dashed border-faint px-3.5 py-3">
      <span className="text-[13px] font-bold">{g ? "답안 다시 읽기" : "답안 올리기"}</span>
      <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" aria-label="답안 파일" />
      <Button type="button" size="sm" kind="soft" disabled={!file || pending} onClick={read} className="self-start"><Sparkles size={14} /> {pending ? "AI가 읽는 중…" : "AI로 채점 제안 받기"}</Button>
      <span className="text-[12px] text-mute">PDF · 사진 · hwpx · pptx · txt · 답안 파일은 저장하지 않아요</span>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[340px_minmax(0,1fr)] md:gap-5">
        <div className="order-2 flex flex-col gap-3 md:order-1">
          {g?.reading && (
            <div className="flex flex-col gap-1.5 rounded-inner bg-bg px-3.5 py-3">
              <span className="flex items-center gap-1.5 text-[13px] font-bold"><AiTag /> 답안에서 읽은 것</span>
              <p className="whitespace-pre-line text-[13px] leading-5 text-[#333d4b]">{g.reading}</p>
            </div>
          )}
          {aiOn && upload}
          <label className="flex flex-col gap-1.5 rounded-inner border border-hair px-3.5 py-3">
            <span className="flex items-center text-[13px] font-bold">조각으로 남길 글<span className="ml-auto text-[12px] font-medium tabular-nums text-sub">{neisBytes(piece).toLocaleString()}B</span></span>
            <textarea value={piece} onChange={(e) => setPiece(e.target.value)} rows={4} maxLength={GRADE_LIMITS.piece} placeholder="확정하면 이 글이 수행평가 조각으로 들어가요 (비워 두면 점수만 남겨요)"
              className="resize-y bg-transparent text-[13px] leading-5 outline-none placeholder:text-faint" />
          </label>
        </div>
        <div className="order-1 flex flex-col gap-2.5 md:order-2">
          {r.criteria.map((c) => {
            const on = picks[c.id];
            const ai = aiPick(c.id);
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-inner border border-line px-3.5 py-3">
                <div className="flex items-center">
                  <span className="text-[14px] font-bold">{c.name}</span>
                  <span className="ml-auto text-[14px] font-bold tabular-nums text-key-strong">{on !== undefined ? c.levels[on]?.points : "–"} / {c.points}점</span>
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label={`${c.name} 수준`}>
                  {c.levels.map((l, k) => (
                    <button key={l.label} type="button" role="radio" aria-checked={on === k} title={l.desc} onClick={() => setPicks((p) => ({ ...p, [c.id]: k }))}
                      className={cx("flex h-10 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-control border text-[13px]",
                        on === k ? "border-[1.5px] border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub hover:bg-soft")}>
                      {l.label}<span className="max-md:hidden"> ·</span> {l.points}{ai === k && <AiTag />}
                    </button>
                  ))}
                </div>
                {reason(c.id) && <p className="text-[12px] leading-[18px] text-sub">근거 · {reason(c.id)}</p>}
              </div>
            );
          })}
          <div className="flex items-center rounded-inner bg-bg px-3.5 py-2.5">
            <span className="text-[14px] font-bold">합계</span>
            <span className="ml-auto text-[18px] font-bold tabular-nums text-key-strong">{sum} / {rubricTotal(r)}점</span>
          </div>
        </div>
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <span className="text-[12px] text-mute">
          {g?.status === "ai" ? "AI 제안이에요 · 바꾸려면 수준을 누르세요" : g?.status === "confirmed" ? "확정한 채점이에요 · 다시 확정하면 새로 남아요" : "수준을 골라 확정해요"}
        </span>
        <span className="hidden flex-1 md:block" />
        <Button type="button" disabled={!all || pending} onClick={confirm} className="h-12 md:h-11">{pending ? "남기는 중…" : "확정하고 조각 남기기"}</Button>
      </div>
    </>
  );
}

