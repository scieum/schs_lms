"use client";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { ClipboardList, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { LengthPicker } from "@/components/length-picker";
import { Button, Card, Steps, Tag, Toggle, cx } from "@/components/ui";
import { neisMax, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { AREA_LABEL, AREAS, DEFAULT_DOC_KINDS, FIXED_QUESTIONS, MAX_EXTRA_QUESTIONS, SOURCE_LABEL, md, type EvidenceSource } from "@/lib/domain/program";
import type { PlanFields } from "@/lib/domain/program-plan";
import { createProgramAction, suggestQuestionsAction, type CreateState, type SuggestState } from "./actions";
import { PlanAutofill, type FillKey, type FormNow } from "./plan-autofill";

export type PickStudent = { id: string; label: string; classKey: string; name: string };

const INPUT = "h-11 w-full rounded-field bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key";
const LABEL = "text-[13px] font-medium text-sub";

const SOURCES: [EvidenceSource, string, string, typeof ClipboardList][] = [
  ["survey", "설문 응답", "학생이 직접 쓰는 활동 설문", ClipboardList],
  ["docs", "학생 제출 서류", "보고서 · 활동지 · 소감문", Upload],
  ["both", "둘 다 사용", "설문과 서류를 함께 근거로", Sparkles],
];

// T3 프로그램 등록·설문 발행 (Figma 46:855 / 46:1100)
export function ProgramForm({ students, today, end, aiOn }: { students: PickStudent[]; today: string; end: string; aiOn: boolean }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createProgramAction, {});
  const [sug, sugAction, suggesting] = useActionState<SuggestState, FormData>(suggestQuestionsAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [overview, setOverview] = useState("");
  const [area, setArea] = useState<DraftCategory>("세특");
  const [len, setLen] = useState<{ unit: LengthUnit; max: number }>({ unit: "bytes", max: neisMax("세특", "bytes") });
  const [start, setStart] = useState(today);
  const [endDate, setEndDate] = useState(end);
  const [source, setSource] = useState<EvidenceSource>("survey");
  const [requestDocs, setRequestDocs] = useState(true);
  const [kinds, setKinds] = useState<string[]>(["탐구 보고서"]);
  const [kindOptions, setKindOptions] = useState(DEFAULT_DOC_KINDS);
  const [newKind, setNewKind] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [newQ, setNewQ] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const classes = useMemo(() => [...new Set(students.map((s) => s.classKey))].sort(), [students]);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const survey = source !== "docs";
  const docs = source !== "survey";
  const qCount = survey ? FIXED_QUESTIONS.length + extras.length : 0;
  const active = !title.trim() ? 0 : targets.length === 0 ? 3 : 4;
  const matches = query.trim() ? students.filter((s) => !targets.includes(s.id) && (s.name.includes(query.trim()) || s.label.includes(query.trim()))).slice(0, 6) : [];

  const addExtra = (q: string) => {
    const t = q.trim();
    if (!t || extras.length >= MAX_EXTRA_QUESTIONS || extras.includes(t)) return;
    setExtras([...extras, t]);
  };
  const toggleClass = (k: string) => {
    const ids = students.filter((s) => s.classKey === k).map((s) => s.id);
    const all = ids.every((id) => targets.includes(id));
    setTargets(all ? targets.filter((id) => !ids.includes(id)) : [...new Set([...targets, ...ids])]);
  };
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
    source: { dirty: source !== "survey", text: SOURCE_LABEL[source] },
  };
  const applyPlan = (keys: FillKey[], f: PlanFields) => {
    const has = (k: FillKey) => keys.includes(k);
    if (has("title") && f.title) setTitle(f.title.slice(0, 60));
    if (has("area") && f.area) { setArea(f.area); setLen({ unit: len.unit, max: neisMax(f.area, len.unit) }); }
    if (has("subject") && f.subject) setSubject(f.subject.slice(0, 30));
    if (has("period") && f.startDate) { setStart(f.startDate); setEndDate(f.endDate && f.endDate >= f.startDate ? f.endDate : f.startDate); }
    if (has("overview") && f.overview) setOverview(f.overview.slice(0, 1000));
    if (has("targets") && f.targetClasses.length) setTargets(students.filter((s) => f.targetClasses.includes(s.classKey)).map((s) => s.id));
    if (has("extras") && f.extraQuestions.length) setExtras(f.extraQuestions.slice(0, MAX_EXTRA_QUESTIONS));
    if (has("docKinds") && f.docKinds.length) { setKindOptions([...new Set([...kindOptions, ...f.docKinds])]); setKinds(f.docKinds); }
    if (has("source") && f.source) setSource(f.source);
  };

  const runSuggest = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => sugAction(fd));
  };

  const submitButtons = (
    <>
      <Button name="intent" value="open" disabled={pending}>{pending ? "저장 중…" : "등록하기"}</Button>
      <Button name="intent" value="draft" kind="outline" disabled={pending}>임시 저장</Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
    <PlanAutofill aiOn={aiOn} now={now} onApply={applyPlan} />
    <form ref={formRef} action={action} className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
        <span className="rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">AI</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">AI로 설문 문항 만들기</div>
          <div className="truncate text-[13px] text-sub">{aiOn ? "활동 개요를 쓰면 추가 문항을 추천해요" : "AI가 꺼져 있어요. 문항을 직접 써 주세요"}</div>
        </div>
        <Button type="button" kind="outline" size="sm" onClick={runSuggest} disabled={!aiOn || suggesting || !survey}>
          {suggesting ? "만드는 중…" : "문항 추천받기"}
        </Button>
      </div>

      <div className="overflow-x-auto"><Steps items={["기본 정보", "근거 자료", "설문 문항", "대상 학생", "확인"]} active={active} /></div>

      <div className="grid gap-4 md:grid-cols-[1fr_300px] md:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <Card title="기본 정보">
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2">
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
                <span className={LABEL}>기록 영역</span>
                <Toggle name="area" value={area} onChange={(v) => { setArea(v as DraftCategory); setLen({ unit: len.unit, max: neisMax(v as DraftCategory, len.unit) }); }}
                  options={AREAS.map((a) => [a, AREA_LABEL[a]])} />
              </div>
              <div className="rounded-inner bg-white p-3">
                <LengthPicker key={area} category={area} defaultUnit={len.unit} onChange={setLen} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>활동 기간 (끝나는 날 = 설문·서류 마감)</span>
                <div className="flex items-center gap-2">
                  <input type="date" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} required className={INPUT} />
                  <span className="text-mute">–</span>
                  <input type="date" name="endDate" value={endDate} min={start} onChange={(e) => setEndDate(e.target.value)} required className={INPUT} />
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>활동 개요</span>
                <textarea name="overview" value={overview} onChange={(e) => setOverview(e.target.value)} rows={3} maxLength={1000} placeholder="무엇을 어떻게 하는 활동인지 2~3문장 (AI 문항 추천·초안에 쓰여요)"
                  className="w-full resize-y rounded-field bg-white p-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key" />
              </label>
            </div>
          </Card>

          <Card title="초안 근거 자료">
            <input type="hidden" name="source" value={source} />
            <div className="grid gap-2.5 md:grid-cols-3">
              {SOURCES.map(([v, t, d, I]) => (
                <button key={v} type="button" onClick={() => setSource(v)} aria-pressed={source === v}
                  className={cx("flex flex-col items-start gap-2 rounded-inner p-4 text-left", source === v ? "bg-key text-white" : "bg-white hover:bg-key-soft")}>
                  <span className={cx("flex size-9 items-center justify-center rounded-field", source === v ? "bg-navy" : "bg-soft")}><I size={18} /></span>
                  <span className="font-bold">{t}</span>
                  <span className={cx("text-[13px]", source === v ? "text-white/80" : "text-mute")}>{d}</span>
                </button>
              ))}
            </div>
            {docs && (
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center gap-3 rounded-inner bg-white px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">학생에게 서류 제출 요청 보내기</span>
                    <span className="block text-[13px] text-mute">마감 {md(endDate)} · 학생 앱에 제출 칸이 열려요</span>
                  </span>
                  <input type="checkbox" name="requestDocs" checked={requestDocs} onChange={(e) => setRequestDocs(e.target.checked)} className="peer sr-only" />
                  <span aria-hidden className={cx("relative h-6 w-11 rounded-full transition-colors", requestDocs ? "bg-key" : "bg-faint")}>
                    <span className={cx("absolute top-0.5 size-5 rounded-full bg-white transition-all", requestDocs ? "left-[22px]" : "left-0.5")} />
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={LABEL}>받을 서류</span>
                  {kindOptions.map((k) => (
                    <button key={k} type="button" onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
                      className={cx("rounded-chip px-3 py-1.5 text-[13px] font-medium", kinds.includes(k) ? "bg-key text-white" : "bg-white text-sub")}>
                      {k}
                    </button>
                  ))}
                  <span className="flex items-center gap-1 rounded-chip bg-white pl-2.5">
                    <input value={newKind} onChange={(e) => setNewKind(e.target.value)} maxLength={20} placeholder="직접 추가" className="w-20 bg-transparent py-1.5 text-[13px] outline-none"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const k = newKind.trim(); if (k) { setKindOptions([...new Set([...kindOptions, k])]); setKinds([...new Set([...kinds, k])]); setNewKind(""); } } }} />
                    <button type="button" aria-label="서류 종류 추가" className="px-2 text-mute" onClick={() => { const k = newKind.trim(); if (k) { setKindOptions([...new Set([...kindOptions, k])]); setKinds([...new Set([...kinds, k])]); setNewKind(""); } }}><Plus size={14} /></button>
                  </span>
                </div>
                {kinds.map((k) => <input key={k} type="hidden" name="docKind" value={k} />)}
              </div>
            )}
          </Card>

          {survey && (
            <Card title="설문 문항" action={<span className="text-[13px] text-mute">추가 {extras.length}/{MAX_EXTRA_QUESTIONS}</span>}>
              <ol className="flex flex-col gap-2">
                {FIXED_QUESTIONS.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-3 rounded-inner bg-white px-4 py-3">
                    <span className="w-4 text-[13px] text-mute">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[15px]">{q.title} — {q.prompt}</span>
                    <Tag tone="bg-soft text-mute">공통</Tag>
                  </li>
                ))}
                {extras.map((q, i) => (
                  <li key={q} className="flex items-center gap-3 rounded-inner bg-white px-4 py-3">
                    <span className="w-4 text-[13px] text-mute">{FIXED_QUESTIONS.length + i + 1}</span>
                    <span className="min-w-0 flex-1 text-[15px]">{q}</span>
                    <Tag tone="bg-navy text-white">추가</Tag>
                    <button type="button" aria-label="문항 빼기" onClick={() => setExtras(extras.filter((x) => x !== q))} className="text-mute"><X size={16} /></button>
                    <input type="hidden" name="extra" value={q} />
                  </li>
                ))}
              </ol>
              {extras.length < MAX_EXTRA_QUESTIONS && (
                <div className="mt-3 flex gap-2">
                  <input value={newQ} onChange={(e) => setNewQ(e.target.value)} maxLength={100} placeholder="추가 문항 (예: 발표에서 가장 어려웠던 점은?)" className={INPUT}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(newQ); setNewQ(""); } }} />
                  <Button type="button" kind="outline" size="sm" onClick={() => { addExtra(newQ); setNewQ(""); }} className="shrink-0"><Plus size={14} /> 문항 추가</Button>
                </div>
              )}
              {sug.error && <p className="mt-3 text-sm text-bad" role="alert">{sug.error}</p>}
              {sug.questions && sug.questions.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 rounded-inner bg-new-soft p-3">
                  <span className="text-[13px] font-bold text-new">AI 추천 문항</span>
                  {sug.questions.map((q) => (
                    <div key={q} className="flex items-center gap-2 rounded-inner bg-white px-3 py-2.5">
                      <span className="min-w-0 flex-1 text-[14px]">{q}</span>
                      <Button type="button" size="sm" kind="soft" disabled={extras.includes(q) || extras.length >= MAX_EXTRA_QUESTIONS} onClick={() => addExtra(q)}>
                        {extras.includes(q) ? "추가됨" : "확인 후 문항에 추가"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="대상 학생" action={<span className="text-[13px] font-medium text-sub">{targets.length}명 선택됨</span>}>
            <div className="flex flex-wrap gap-2">
              {classes.map((k) => {
                const ids = students.filter((s) => s.classKey === k).map((s) => s.id);
                const on = ids.every((id) => targets.includes(id));
                const some = !on && ids.some((id) => targets.includes(id));
                const [gr, cl] = k.split("-");
                return (
                  <button key={k} type="button" onClick={() => toggleClass(k)} aria-pressed={on}
                    className={cx("rounded-control px-3.5 py-2 text-[13px] font-medium", on ? "bg-key text-white" : some ? "bg-key-soft text-key-strong" : "bg-white text-sub")}>
                    {gr}학년 {cl}반 <span className="opacity-70">{ids.length}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative mt-3">
              <label className="flex items-center gap-2 rounded-field bg-white px-3.5 focus-within:ring-2 focus-within:ring-key">
                <Search size={16} className="text-mute" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생 이름으로 추가하기" className="h-11 w-full bg-transparent text-[15px] outline-none" aria-label="학생 검색" />
              </label>
              {matches.length > 0 && (
                <ul className="mt-1 flex flex-col rounded-inner bg-white p-1">
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
            {targets.length > 0 && (
              <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {targets.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-chip bg-white py-1 pl-2.5 pr-1.5 text-[13px]">
                    {byId.get(id)?.label}
                    <button type="button" aria-label="빼기" onClick={() => setTargets(targets.filter((x) => x !== id))} className="text-mute"><X size={13} /></button>
                    <input type="hidden" name="target" value={id} />
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="md:sticky md:top-6 md:self-start">
          <Card title="등록 요약">
            <dl className="flex flex-col gap-2.5 text-[14px]">
              {[
                ["기록 영역", AREA_LABEL[area]],
                ["기간", `${md(start)} – ${md(endDate)}`],
                ["근거 자료", SOURCE_LABEL[source]],
                ["설문 문항", survey ? `${qCount}개` : "없음"],
                ["대상", `${targets.length}명`],
                ["초안 분량", `${len.max.toLocaleString()}${UNIT_LABEL[len.unit]}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-mute">{k}</dt>
                  <dd className="font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            {state.error && <p className="mt-3 text-sm text-bad" role="alert">{state.error}</p>}
            <div className="mt-4 flex flex-col gap-2">{submitButtons}</div>
          </Card>
        </aside>
      </div>
    </form>
    </div>
  );
}
