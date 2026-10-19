"use client";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronLeft, ClipboardList, ClipboardPaste, Info, NotebookPen, Plus, Search, Upload, X } from "lucide-react";
import { LengthPicker } from "@/components/length-picker";
import { StudentListImport } from "@/components/student-list-import";
import { Button, cx } from "@/components/ui";
import { neisMax, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { AREA_LABEL, AREAS, DEFAULT_DOC_KINDS, FIXED_QUESTIONS, MAX_EXTRA_QUESTIONS, md, sourceFromPicks, sourceLabel, usesDocs, usesMemos, usesSurvey } from "@/lib/domain/program";
import type { PlanFields } from "@/lib/domain/program-plan";
import type { Program } from "@/lib/domain/program";
import { createProgramAction, suggestQuestionsAction, updateProgramAction, type CreateState, type SuggestState } from "./actions";
import { PlanAutofill, type FillKey, type FormNow } from "./plan-autofill";

export type PickStudent = { id: string; label: string; classKey: string; name: string; grade: number; classNo: number; number: number; studentNo: string };
export type PickTeacher = { id: string; label: string };

// 입력칸은 회색(#F2F4F6) 바탕. 흰 칸이 필요하면 bg-[#fff] (.surface 안 bg-white 뒤집기를 피한다)
const INPUT = "h-12 w-full rounded-field bg-soft px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key md:h-11";
const LABEL = "text-[13px] font-medium text-sub";
// 고르는 칸 (기록 영역·근거 자료): 선택 = 연한 인디고 + 1.5px 인디고 선 + 체크
const PICK_ON = "border-[1.5px] border-key bg-key-soft font-bold text-key-strong";
const PICK_OFF = "border border-hair bg-[#fff] font-medium hover:bg-soft";

// 근거 자료 (Figma N41 492:15969): 설문 · 서류 · 교사 메모 중 하나 이상 (교사 메모만도 된다)
type Pick = "survey" | "docs" | "memo";
const SOURCES: [Pick, string, string, typeof ClipboardList][] = [
  ["survey", "설문 응답", "학생이 직접 쓰는 활동 설문", ClipboardList],
  ["docs", "학생 제출 서류", "보고서 · 활동지 · 소감문", Upload],
  ["memo", "교사 메모", "내가 본 일을 학생마다 적어요", NotebookPen],
];

type StepId = 1 | 2 | 3 | 4 | 5;
const STEP_NAME: Record<StepId, string> = { 1: "기본 정보", 2: "근거 자료", 3: "설문 문항", 4: "대상 학생", 5: "확인" };
const STEP_ASK: Record<StepId, string> = { 1: "어떤 프로그램인가요?", 2: "무엇을 근거로 쓸까요?", 3: "무엇을 물어볼까요?", 4: "누가 참여하나요?", 5: "이대로 등록할까요?" };

// T3 프로그램 등록·설문 발행 (Figma N16 등록 283:4166~4168 / 287:4348). initial 이 있으면 수정 화면.
// 모바일 = 한 화면 한 단계(마법사), PC = 한 페이지 + 왼쪽 단계 목록. 둘 다 같은 form 하나 (값 유지, 제출 한 번)
export function ProgramForm({ students, teachers, ownerId, today, end, aiOn, initial }: {
  students: PickStudent[]; teachers: PickTeacher[]; ownerId: string; today: string; end: string; aiOn: boolean; initial?: Program;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CreateState, FormData>(initial ? updateProgramAction.bind(null, initial.id) : createProgramAction, {});
  const [sug, sugAction, suggesting] = useActionState<SuggestState, FormData>(suggestQuestionsAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [overview, setOverview] = useState(initial?.overview ?? "");
  const [area, setArea] = useState<DraftCategory>(initial?.area ?? "세특");
  const [len, setLen] = useState<{ unit: LengthUnit; max: number }>(initial ? { unit: initial.unit, max: initial.max } : { unit: "bytes", max: neisMax("세특", "bytes") });
  const [start, setStart] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? end);
  const [picks, setPicks] = useState<Record<Pick, boolean>>(() => (initial ? { survey: usesSurvey(initial.source), docs: usesDocs(initial.source), memo: usesMemos(initial) } : { survey: true, docs: false, memo: false }));
  // N46 외부 글 (직접 넣기): 혼자만 — 고르면 설문·서류·메모가 꺼지고, 그것들을 고르면 외부 글이 꺼진다
  const [external, setExternal] = useState(initial?.source === "external");
  const picked = external ? { source: "external" as const, useMemos: false } : sourceFromPicks(picks);
  const source = picked?.source ?? "survey";
  const srcText = picked ? sourceLabel(picked) : "고르지 않음";
  const [requestDocs, setRequestDocs] = useState(initial?.requestDocs ?? true);
  const [kinds, setKinds] = useState<string[]>(initial ? initial.docKinds : ["탐구 보고서"]);
  const [kindOptions, setKindOptions] = useState([...new Set([...DEFAULT_DOC_KINDS, ...(initial?.docKinds ?? [])])]);
  const [newKind, setNewKind] = useState("");
  const [extras, setExtras] = useState<string[]>(initial ? initial.questions.filter((q) => !q.fixed).map((q) => q.prompt) : []);
  const [newQ, setNewQ] = useState("");
  const [targets, setTargets] = useState<string[]>(initial?.targetIds ?? []);
  const [query, setQuery] = useState("");
  const [coOwners, setCoOwners] = useState<string[]>(initial?.coOwnerIds ?? []);
  const [tQuery, setTQuery] = useState("");
  // 모바일 마법사의 지금 단계 / PC 에서 화면에 보이는 섹션
  const [step, setStep] = useState<StepId>(1);
  const [inView, setInView] = useState<StepId>(1);
  const owner = teachers.find((t) => t.id === ownerId);
  const tMatches = tQuery.trim()
    ? teachers.filter((t) => t.id !== ownerId && !coOwners.includes(t.id) && t.label.includes(tQuery.trim())).slice(0, 6)
    : [];

  const classes = useMemo(() => [...new Set(students.map((s) => s.classKey))].sort(), [students]);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const survey = !external && picks.survey;
  const docs = !external && picks.docs;
  const qCount = survey ? FIXED_QUESTIONS.length + extras.length : 0;
  const matches = query.trim() ? students.filter((s) => !targets.includes(s.id) && (s.name.includes(query.trim()) || s.label.includes(query.trim()))).slice(0, 6) : [];

  // 근거가 서류뿐이면 설문 문항 단계를 건너뛴다 (진행 표시도 n/4)
  const steps: StepId[] = survey ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const num = (s: StepId) => steps.indexOf(s) + 1;
  // 단계별 필수값 (서버 검사와 같은 기준: 교과세특은 교과 필수, 끝나는 날 ≥ 시작일)
  const ok: Record<StepId, boolean> = {
    1: !!title.trim() && !!start && !!endDate && endDate >= start && (area !== "세특" || !!subject.trim()),
    2: !docs || kinds.length > 0,
    3: true,
    4: targets.length > 0,
    5: false,
  };
  // 발행된 프로그램은 상태를 그대로 두고 내용만 저장한다 (임시 저장 없음)
  const canDraft = !initial || initial.status === "draft";
  const heading = initial ? "프로그램 수정" : "프로그램 등록";

  const go = (s: StepId) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const next = () => go(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)]);
  const prev = () => go(steps[Math.max(steps.indexOf(step) - 1, 0)]);
  const back = () => {
    if (step !== 1) return prev();
    if (!window.confirm("작성 중인 내용이 저장되지 않아요. 나갈까요?")) return;
    if (window.history.length > 1) router.back();
    else router.push(initial ? `/teacher/programs/${initial.id}` : "/teacher/programs");
  };

  // PC: 지금 보이는 섹션을 왼쪽 단계 목록에 표시
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setInView(Number(hit.target.id.slice(5)) as StepId);
    }, { rootMargin: "-15% 0px -65% 0px" });
    document.querySelectorAll("[id^='step-']").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [survey]);
  const jump = (s: StepId) => document.getElementById(`step-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const addExtra = (q: string) => {
    const t = q.trim();
    if (!t || extras.length >= MAX_EXTRA_QUESTIONS || extras.includes(t)) return;
    setExtras([...extras, t]);
  };
  const addKind = () => {
    const k = newKind.trim();
    if (!k) return;
    setKindOptions([...new Set([...kindOptions, k])]);
    setKinds([...new Set([...kinds, k])]);
    setNewKind("");
  };
  const toggleClass = (k: string) => {
    const ids = students.filter((s) => s.classKey === k).map((s) => s.id);
    const all = ids.every((id) => targets.includes(id));
    setTargets(all ? targets.filter((id) => !ids.includes(id)) : [...new Set([...targets, ...ids])]);
  };
  const pickArea = (v: DraftCategory) => { setArea(v); setLen({ unit: len.unit, max: neisMax(v, len.unit) }); };
  // 계획서·기안문으로 채우기: 기본값 그대로인 칸은 "비어 있음"으로 본다
  const now: FormNow = {
    title: { dirty: !!title.trim(), text: title },
    area: { dirty: area !== "세특", text: AREA_LABEL[area] },
    subject: { dirty: !!subject.trim(), text: subject },
    period: { dirty: start !== today || endDate !== end, text: `${md(start)} – ${md(endDate)}` },
    overview: { dirty: !!overview.trim(), text: overview },
    targets: { dirty: targets.length > 0, text: `${targets.length}명` },
    extras: { dirty: extras.length > 0, text: extras.join(" / ") },
    docKinds: { dirty: kinds.join() !== "탐구 보고서", text: kinds.join(", ") },
    source: { dirty: external || !(picks.survey && !picks.docs && !picks.memo), text: srcText },
  };
  const applyPlan = (keys: FillKey[], f: PlanFields) => {
    const has = (k: FillKey) => keys.includes(k);
    if (has("title") && f.title) setTitle(f.title.slice(0, 60));
    if (has("area") && f.area) pickArea(f.area);
    if (has("subject") && f.subject) setSubject(f.subject.slice(0, 30));
    if (has("period") && f.startDate) { setStart(f.startDate); setEndDate(f.endDate && f.endDate >= f.startDate ? f.endDate : f.startDate); }
    if (has("overview") && f.overview) setOverview(f.overview.slice(0, 1000));
    if (has("targets") && f.targetClasses.length) setTargets(students.filter((s) => f.targetClasses.includes(s.classKey)).map((s) => s.id));
    if (has("extras") && f.extraQuestions.length) setExtras(f.extraQuestions.slice(0, MAX_EXTRA_QUESTIONS));
    if (has("docKinds") && f.docKinds.length) { setKindOptions([...new Set([...kindOptions, ...f.docKinds])]); setKinds(f.docKinds); }
    if (has("source") && f.source) setExternal(false);
    if (has("source") && f.source) setPicks((p) => ({ survey: usesSurvey(f.source!), docs: usesDocs(f.source!), memo: p.memo || f.source === "memo" }));
  };

  const runSuggest = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => sugAction(fd));
  };

  const preview: Record<StepId, string> = {
    1: title.trim(),
    2: srcText,
    3: survey ? `${qCount}개` : "",
    4: targets.length ? `${targets.length}명` : "",
    5: "",
  };
  const lengthText = `${len.max.toLocaleString()}${UNIT_LABEL[len.unit]}`;
  const period = `${md(start)} – ${md(endDate)}`;
  // 5 확인: 단계별 요약 (이름표 + 값)
  const review: [StepId, [string, string][]][] = [
    [1, [
      ["이름", title.trim() || "—"],
      ["영역", `${AREA_LABEL[area]}${subject.trim() ? ` · ${subject.trim()}` : ""}`],
      ["담당", [owner?.label ?? "나", ...coOwners.map((id) => teachers.find((t) => t.id === id)?.label ?? "교사")].join(", ")],
      ["분량", lengthText],
      ["기간", period],
    ]],
    [2, [
      ["근거", srcText],
      ...(docs ? [["서류", `${kinds.join(", ") || "—"}${requestDocs ? " · 제출 요청" : ""}`] as [string, string]] : []),
    ]],
    ...(survey ? [[3, [["문항", `기본 ${FIXED_QUESTIONS.length} · 추가 ${extras.length}`]]] as [StepId, [string, string][]]] : []),
    [4, [["대상", `${targets.length}명`]]],
  ];

  const draftBtn = (className: string) => canDraft && (
    <Button name="intent" value="draft" kind="outline" disabled={pending} className={className}>임시 저장</Button>
  );
  const mainBtn = (className: string) => canDraft
    ? <Button name="intent" value="open" disabled={pending} className={className}>{pending ? "저장 중…" : "등록하기"}</Button>
    : <Button name="intent" value="save" disabled={pending} className={className}>{pending ? "저장 중…" : "수정 저장"}</Button>;

  return (
    <form
      id="program-form"
      ref={formRef}
      action={action}
      // 입력칸에서 Enter 로 제출되지 않게 (모바일에서는 첫 제출 버튼이 "임시 저장"이다)
      onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault(); }}
      className="max-md:-mx-4 max-md:-mb-10 max-md:-mt-4 max-md:min-h-dvh max-md:bg-white max-md:px-5 max-md:pb-10"
    >
      {/* 모바일 머리: 뒤로(이전 단계) · 제목 · 임시 저장 + 진행 표시 */}
      <div className="sticky top-0 z-10 -mx-5 bg-white px-5 md:hidden">
        <div className="flex h-14 items-center gap-1">
          <button type="button" aria-label={step === 1 ? "나가기" : "이전 단계"} onClick={back} className="-ml-2.5 flex size-10 shrink-0 items-center justify-center text-ink">
            <ChevronLeft size={26} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold">{heading}</h1>
          {canDraft && step !== 5 && (
            <button name="intent" value="draft" disabled={pending} className="shrink-0 whitespace-nowrap px-1 text-[14px] font-medium text-sub disabled:text-faint">임시 저장</button>
          )}
        </div>
        <div className="pb-3">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold">
            <span className="text-key">{num(step)}/{steps.length}</span>
            <span>{STEP_NAME[step]}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-key transition-[width] duration-300" style={{ width: `${(num(step) / steps.length) * 100}%` }} />
          </div>
        </div>
        {state.error && <p className="pb-3 text-sm text-bad" role="alert">{state.error}</p>}
      </div>

      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* PC: 왼쪽 단계 목록 + 요약 (예전 오른쪽 "등록 요약" 대신) */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="rounded-card border border-line bg-white p-4">
            <div className="px-2 pb-2 text-[13px] font-bold text-mute">단계</div>
            <ol className="flex flex-col gap-0.5">
              {steps.map((s) => {
                const on = inView === s;
                const done = s !== 5 && ok[s];
                return (
                  <li key={s}>
                    <button type="button" onClick={() => jump(s)} aria-current={on ? "step" : undefined}
                      className={cx("flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-left", on ? "bg-key-soft font-bold text-key-strong" : "hover:bg-soft")}>
                      <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                        done ? (on ? "bg-[#fff] text-key-strong" : "bg-key-soft text-key-strong") : "border border-hair bg-[#fff] text-mute")}>
                        {done ? <Check size={12} strokeWidth={3} /> : num(s)}
                      </span>
                      <span className="whitespace-nowrap text-[15px]">{STEP_NAME[s]}</span>
                      <span className="ml-auto min-w-0 truncate text-[12px] font-normal text-mute">{preview[s]}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <dl className="mt-3 flex flex-col gap-2 border-t border-line px-2 pt-3 text-[13px]">
              {[["영역", AREA_LABEL[area]], ["기간", period], ["분량", lengthText], ["대상", `${targets.length}명`]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-mute">{k}</dt>
                  <dd className="truncate font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5 max-md:pt-3 md:gap-5">
          <Section id={1} n={num(1)} step={step} ask={STEP_ASK[1]}>
            {!initial && <PlanAutofill aiOn={aiOn} now={now} onApply={applyPlan} />}
            <div className="grid gap-5 md:grid-cols-2 md:gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>프로그램 이름</span>
                <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} placeholder="예: 과학 탐구 발표" className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>담당 교과{area !== "세특" && " (선택)"}</span>
                <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={30} placeholder="예: 통합과학" className={INPUT} />
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>담당 교사 (함께 맡은 선생님도 수정·초안 검토를 해요)</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {owner && <span className="inline-flex items-center rounded-chip bg-key-soft px-2.5 py-1 text-[13px] font-medium text-key-strong">{owner.label} · 등록</span>}
                {coOwners.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-chip bg-soft py-1 pl-2.5 pr-1.5 text-[13px]">
                    {teachers.find((t) => t.id === id)?.label ?? "교사"}
                    <button type="button" aria-label="담당에서 빼기" onClick={() => setCoOwners(coOwners.filter((x) => x !== id))} className="text-mute"><X size={13} /></button>
                    <input type="hidden" name="coOwner" value={id} />
                  </span>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-field bg-soft px-3.5 focus-within:ring-2 focus-within:ring-key">
                <Search size={16} className="shrink-0 text-mute" />
                <input value={tQuery} onChange={(e) => setTQuery(e.target.value)} placeholder="선생님 이름으로 담당 추가" className="h-12 w-full bg-transparent text-[15px] outline-none md:h-11" aria-label="담당 교사 검색" />
              </label>
              {tMatches.length > 0 && (
                <ul className="flex flex-col rounded-inner border border-line bg-[#fff] p-1">
                  {tMatches.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => { setCoOwners([...coOwners, t.id]); setTQuery(""); }} className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-[14px] hover:bg-soft">
                        <Plus size={14} className="text-key" /> {t.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>기록 영역</span>
              <input type="hidden" name="area" value={area} />
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="기록 영역">
                {AREAS.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => pickArea(a)}
                    className={cx("flex h-[52px] items-center justify-center gap-1.5 whitespace-nowrap rounded-inner px-2 text-[15px]", area === a ? PICK_ON : PICK_OFF)}>
                    {area === a && <Check size={16} strokeWidth={2.5} className="shrink-0" />}
                    {AREA_LABEL[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2 lg:gap-3">
              <LengthPicker key={area} category={area} defaultUnit={len.unit} defaultMax={initial && area === initial.area ? initial.max : undefined} onChange={setLen} />
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>기간 · 끝나는 날 마감</span>
                <div className="flex items-center gap-2">
                  <input type="date" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} required className={cx(INPUT, "min-w-0")} />
                  <span className="text-mute">–</span>
                  <input type="date" name="endDate" value={endDate} min={start} onChange={(e) => setEndDate(e.target.value)} required className={cx(INPUT, "min-w-0")} />
                </div>
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>활동 개요</span>
              <textarea name="overview" value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} maxLength={1000} placeholder="무엇을 어떻게 하는 활동인지 2~3문장 (AI 문항 추천·초안에 쓰여요)"
                className="min-h-[104px] w-full resize-y rounded-field bg-soft p-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key" />
            </label>
          </Section>

          <Section id={2} n={num(2)} step={step} ask={STEP_ASK[2]} title="초안 근거 자료">
            <input type="hidden" name="source" value={picked ? source : ""} />
            <input type="hidden" name="useMemos" value={picked?.useMemos ? "on" : ""} />
            <p className="-mt-1 text-[13px] text-mute">여러 개 골라도 돼요 · 외부 글은 혼자만{!picked && <span className="font-medium text-bad"> · 하나 이상 골라 주세요</span>}</p>
            <div className="grid gap-2 md:grid-cols-3" role="group" aria-label="초안 근거 자료">
              {SOURCES.map(([v, t, d, I]) => (
                <button key={v} type="button" aria-pressed={!external && picks[v]} onClick={() => { if (external) { setExternal(false); setPicks({ survey: false, docs: false, memo: false, [v]: true }); } else setPicks((p) => ({ ...p, [v]: !p[v] })); }}
                  className={cx("flex items-center gap-3 rounded-inner p-4 text-left md:flex-col md:items-start md:gap-2", !external && picks[v] ? PICK_ON : PICK_OFF, external && "opacity-45")}>
                  <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-field", !external && picks[v] ? "bg-[#fff] text-key" : "bg-soft text-sub")}><I size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{t}</span>
                    <span className="text-[13px] font-normal text-mute">{d}</span>
                  </span>
                  {!external && picks[v] && <Check size={18} strokeWidth={2.5} className="shrink-0 md:hidden" />}
                </button>
              ))}
            </div>
            {/* 외부 글 (Figma N46 f): 기관이 보낸 생기부 글을 그대로 넣는 프로그램 — 혼자만 */}
            <div className="flex items-center gap-2 text-[12px] font-medium text-mute" aria-hidden><span className="h-px flex-1 bg-line" />또는<span className="h-px flex-1 bg-line" /></div>
            <button type="button" aria-pressed={external} onClick={() => setExternal(!external)}
              className={cx("flex items-center gap-3 rounded-inner p-4 text-left", external ? PICK_ON : PICK_OFF)}>
              <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-field", external ? "bg-[#fff] text-key" : "bg-soft text-sub")}><ClipboardPaste size={18} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">외부 글 (직접 넣기)</span>
                <span className="text-[13px] font-normal text-mute">기관이 보낸 생기부 글을 그대로 넣어요</span>
              </span>
              {external && <Check size={18} strokeWidth={2.5} className="shrink-0" />}
            </button>
            {external && (
              <p className="flex items-start gap-2 rounded-inner bg-bg px-3.5 py-3 text-[13px] leading-5 text-sub">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                학생 화면에 설문·제출 칸이 열리지 않아요 · AI를 쓰지 않아요 · 등록한 뒤 상세에서 엑셀이나 학생마다 글을 넣어요
              </p>
            )}
            {docs && (
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">학생에게 서류 제출 요청 보내기</span>
                    <span className="block text-[13px] text-mute">마감 {md(endDate)} · 학생 앱에 제출 칸이 열려요</span>
                  </span>
                  <input type="checkbox" name="requestDocs" checked={requestDocs} onChange={(e) => setRequestDocs(e.target.checked)} className="peer sr-only" />
                  <span aria-hidden className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", requestDocs ? "bg-key" : "bg-faint")}>
                    <span className={cx("absolute top-0.5 size-5 rounded-full bg-[#fff] transition-all", requestDocs ? "left-[22px]" : "left-0.5")} />
                  </span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>받을 서류{kinds.length === 0 && <span className="text-bad"> · 1개 이상 골라 주세요</span>}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {kindOptions.map((k) => (
                      <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
                        className={cx("whitespace-nowrap rounded-chip px-3 py-1.5 text-[13px] font-medium", kinds.includes(k) ? "bg-key text-white" : "bg-soft text-sub")}>
                        {k}
                      </button>
                    ))}
                    <span className="flex items-center gap-1 rounded-chip bg-soft pl-2.5">
                      <input value={newKind} onChange={(e) => setNewKind(e.target.value)} maxLength={20} placeholder="직접 추가" className="w-20 bg-transparent py-1.5 text-[13px] outline-none"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKind(); } }} />
                      <button type="button" aria-label="서류 종류 추가" className="px-2 text-mute" onClick={addKind}><Plus size={14} /></button>
                    </span>
                  </div>
                </div>
                {kinds.map((k) => <input key={k} type="hidden" name="docKind" value={k} />)}
              </div>
            )}
          </Section>

          {survey && (
            <Section id={3} n={num(3)} step={step} ask={STEP_ASK[3]} title="설문 문항"
              aside={<span className="whitespace-nowrap text-[13px] text-mute">기본 {FIXED_QUESTIONS.length} · 추가 {extras.length}/{MAX_EXTRA_QUESTIONS}</span>}>
              <div className="flex items-center gap-2.5 rounded-inner bg-bg px-4 py-3">
                <span className="shrink-0 rounded-chip bg-new-soft px-2 py-0.5 text-xs font-bold text-new">AI</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{aiOn ? "개요로 문항 추천" : "AI가 꺼져 있어요"}</span>
                <Button type="button" kind="soft" size="sm" onClick={runSuggest} disabled={!aiOn || suggesting} className="shrink-0">
                  {suggesting ? "만드는 중…" : "추천받기"}
                </Button>
              </div>
              <ol className="grid gap-2 lg:grid-cols-2">
                {FIXED_QUESTIONS.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-3 rounded-inner bg-bg px-4 py-3">
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#fff] text-[12px] font-bold text-sub">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[14px]"><b className="font-bold">{q.title}</b> <span className="text-sub">{q.prompt}</span></span>
                  </li>
                ))}
              </ol>
              {extras.length > 0 && (
                <ol className="flex flex-col gap-2">
                  {extras.map((q, i) => (
                    <li key={q} className="flex items-center gap-3 rounded-inner border border-hair bg-[#fff] px-4 py-3">
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-key-soft text-[12px] font-bold text-key-strong">{FIXED_QUESTIONS.length + i + 1}</span>
                      <span className="min-w-0 flex-1 text-[14px]">{q}</span>
                      <button type="button" aria-label="문항 빼기" onClick={() => setExtras(extras.filter((x) => x !== q))} className="shrink-0 text-mute"><X size={16} /></button>
                      <input type="hidden" name="extra" value={q} />
                    </li>
                  ))}
                </ol>
              )}
              {sug.error && <p className="text-sm text-bad" role="alert">{sug.error}</p>}
              {sug.questions && sug.questions.length > 0 && (
                <div className="flex flex-col gap-2 rounded-inner bg-new-soft p-3">
                  <span className="text-[13px] font-bold text-new">AI 추천</span>
                  {sug.questions.map((q) => (
                    <div key={q} className="flex items-center gap-2 rounded-inner bg-[#fff] px-3 py-2.5">
                      <span className="min-w-0 flex-1 text-[14px]">{q}</span>
                      <Button type="button" size="sm" kind="soft" disabled={extras.includes(q) || extras.length >= MAX_EXTRA_QUESTIONS} onClick={() => addExtra(q)} className="shrink-0">
                        {extras.includes(q) ? "추가됨" : "+ 추가"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {extras.length < MAX_EXTRA_QUESTIONS && (
                <div className="flex gap-2">
                  <input value={newQ} onChange={(e) => setNewQ(e.target.value)} maxLength={100} placeholder="추가 문항 (예: 가장 어려웠던 점은?)" className={cx(INPUT, "min-w-0")}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(newQ); setNewQ(""); } }} />
                  <button type="button" aria-label="문항 추가" onClick={() => { addExtra(newQ); setNewQ(""); }}
                    className="flex size-12 shrink-0 items-center justify-center rounded-control border border-hair bg-[#fff] text-sub hover:bg-soft md:size-11">
                    <Plus size={18} />
                  </button>
                </div>
              )}
            </Section>
          )}

          <Section id={4} n={num(4)} step={step} ask={STEP_ASK[4]} title="대상 학생"
            aside={<span className="whitespace-nowrap text-[13px] font-medium text-sub">{targets.length}명 선택</span>}>
            <div className="flex flex-wrap gap-2">
              {classes.map((k) => {
                const ids = students.filter((s) => s.classKey === k).map((s) => s.id);
                const on = ids.every((id) => targets.includes(id));
                const some = !on && ids.some((id) => targets.includes(id));
                const [gr, cl] = k.split("-");
                return (
                  <button key={k} type="button" onClick={() => toggleClass(k)} aria-pressed={on}
                    className={cx("whitespace-nowrap rounded-control px-3.5 py-2 text-[13px]", on ? PICK_ON : some ? "border border-key/40 bg-key-soft font-medium text-key-strong" : PICK_OFF)}>
                    {gr}학년 {cl}반 <span className="opacity-70">{ids.length}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <label className="flex items-center gap-2 rounded-field bg-soft px-3.5 focus-within:ring-2 focus-within:ring-key">
                <Search size={16} className="shrink-0 text-mute" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생 이름으로 추가하기" className="h-12 w-full bg-transparent text-[15px] outline-none md:h-11" aria-label="학생 검색" />
              </label>
              {matches.length > 0 && (
                <ul className="mt-1 flex flex-col rounded-inner border border-line bg-[#fff] p-1">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => { setTargets([...targets, s.id]); setQuery(""); }} className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-[14px] hover:bg-soft">
                        <Plus size={14} className="text-key" /> {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <StudentListImport pool={students} picked={targets} onAdd={(ids) => setTargets([...new Set([...targets, ...ids])])} className="self-start" />
            {targets.length > 0 && (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {targets.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-chip bg-soft py-1 pl-2.5 pr-1.5 text-[13px]">
                    {byId.get(id)?.label}
                    <button type="button" aria-label="빼기" onClick={() => setTargets(targets.filter((x) => x !== id))} className="text-mute"><X size={13} /></button>
                    <input type="hidden" name="target" value={id} />
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section id={5} n={num(5)} step={step} ask={initial ? "이대로 저장할까요?" : STEP_ASK[5]} title="확인">
            {/* 모바일: 단계별 요약 카드 (PC 는 왼쪽 단계 목록이 대신) */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {review.map(([s, rows]) => (
                <div key={s} className="rounded-card border border-line bg-[#fff] p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-key-soft text-[12px] font-bold text-key-strong">{num(s)}</span>
                    <span className="flex-1 text-[15px] font-bold">{STEP_NAME[s]}</span>
                    <button type="button" onClick={() => go(s)} className="whitespace-nowrap text-[13px] font-bold text-key-strong">수정</button>
                  </div>
                  <dl className="mt-2.5 flex flex-col gap-1.5">
                    {rows.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-10 shrink-0 text-[13px] text-mute">{k}</dt>
                        <dd className="min-w-0 flex-1 truncate text-[14px] font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <p className="flex items-center gap-2 rounded-field bg-bg px-3.5 py-3 text-[13px] text-sub">
              <AlertCircle size={16} className="shrink-0 text-mute" />
              {external ? "학생 화면에는 열리지 않아요 · 등록한 뒤 상세에서 외부 글을 넣어요" : canDraft ? "등록하면 학생 앱에 설문·제출 칸이 열려요" : "저장하면 학생 앱에 바로 반영돼요"}
            </p>
            {state.error && <p className="text-sm text-bad max-md:hidden" role="alert">{state.error}</p>}
            {/* PC 제출 버튼 (모바일은 아래 고정 줄) */}
            <div className="hidden justify-end gap-2 md:flex">
              {draftBtn("")}
              {mainBtn("min-w-[140px]")}
            </div>
          </Section>
        </div>
      </div>

      {/* 모바일 아래 고정 버튼 줄: 마법사 안에서는 탭바를 덮는다 (z-30 > 탭바 z-20) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 md:hidden">
        {step === 5 ? (
          <>
            {draftBtn("h-[52px] w-[120px] shrink-0 py-0")}
            {mainBtn("h-[52px] min-w-0 flex-1 py-0")}
          </>
        ) : (
          <>
            {step !== 1 && <Button type="button" kind="outline" onClick={prev} className="h-[52px] w-[108px] shrink-0 py-0">이전</Button>}
            <Button type="button" onClick={next} disabled={!ok[step]} className="h-[52px] min-w-0 flex-1 py-0">다음</Button>
          </>
        )}
      </div>
    </form>
  );
}

/** 단계 섹션: 모바일은 지금 단계만 보이고 맨 위에 질문, PC 는 번호 + 제목이 있는 카드 */
function Section({ id, n, step, ask, title, aside, children }: {
  id: StepId; n: number; step: StepId; ask: string; title?: string; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={`step-${id}`} className={cx("flex scroll-mt-6 flex-col gap-5 md:rounded-card md:border md:border-line md:bg-white md:p-6", step !== id && "max-md:hidden")}>
      <h2 className="text-[20px] font-bold leading-snug md:hidden">{ask}</h2>
      <div className="hidden items-center gap-2.5 md:flex">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-key-soft text-[13px] font-bold text-key-strong">{n}</span>
        <h2 className="min-w-0 flex-1 text-lg font-bold">{title ?? STEP_NAME[id]}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
