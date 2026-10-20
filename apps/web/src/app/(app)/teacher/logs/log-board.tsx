"use client";
import { startTransition, useActionState, useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, Check, Paperclip, Sparkles, X } from "lucide-react";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "@/components/writing/evidence-files";
import { ACTIVITY_MAX, cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { chipDate, chipOf, shortMd, type DateChip } from "@/lib/domain/log-date";
import { Button, Card, Tag, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { addLogs, polishLogMemo, readLogFile, reviseLogMemo, softenLogMemo, type LogState, type PolishResult } from "./actions";
import { ReviseBox } from "@/components/writing/revise-box";
import { bluntWords } from "@/lib/domain/soften";
import { HighlightTextarea } from "@/components/writing/highlight-textarea";
import { useGuideMarks, useGuideTarget } from "@/components/writing/guide-store";
import { SoftenNotice, SoftenResult } from "@/components/writing/soften";
import { makeStudentNo } from "@/lib/domain/roster";
import { StudentListImport } from "@/components/student-list-import";
import { RecordCompetency } from "@/components/writing/record-competency";
import { BatchWriter } from "./batch-writer";
import { PrevButton, StepNav, WriteStepper, type StepItem } from "@/components/writing/write-steps";
import { defaultLogStep, LOG_STEP_LABEL, type WriteStep } from "@/lib/domain/write-step";

type S = { id: string; name: string; grade: number; classNo: number; number: number; count: number };
type L = { id: string; studentId: string; date: string; content: string };

// 누가기록 (Figma N48 f·g·h): 기록 쓰기 카드 하나에 단계 표시 ① 학생 고르기 → ② 기록 쓰기 → ③ 확인 · 남기기 — 지금 단계만 보여 준다.
// "한 명씩 | 한꺼번에"(N28)는 카드 머리 그대로, 한꺼번에는 ② 공통 내용 · 특징 → ③ 미리보기 · 추가. 최근 기록은 PC 오른쪽 칸(모바일은 아래).
// N49 (e): 한 명씩 ③ 미리보기 아래 작은 "AI에게 고쳐 달라고 하기" — [이걸로 바꾸기]를 눌러야 남길 글이 바뀐다. AI로 다듬은 글이면 머리 끝에 " · AI로 다듬음".
const chipCls = (on: boolean) => cx("flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-field px-3.5 text-[14px]", on ? "bg-key-soft font-bold text-key-strong" : "bg-soft font-medium text-sub");
export function LogBoard({ area, clubId, students, logs, today, aiOn = false }: { area: string; clubId?: string; students: S[]; logs: L[]; today: string; aiOn?: boolean }) {
  const [text, setText] = useState("");
  // 추가하면 글만 비운다 (활동명·날짜·학생은 이어서 쓰게 둔다)
  const [state, action, pending] = useActionState<LogState, FormData>(async (prev, fd) => {
    const r = await addLogs(prev, fd);
    if (r.added && !r.error) setText("");
    return r;
  }, {});
  const [activity, setActivity] = useState("");
  // N43 기재요령 "이 글에서 찾기": 누가기록 내용 칸이 대상
  useGuideTarget(text, "누가기록");
  const gm = useGuideMarks(text);
  const [chip, setChip] = useState<DateChip>("today");
  const [pickedDate, setPickedDate] = useState(today);
  const date = chipDate(chip, today, pickedDate);
  const full = withActivity(activity, text);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 한 명씩 = 고른 학생 모두에게 같은 글 · 한꺼번에 = 학생마다 참여도·특징 문장을 붙인 다른 글 (Figma N28)
  const [mode, setMode] = useState<"one" | "batch">("one");
  const [batchAdded, setBatchAdded] = useState(0);
  const [polish, setPolish] = useState<PolishResult | null>(null);
  // AI로 다듬은 글 (넣은 그대로일 때만 "AI로 다듬음")
  const [polished, setPolished] = useState("");
  const [polishing, startPolish] = useTransition();
  const runPolish = () => startPolish(async () => {
    try {
      setSource(null);
      setPolish(await polishLogMemo({ area, clubId, text }));
    } catch {
      setPolish({ ok: false, error: "다듬지 못했어요. 직접 써 주세요" });
    }
  });
  // 파일로 쓰기 (Figma N10): 활동지·보고서·사진 → 누가기록 한두 문장 제안. 큰 PDF는 쪽을 나눠 읽고 이어 붙인다
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const runFile = (f: File) => startPolish(async () => {
    try {
      const texts: string[] = [];
      let label: "AI" | "자동" = "AI";
      for (const part of await prepareUpload(f)) {
        const fd = new FormData();
        fd.set("file", part);
        fd.set("area", area);
        if (clubId) fd.set("clubId", clubId);
        const r = await readLogFile(fd);
        if (!r.ok) { setSource(null); setPolish(r); return; }
        texts.push(r.text);
        label = r.label;
      }
      setSource(f.name);
      setPolish({ ok: true, text: texts.join(" ").slice(0, 1000), label });
    } catch {
      setPolish({ ok: false, error: "파일을 읽지 못했어요. 직접 써 주세요" });
    }
  });
  // 순화하기 (Figma N34 ③): 퉁명스러운 말이 있으면 알림 줄 → 순화한 글 → "조각으로 넣기"(= 고른 학생에게 추가)
  const blunt = useMemo(() => bluntWords(text), [text]);
  const [soft, setSoft] = useState<{ memo: string; r: PolishResult } | null>(null);
  const runSoften = () => startPolish(async () => {
    const memo = text;
    try { setSoft({ memo, r: await softenLogMemo({ area, clubId, text: memo }) }); } catch { setSoft({ memo, r: { ok: false, error: "순화하지 못했어요. 직접 고쳐 주세요" } }); }
  });
  const softShown = soft && soft.memo === text ? soft : null;
  const insertSoft = (t: string) => {
    const fd = new FormData();
    fd.set("area", area);
    if (clubId) fd.set("clubId", clubId);
    fd.set("studentIds", JSON.stringify([...picked]));
    fd.set("date", date);
    fd.set("activity", activity);
    fd.set("content", t);
    setSoft(null);
    startTransition(() => action(fd));
    setStep(3); // 남긴 결과는 ③에서 본다
  };
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const pool = useMemo(() => students.map((s) => ({ ...s, studentNo: makeStudentNo(s.grade, s.classNo, s.number) })), [students]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = picked.size === students.length && students.length > 0;
  const shown = picked.size ? logs.filter((l) => picked.has(l.studentId)) : logs;
  const one = picked.size === 1 ? [...picked][0] : null;
  // N48 단계: 고른 학생이 없으면 ①부터 (이 화면 안에서만 기억)
  const [step, setStep] = useState<WriteStep>(() => defaultLogStep(0));
  const [batchMade, setBatchMade] = useState(false);
  const go = (s: WriteStep) => { setStep(s); requestAnimationFrame(() => { const el = top.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
  const top = useRef<HTMLElement>(null);
  const ready = picked.size > 0 && !!cleanActivity(activity) && text.trim().length >= 5;
  const writeWhy = !cleanActivity(activity) ? "활동명을 적어 주세요" : text.trim().length < 5 ? "본 것을 다섯 글자 넘게 적어 주세요" : "";
  const added = !!state.added && !state.error && !text;
  const items: StepItem[] = [
    { label: LOG_STEP_LABEL[1], value: picked.size ? `${picked.size}명` : "아직 없어요", done: picked.size > 0 },
    { label: LOG_STEP_LABEL[2], value: mode === "batch" ? (batchMade ? "글 만들었어요" : "공통 내용 · 특징") : text.trim() ? `${full.length}자 · ${neisBytes(full).toLocaleString()}B` : "글 없음", done: mode === "batch" ? batchMade : ready },
    { label: LOG_STEP_LABEL[3], value: added ? `${state.added}명에게 남김` : picked.size ? `${picked.size}명에게` : "남기기 전", done: added || (mode === "batch" && batchAdded > 0 && !batchMade), tone: added ? "ok" : undefined, disabled: mode === "batch" && !batchMade },
  ];

  const tabs = (
    <div role="tablist" aria-label="쓰는 방식" className="flex rounded-full bg-soft p-[3px]">
      {([["one", "한 명씩"], ["batch", "한꺼번에"]] as const).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
          className={cx("h-7 whitespace-nowrap rounded-full px-3 text-[13px] md:h-[30px] md:px-3.5", mode === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>
          {label}
        </button>
      ))}
    </div>
  );
  const recipients = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 whitespace-nowrap text-[13px] font-medium text-sub">받는 학생</span>
      {picked.size === 0 && <button type="button" onClick={() => go(1)} className="text-[13px] font-medium text-key-strong">① 학생 고르기</button>}
      {students.filter((s) => picked.has(s.id)).map((s) => (
        <span key={s.id} className="inline-flex h-[26px] items-center gap-1 rounded-chip bg-key-soft pl-2 pr-1.5 text-[12px] font-medium text-key-strong">
          {s.name}
          <button type="button" aria-label={`${s.name} 빼기`} onClick={() => toggle(s.id)} className="flex size-4 items-center justify-center"><X size={12} strokeWidth={3} /></button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_340px] md:gap-6">
      <Card title={`${area} 기록 쓰기`} action={tabs}>
        <div className="flex flex-col gap-4">
          <WriteStepper label="누가기록 단계" items={items} current={step} onPick={go} innerRef={top} />

          {/* ① 학생 고르기 (Figma N48 f): 여러 명 · 명단 붙여넣기 · 모두 선택 */}
          <div className={step === 1 ? "flex flex-col gap-3" : "hidden"}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold">고른 학생 <span className="text-key-strong">{picked.size}</span> / {students.length}명</span>
              <button type="button" onClick={() => setPicked(all ? new Set() : new Set(students.map((s) => s.id)))} className="h-8 shrink-0 whitespace-nowrap px-1 text-[13px] font-medium text-key-strong">
                {all ? "모두 해제" : "모두 선택"}
              </button>
            </div>
            {students.length > 0 && (
              <StudentListImport pool={pool} picked={picked} onAdd={(ids) => setPicked((p) => new Set([...p, ...ids]))} />
            )}
            <ul className="grid max-h-[520px] gap-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {students.map((s) => {
                const on = picked.has(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                      className={cx("flex w-full items-center gap-3 rounded-inner px-2.5 py-2.5 text-left", on ? "bg-key-soft" : "bg-white hover:bg-line")}>
                      <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-chip", on ? "bg-key text-white" : "border border-hair bg-[#fff]")}>{on && <Check size={13} strokeWidth={3} />}</span>
                      <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
                      <span className={cx("min-w-0 flex-1 truncate", on && "font-bold")}>{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-mute">{s.count}건</span>
                    </button>
                  </li>
                );
              })}
              {students.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
            </ul>
          </div>

          {mode === "batch" ? (
            // 한꺼번에 (Figma N28): ② 공통 내용 · 학생별 특징 → ③ 미리보기 · 추가. 숨겨도 그려 둔다(적은 것 유지)
            <div className={step === 1 ? "hidden" : "contents"}>
              {batchAdded > 0 && step === 2 && <p className="text-[13px] text-ok" role="status">{batchAdded}명에게 학생마다 다른 글로 추가했어요</p>}
              <BatchWriter area={area} clubId={clubId} today={today} students={students.filter((s) => picked.has(s.id))}
                phase={step === 3 ? "preview" : "pick"}
                onPhase={(p) => { if (p === "preview") { setBatchMade(true); go(3); } else go(2); }}
                onAdded={(n) => { setBatchAdded(n); setBatchMade(false); }} />
            </div>
          ) : (
          // 한 명씩 (Figma N48 g · h, N32 405:12816): ② 받는 학생 → 활동명 + 날짜 칩 → 기록 내용 → 글 수 · 파일로 쓰기 · AI로 다듬기 / ③ 미리보기 → n명에게 추가
          <form action={action} key={state.added ? `ok-${logs.length}` : "form"} className={step === 1 ? "hidden" : "flex flex-col gap-3"}>
            <input type="hidden" name="area" value={area} />
            {clubId && <input type="hidden" name="clubId" value={clubId} />}
            <input type="hidden" name="studentIds" value={JSON.stringify([...picked])} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="activity" value={activity} />
            <input type="hidden" name="content" value={text} />
            {recipients}
            <div className={step === 2 ? "contents" : "hidden"}>
            <div className="flex flex-col gap-2 md:flex-row">
              <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={ACTIVITY_MAX} aria-label="활동명"
                placeholder="활동명 (예: 과학의 날 실험 부스)"
                className="h-11 w-full min-w-0 rounded-field bg-soft px-3 text-[15px] outline-none placeholder:text-mute focus:ring-2 focus:ring-key md:h-10 md:flex-1 md:text-[14px]" />
              <div className="flex gap-2" role="radiogroup" aria-label="날짜">
                <button type="button" role="radio" aria-checked={chip === "today"} onClick={() => setChip("today")} className={chipCls(chip === "today")}>오늘 {shortMd(today)}</button>
                <button type="button" role="radio" aria-checked={chip === "yesterday"} onClick={() => setChip("yesterday")} className={chipCls(chip === "yesterday")}>어제</button>
                {chip === "pick" ? (
                  <input type="date" value={date} max={today} aria-label="날짜 고르기" autoFocus
                    onChange={(e) => { const d = e.target.value; if (!d) return; setPickedDate(d); setChip(chipOf(d, today)); }}
                    className="h-10 rounded-field bg-key-soft px-2.5 text-[14px] font-bold text-key-strong outline-none focus:ring-2 focus:ring-key" />
                ) : (
                  <button type="button" role="radio" aria-checked={false} onClick={() => { setPickedDate(date); setChip("pick"); }} className={chipCls(false)}>
                    <CalendarDays size={15} /> 날짜
                  </button>
                )}
              </div>
            </div>
            <HighlightTextarea value={text} onChange={setText} maxLength={1000}
              marks={[...blunt.map((h) => ({ start: h.start, end: h.end, tone: "warn" as const })), ...gm.marks]} focusKey={gm.focusKey}
              placeholder="관찰한 활동을 짧게 적거나 받아쓰기를 붙여 넣어 주세요. 고른 학생 모두에게 같은 내용이 들어가요"
              boxClassName="rounded-field bg-soft focus-within:ring-2 focus-within:ring-key"
              textClassName="min-h-[104px] px-4 py-3 text-[15px] leading-6 md:min-h-[88px] md:text-[14px]" aria-label="기록 내용" />
            {gm.line}
            <SoftenNotice hits={blunt} busy={polishing} onRun={aiOn ? runSoften : undefined} />
            {softShown?.r.ok && (
              <SoftenResult memo={softShown.memo} soft={softShown.r.text} hits={blunt} label={softShown.r.label} busy={polishing || pending}
                onRedo={runSoften} onKeep={() => setSoft(null)} onInsert={() => softShown.r.ok && insertSoft(softShown.r.text)} />
            )}
            {softShown && !softShown.r.ok && <p className="text-[13px] text-bad" role="alert">{softShown.r.error}</p>}
            {polish?.ok && (
              <div className="flex flex-col gap-2 rounded-inner bg-bg p-3.5">
                <div className="flex items-center gap-1.5">
                  <Tag tone={polish.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{polish.label}</Tag>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{source ? `${source}에서` : "다듬은 문장"} · 모두에게 같은 글이 들어가요</span>
                </div>
                <p className="text-[15px] leading-7">{polish.text}</p>
                {polish.notice && <p className="text-[12px] text-mute">{polish.notice}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" kind="ghost" size="sm" onClick={() => setPolish(null)}>그대로 두기</Button>
                  <Button type="button" kind="outline" size="sm" onClick={() => { setText(polish.text); setPolished(polish.text); setPolish(null); }}>확인 후 넣기</Button>
                </div>
              </div>
            )}
            {polish && !polish.ok && <p className="text-[13px] text-bad" role="alert">{polish.error}</p>}
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <span className="min-w-0 flex-1 text-[12px] text-mute">활동명이 맨 앞에 붙어요 · {full.length}자 · {neisBytes(full).toLocaleString()}B</span>
              <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) runFile(f); e.target.value = ""; }} />
              <div className="flex gap-2">
                <Button type="button" kind="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={polishing} className="h-8 px-3">
                  <Paperclip size={13} /> 파일로 쓰기
                </Button>
                <Button type="button" kind="outline" size="sm" onClick={runPolish} disabled={polishing || text.trim().length < 2} className="h-8 px-3 disabled:opacity-40">
                  <Sparkles size={13} /> {polishing ? "읽는 중…" : "AI로 다듬기"}
                </Button>
              </div>
            </div>
            </div>

            <div className={step === 3 ? "contents" : "hidden"}>
              {added ? (
                <div className="flex flex-col gap-2.5 rounded-inner bg-ok-soft px-4 py-3.5" role="status">
                  <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#00A05D]"><Check size={15} strokeWidth={3} /> {state.added}명에게 추가했어요</span>
                  <span className="flex flex-wrap gap-2">
                    <Button type="button" kind="outline" size="sm" onClick={() => go(2)}>같은 학생에게 이어 쓰기</Button>
                    <Button type="button" kind="outline" size="sm" onClick={() => { setPicked(new Set()); go(1); }}>다른 학생 고르기</Button>
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-inner bg-bg px-4 py-3.5">
                  <span className="text-[12px] text-mute">{shortMd(date)} · {area} · 고른 {picked.size}명 모두에게 같은 글{polished && text === polished ? " · AI로 다듬음" : ""}</span>
                  <p className={cx("break-keep text-[15px] leading-7", !text.trim() && "text-mute")}>{text.trim() ? full : "② 기록 쓰기에서 본 것을 적어 주세요"}</p>
                  <span className="text-[12px] text-mute">{full.length}자 · {neisBytes(full).toLocaleString()}B{blunt.length ? ` · 순화할 말 ${blunt.length}개` : ""}</span>
                </div>
              )}
              {!added && text.trim().length >= 2 && (
                <ReviseBox kind="log" small text={text} unit="bytes" limit={3000}
                  disabled={aiOn ? undefined : "AI가 꺼져 있어 수정 요청을 보낼 수 없어요. 직접 고쳐 주세요"}
                  run={(request) => reviseLogMemo({ area, clubId, text, request })}
                  onApply={(t) => { setText(t); setPolished(t); }} />
              )}
              {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
              {!added && (
                <div data-sticky-cta className="z-10 flex gap-2 bg-[#fff] max-md:sticky max-md:bottom-[calc(env(safe-area-inset-bottom)+66px)] max-md:-mx-5 max-md:border-t max-md:border-line max-md:px-5 max-md:py-3">
                  <PrevButton onClick={() => go(2)} />
                  <Button disabled={pending || !!softShown?.r.ok || !ready} className="h-11 flex-1 py-0 disabled:bg-key disabled:opacity-40 md:h-[42px]">
                    {pending ? "추가하는 중…" : picked.size ? `${picked.size}명에게 추가` : "학생을 골라 주세요"}
                  </Button>
                </div>
              )}
            </div>
          </form>
          )}

          {step === 1 && (
            <StepNav onNext={() => go(2)} next="다음 · 기록 쓰기" nextDisabled={picked.size === 0} primary={picked.size > 0}
              hint={picked.size ? `${picked.size}명 골랐어요` : "기록을 남길 학생을 골라 주세요"} />
          )}
          {step === 2 && mode === "one" && (
            <StepNav onPrev={() => go(1)} onNext={() => go(3)} next="다음 · 확인" nextDisabled={!ready || !!softShown?.r.ok} primary={ready}
              hint={picked.size === 0 ? "①에서 학생을 먼저 골라 주세요" : writeWhy || "고른 학생 모두에게 같은 글이 들어가요"} />
          )}
          {step === 2 && mode === "batch" && <StepNav onPrev={() => go(1)} hint="글 만들기를 누르면 ③ 미리보기로 가요" />}
          {step === 3 && mode === "batch" && <StepNav onPrev={() => go(2)} hint="확인 후 추가하면 학생마다 하나씩 남아요" />}
        </div>
      </Card>

      <Card title="최근 기록" action={<span className="text-[13px] text-mute">{picked.size ? "고른 학생" : "전체"} · {shown.length}건</span>}>
        {shown.length === 0 ? (
          <p className="text-[13px] text-mute">아직 기록이 없어요</p>
        ) : (
          // 역량 보기 (Figma N18): 학생 한 명을 고르면 그 학생 기록 전체를 한 글로 보고 역량으로 나눈다
          <RecordCompetency studentId={one ?? ""} text={one ? [...shown].reverse().map((l) => l.content.trim()).join(" ") : ""}
            title={one ? `${nameOf.get(one)} 기록 ${shown.length}건` : "학생 한 명을 고르면"}>
            {/* 상자 없는 행 (Figma N48 오른쪽 칸): 위 줄 날짜 · 이름 + 글 두 줄 */}
            <ul className="flex flex-col">
              {shown.slice(0, 30).map((l) => (
                <li key={l.id} className="flex flex-col gap-1 border-t border-soft py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 text-[12px] tabular-nums text-mute">{shortMd(l.date)}</span>
                    <span className="shrink-0 text-[13px] font-medium">{nameOf.get(l.studentId)}</span>
                  </span>
                  <span className="line-clamp-2 min-w-0 text-[13px] leading-5 text-sub">{l.content}</span>
                </li>
              ))}
            </ul>
          </RecordCompetency>
        )}
      </Card>
    </div>
  );
}
