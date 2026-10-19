"use client";
import { startTransition, useActionState, useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, Check, Paperclip, Sparkles, X } from "lucide-react";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "@/components/writing/evidence-files";
import { ACTIVITY_MAX, cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { chipDate, chipOf, shortMd, type DateChip } from "@/lib/domain/log-date";
import { Button, Card, Tag, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { addLogs, polishLogMemo, readLogFile, softenLogMemo, type LogState, type PolishResult } from "./actions";
import { bluntWords } from "@/lib/domain/soften";
import { HighlightTextarea } from "@/components/writing/highlight-textarea";
import { useGuideMarks, useGuideTarget } from "@/components/writing/guide-store";
import { SoftenNotice, SoftenResult } from "@/components/writing/soften";
import { makeStudentNo } from "@/lib/domain/roster";
import { StudentListImport } from "@/components/student-list-import";
import { RecordCompetency } from "@/components/writing/record-competency";
import { BatchWriter } from "./batch-writer";

type S = { id: string; name: string; grade: number; classNo: number; number: number; count: number };
type L = { id: string; studentId: string; date: string; content: string };

// 왼쪽: 학생 고르기(여러 명) · 오른쪽: 같은 기록을 한 번에 추가 + 최근 기록
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
  };
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const pool = useMemo(() => students.map((s) => ({ ...s, studentNo: makeStudentNo(s.grade, s.classNo, s.number) })), [students]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = picked.size === students.length && students.length > 0;
  const shown = picked.size ? logs.filter((l) => picked.has(l.studentId)) : logs;
  const one = picked.size === 1 ? [...picked][0] : null;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr] md:gap-6">
      <Card title="학생" action={
        <button type="button" onClick={() => setPicked(all ? new Set() : new Set(students.map((s) => s.id)))} className="text-[13px] font-medium text-key-strong">
          {all ? "모두 해제" : "모두 선택"}
        </button>
      }>
        {students.length > 0 && (
          <StudentListImport pool={pool} picked={picked} onAdd={(ids) => setPicked((p) => new Set([...p, ...ids]))} className="mb-2 self-start" />
        )}
        <ul className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">
          {students.map((s) => {
            const on = picked.has(s.id);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                  className={cx("flex w-full items-center gap-3 rounded-inner px-2 py-2.5 text-left", on ? "bg-white" : "hover:bg-white/60")}>
                  <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-chip", on ? "bg-key text-white" : "bg-white")}>{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
                  <span className={cx("min-w-0 flex-1 truncate", on && "font-bold")}>{s.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-mute">{s.count}건</span>
                </button>
              </li>
            );
          })}
          {students.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
        </ul>
      </Card>

      <div className="flex flex-col gap-4 md:gap-6">
        <Card title={`${area} 기록 쓰기`} action={
          <div className="flex items-center gap-3">
            {mode === "batch" && <span className="whitespace-nowrap text-[13px] text-mute">{picked.size}명 선택</span>}
            <div role="tablist" aria-label="쓰는 방식" className="flex rounded-full bg-soft p-[3px]">
              {([["one", "한 명씩"], ["batch", "한꺼번에"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                  className={cx("h-7 whitespace-nowrap rounded-full px-3 text-[13px] md:h-[30px] md:px-3.5", mode === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        }>
          {mode === "batch" ? (
            <>
              {batchAdded > 0 && <p className="mb-3 text-[13px] text-ok" role="status">{batchAdded}명에게 학생마다 다른 글로 추가했어요</p>}
              <BatchWriter area={area} clubId={clubId} today={today} students={students.filter((s) => picked.has(s.id))} onAdded={setBatchAdded} />
            </>
          ) : (
          // 한 명씩 (Figma N32 405:12816): 받는 학생 칩 → 활동명 + 날짜 칩 → 기록 내용 → 글 수·바이트 + 파일로 쓰기 · AI로 다듬기 → n명에게 추가
          <form action={action} key={state.added ? `ok-${logs.length}` : "form"} className="flex flex-col gap-3">
            <input type="hidden" name="area" value={area} />
            {clubId && <input type="hidden" name="clubId" value={clubId} />}
            <input type="hidden" name="studentIds" value={JSON.stringify([...picked])} />
            <input type="hidden" name="date" value={date} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 whitespace-nowrap text-[13px] font-medium text-sub">받는 학생</span>
              {picked.size === 0 && <span className="text-[13px] text-mute">학생을 골라 주세요</span>}
              {students.filter((s) => picked.has(s.id)).map((s) => (
                <span key={s.id} className="inline-flex h-[26px] items-center gap-1 rounded-chip bg-key-soft pl-2 pr-1.5 text-[12px] font-medium text-key-strong">
                  {s.name}
                  <button type="button" aria-label={`${s.name} 빼기`} onClick={() => toggle(s.id)} className="flex size-4 items-center justify-center"><X size={12} strokeWidth={3} /></button>
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <input name="activity" value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={ACTIVITY_MAX} required aria-label="활동명"
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
            <HighlightTextarea name="content" value={text} onChange={setText} maxLength={1000} required
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
                  <Button type="button" kind="outline" size="sm" onClick={() => { setText(polish.text); setPolish(null); }}>확인 후 넣기</Button>
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
            {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
            {state.added && !state.error && <p className="text-[13px] text-ok" role="status">{state.added}명에게 추가했어요</p>}
            <Button disabled={pending || !!softShown?.r.ok || picked.size === 0 || !cleanActivity(activity) || text.trim().length < 5} className="h-11 w-full py-0 disabled:bg-key disabled:opacity-40 md:h-[42px]">
              {pending ? "추가하는 중…" : picked.size ? `${picked.size}명에게 추가` : "학생을 골라 주세요"}
            </Button>
          </form>
          )}
        </Card>

        <Card title="최근 기록" action={<span className="text-[13px] text-mute">{picked.size ? "고른 학생" : "전체"} · {shown.length}건</span>}>
          {shown.length === 0 ? (
            <p className="text-[13px] text-mute">아직 기록이 없어요</p>
          ) : (
            // 역량 보기 (Figma N18): 학생 한 명을 고르면 그 학생 기록 전체를 한 글로 보고 역량으로 나눈다
            <RecordCompetency studentId={one ?? ""} text={one ? [...shown].reverse().map((l) => l.content.trim()).join(" ") : ""}
              title={one ? `${nameOf.get(one)} 기록 ${shown.length}건` : "학생 한 명을 고르면"}>
              {/* 상자 없는 행 (Figma N32 405:12962): PC 날짜 · 이름 · 글 두 줄, 모바일 위 줄(이름 · 날짜) + 글 */}
              <ul className="flex flex-col">
                {shown.slice(0, 30).map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 border-t border-soft py-2.5 md:flex-row md:gap-3">
                    <span className="flex items-center gap-2 md:contents">
                      <span className="shrink-0 text-[13px] font-medium md:order-2 md:w-[52px] md:truncate">{nameOf.get(l.studentId)}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-mute md:order-1 md:w-10 md:pt-px md:text-[13px]">{shortMd(l.date)}</span>
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 text-sub md:order-3">{l.content}</span>
                  </li>
                ))}
              </ul>
            </RecordCompetency>
          )}
        </Card>
      </div>
    </div>
  );
}
