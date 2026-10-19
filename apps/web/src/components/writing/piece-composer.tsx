"use client";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { FileUp, Paperclip, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "./evidence-files";
import { neisBytes } from "@/lib/domain/length";
import { ACTIVITY_MAX, cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { PIECE_MAX, PIECE_MIN, type PieceKind } from "@/lib/domain/merge";
import type { EvidenceResult } from "@/lib/server/ai/read-evidence";
import { bluntWords } from "@/lib/domain/soften";
import { HighlightTextarea } from "./highlight-textarea";
import { SoftenNotice, SoftenResult } from "./soften";
import { LessonChips } from "./lesson-chips";
import { lessonDate, lessonMd, type LessonChipItem } from "@/lib/domain/lesson-plan";

// 활동 메모 추가 (Figma N40 482:813): 흰 칸 하나 — 머리 줄 [메모 | 자료] 탭 · 활동명 줄 · 메모(또는 자료) · 아래 줄(상태 글 ↔ 버튼).
// 버튼이 꺼져 있으면 왜 꺼졌는지 아래 줄이 말한다. Ctrl(⌘)+Enter 로 남긴다.
// 메모 = 활동명 + 지금 본 것 → "메모 남기기". 자료 = 활동명 + 자료 + 짧은 설명 → AI 활동 요약(고쳐 쓸 수 있음) → "메모로 남기기".
// 세특 글은 여기서 만들지 않는다 — ② AI로 쓰기에서만.

export type ComposerProps = {
  activity: string;
  setActivity: (v: string) => void;
  activityRef?: RefObject<HTMLInputElement | null>;
  /** 남기기: 서버가 "[활동명] …"으로 붙여 저장한다 */
  add: (text: string, activity: string, kind: PieceKind) => Promise<{ error?: string }>;
  /** 자료 읽기 → 활동 요약 (없으면 자료 탭을 숨긴다) */
  summarize?: (fd: FormData) => Promise<EvidenceResult>;
  placeholder: string;
  onAdded: () => void;
  /** 순화하기 (Figma N34 ③): 메모에 퉁명스러운 말이 있으면 알림 줄 → 순화한 글 → 메모로 넣기. 없으면(AI 꺼짐) 버튼 숨김 */
  soften?: (text: string) => Promise<{ ok: true; text: string; label: "AI" } | { ok: false; error: string }>;
  /** 메모 칸 밑줄·알림 줄을 보일지 (기록 쓰기 화면) */
  bluntCheck?: boolean;
  /** 차시별 활동 메뉴 (Figma N43 (f)): 칩을 누르면 활동명 · 날짜가 채워지고, 남기면 그 차시 메모(출처 "차시")가 된다 */
  lesson?: LessonMenu;
};

export type LessonMenu = {
  items: LessonChipItem[];
  /** 이 학생에게 메모가 있는 차시 */
  done: string[];
  today: string;
  /** 차시 메모 남기기 (활동 내용은 메모에 넣지 않음) */
  add: (text: string, activity: string, itemId: string) => Promise<{ error?: string }>;
  onBulk?: (itemId?: string) => void;
  onCommon?: (item: LessonChipItem) => void;
};

type Summary = { text: string; label: "AI" | "자동" };

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noop = () => () => {};

/** 아래 줄의 [Ctrl] [Enter] 키 모양 (Figma N40) */
function Keys() {
  // 서버에서는 Ctrl, 맥에서는 ⌘ (hydration 뒤에 바뀐다)
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const k = "rounded-[4px] border border-hair bg-[#fff] px-1 text-[11px] font-medium leading-[18px] text-sub";
  return (
    <span className="hidden shrink-0 items-center gap-[3px] whitespace-nowrap md:inline-flex" aria-hidden>
      <kbd className={k}>{mac ? "⌘" : "Ctrl"}</kbd><kbd className={k}>Enter</kbd><span className="text-[12px] text-mute">로 남겨요</span>
    </span>
  );
}

/** 아래 줄 왼쪽 상태 글 */
function Status({ tone = "mute", children }: { tone?: "mute" | "wait" | "ok" | "bad"; children: ReactNode }) {
  return (
    <span className={cx("flex min-w-0 items-center gap-1.5 text-[12px] leading-[18px] break-keep",
      tone === "wait" ? "font-medium text-[#9A6400]" : tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-mute")}
      role={tone === "bad" ? "alert" : tone === "ok" ? "status" : undefined}>
      {tone === "wait" && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-wait" />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

const MAIN = "h-11 w-full md:h-9 md:w-auto";
// 칸 안 입력은 바깥 칸 테두리(focus-within)로 초점을 보인다 — 전역 :focus-visible 테두리가 겹치지 않게
const NO_RING = { outline: "none" } as const;
const OFF = "disabled:bg-soft disabled:text-mute disabled:opacity-100";

export function PieceComposer({ activity, setActivity, activityRef, add, summarize, placeholder, onAdded, soften, bluntCheck = !!soften, lesson }: ComposerProps) {
  // N43 차시: 고른 차시 (활동명을 손으로 고치면 풀린다) · 이 화면에서 남긴 차시
  const [picked, setPicked] = useState<LessonChipItem | null>(null);
  const [doneHere, setDoneHere] = useState<string[]>([]);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"memo" | "file">("memo");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const hasActivity = !!cleanActivity(activity);
  const blunt = useMemo(() => (bluntCheck ? bluntWords(text) : []), [bluntCheck, text]);
  const [soft, setSoft] = useState<{ memo: string; r: { ok: true; text: string; label: "AI" } | { ok: false; error: string } } | null>(null);
  const runSoften = () => soften && start(async () => {
    const memo = text;
    try { setSoft({ memo, r: await soften(memo) }); } catch { setSoft({ memo, r: { ok: false, error: "순화하지 못했어요. 직접 고쳐 주세요" } }); }
  });
  const memoMode = mode === "memo" || !summarize;
  const softShown = memoMode && soft && soft.memo === text ? soft : null;

  const save = (body: string, kind: PieceKind) => start(async () => {
    setMsg(null);
    const viaLesson = kind === "memo" && picked && lesson ? picked : null;
    const r = await (viaLesson ? lesson!.add(body, activity, viaLesson.id) : add(body, activity, kind)).catch(() => ({ error: "남기지 못했어요" }));
    if (r.error) return setMsg({ ok: false, text: r.error });
    if (viaLesson) setDoneHere((d) => [...d, viaLesson.id]);
    setMsg({ ok: true, text: viaLesson ? `${viaLesson.no}차시 메모를 남겼어요 · 아래 목록에 있어요` : "메모를 남겼어요 · 아래 목록에 있어요" });
    if (kind === "memo") setText("");
    else { setSummary(null); setFile(null); setNote(""); }
    onAdded();
  });

  const run = () => start(async () => {
    if (!file || !summarize) return;
    setMsg(null);
    try {
      const texts: string[] = [];
      let label: "AI" | "자동" = "자동";
      for (const part of await prepareUpload(file)) {
        const fd = new FormData();
        fd.set("file", part);
        const r = await summarize(fd);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        texts.push(r.text);
        label = r.label;
      }
      // 교사가 적은 설명이 있으면 요약 앞에 (요약이 비면 설명만)
      const body = [note.trim(), texts.join(" ").trim()].filter(Boolean).join(" ").slice(0, PIECE_MAX - 50);
      setSummary({ text: body, label });
    } catch {
      setMsg({ ok: false, text: "자료를 읽지 못했어요. 다시 해 주세요" });
    }
  });

  const memoReady = hasActivity && text.trim().length >= PIECE_MIN && !softShown?.r.ok;
  const fileReady = hasActivity && !!file;
  const sumReady = hasActivity && !!summary && summary.text.trim().length >= PIECE_MIN;
  const sumBytes = summary ? neisBytes(withActivity(activity, summary.text)) : 0;
  // 메모를 쓰기 시작했는데 활동명이 비었으면 활동명 줄을 노랗게 (왜 못 남기는지)
  const needActivity = !hasActivity && (memoMode ? !!text.trim() : !!file);

  // Ctrl(⌘)+Enter: 준비됐을 때만 남긴다 (자료는 요약 → 남기기 순서 그대로)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || busy || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (memoMode) { if (memoReady) save(text, "memo"); }
    else if (summary) { if (sumReady) save(summary.text, "file"); }
    else if (fileReady) run();
  };

  const pick = (f: File | null | undefined) => { setFile(f ?? null); setMsg(null); };

  const tabs = summarize && (
    <div role="tablist" aria-label="메모 종류" className="flex shrink-0 rounded-control bg-soft p-[3px]">
      {([["memo", "메모"], ["file", "자료"]] as const).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setMsg(null); }}
          className={cx("h-7 whitespace-nowrap rounded-chip px-3.5 text-[13px]", mode === k ? "border border-line bg-[#fff] font-bold text-key-strong" : "border border-transparent font-medium text-sub hover:text-ink")}>{l}</button>
      ))}
    </div>
  );

  const activityRow = (
    <label className={cx("flex min-h-11 items-center gap-2.5 border-y border-soft py-1.5 pl-3.5 pr-3", needActivity && "bg-[#FFFBF2]")}>
      <span className={cx("shrink-0 text-[13px] font-bold", needActivity ? "text-[#9A6400]" : "text-sub")}>활동명</span>
      <input ref={activityRef} value={activity} onChange={(e) => { setActivity(e.target.value); setMsg(null); if (picked && e.target.value !== picked.title) setPicked(null); }} onKeyDown={onKey} maxLength={ACTIVITY_MAX}
        style={NO_RING} aria-label="활동명" aria-invalid={needActivity || undefined} placeholder="예: 빗면 실험 탐구"
        className="h-8 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute" />
      <span className={cx("shrink-0 whitespace-nowrap rounded-chip px-1.5 text-[11px] font-medium leading-[18px]",
        needActivity ? "bg-wait-soft text-[#9A6400]" : "bg-soft text-mute")}>
        {picked && memoMode && lesson ? <>{picked.no}차시 · {lessonMd(lessonDate(picked, lesson.today))}<span className="max-md:hidden">로 남겨요</span></>
          : needActivity ? "먼저 적어 주세요" : hasActivity ? <><span className="max-md:hidden">기록 맨 앞에 붙어요</span><span className="md:hidden">맨 앞에 붙어요</span></> : "꼭 적어요"}
      </span>
    </label>
  );

  // 아래 줄 상태 글: 남긴 뒤·오류 > 활동명 없음 > 지금 할 일
  const status = msg ? (
    <Status tone={msg.ok ? "ok" : "bad"}>{msg.text}</Status>
  ) : needActivity ? (
    <Status tone="wait">활동명을 적어야 남길 수 있어요</Status>
  ) : memoMode ? (
    text.trim() ? (
      <span className="flex min-w-0 items-center gap-1.5">
        <Status>{[...text.trim()].length}자 · {neisBytes(withActivity(activity, text.trim())).toLocaleString()}B</Status>
        {memoReady && <><span aria-hidden className="hidden text-[12px] text-faint md:inline">·</span><Keys /></>}
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-1.5">
        <Status>{hasActivity ? "지금 본 것을 적으면 남길 수 있어요" : "활동명과 본 것을 적으면 남길 수 있어요"}</Status>
        <Keys />
      </span>
    )
  ) : summary ? (
    <Status>고쳐 쓴 뒤 남겨도 돼요</Status>
  ) : file ? (
    <Status>AI가 자료를 읽고 활동 요약을 만들어요</Status>
  ) : (
    <Status>자료를 올리면 AI가 활동 요약을 만들어요</Status>
  );

  const pickLesson = (i: LessonChipItem | null) => {
    setPicked(i);
    setMsg(null);
    if (i) { setMode("memo"); setActivity(i.title); window.setTimeout(() => memoRef.current?.focus(), 0); }
  };

  return (
    <div className="flex flex-col gap-3">
      {lesson && lesson.items.length > 0 && (
        <LessonChips items={lesson.items} done={new Set([...lesson.done, ...doneHere])} picked={picked?.id ?? null} today={lesson.today}
          onPick={pickLesson} onBulk={lesson.onBulk ? () => lesson.onBulk!(picked?.id) : undefined} onCommon={lesson.onCommon} />
      )}
      <div className={cx("flex flex-col overflow-hidden rounded-inner bg-[#fff] transition-colors",
        memoMode && text.trim() ? "outline outline-[1.5px] -outline-offset-1 outline-key" : "border border-hair focus-within:border-key")}>
        <div className="flex items-center gap-2.5 py-2 pl-2 pr-3.5">
          {tabs ?? <span className="pl-1.5 text-[13px] font-bold text-sub">메모</span>}
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-mute max-md:hidden">
            {memoMode ? "관찰한 사실을 한두 문장으로 · 평가 말은 빼요" : "수행평가지·보고서·사진을 올려요"}
          </span>
        </div>
        {activityRow}

        {memoMode ? (
          <HighlightTextarea ref={memoRef} value={text} onChange={(v) => { setText(v); setMsg(null); }} onKeyDown={onKey} maxLength={PIECE_MAX} aria-label="활동 메모" style={NO_RING}
            placeholder={placeholder} marks={blunt.map((h) => ({ start: h.start, end: h.end, tone: "warn" as const }))}
            boxClassName="min-w-0"
            textClassName="min-h-24 px-3.5 py-3 text-[14px] leading-[22px] md:min-h-[76px]" />
        ) : !summary ? (
          <div className="flex flex-col gap-2 px-3.5 pb-1 pt-3">
            <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="활동 자료" tabIndex={-1}
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {file ? (
              <span className="flex h-12 min-w-0 items-center gap-2 rounded-field border border-line bg-bg px-3 text-[13px]">
                <Paperclip size={14} className="shrink-0 text-mute" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => input.current?.click()} className="shrink-0 text-[12px] font-medium text-key-strong">바꾸기</button>
                <button type="button" aria-label="자료 빼기" onClick={() => setFile(null)} className="shrink-0 text-mute"><X size={14} /></button>
              </span>
            ) : (
              <button type="button" onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                className={cx("flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-field border border-dashed px-3 py-3 text-center transition-colors",
                  drag ? "border-key bg-key-soft" : "border-faint bg-[#F8F9FB] hover:bg-bg")}>
                <span className="flex items-center gap-1.5 text-[14px] font-bold text-key-strong"><FileUp size={16} className="shrink-0" /> 활동 자료 올리기</span>
                <span className="text-[12px] text-mute break-keep">PDF·사진·HWPX<span className="max-md:hidden"> · 여기로 끌어다 놓아도 돼요</span></span>
              </button>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onKey} maxLength={300} aria-label="활동 설명" style={NO_RING}
              placeholder="무엇을 했는지 짧게 (선택)" className="h-10 w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-mute" />
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-3.5 py-3">
            {file && (
              <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-chip border border-line bg-[#fff] px-2 py-0.5 text-[12px]">
                <Paperclip size={12} className="shrink-0 text-mute" />
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 font-bold text-ok">읽음</span>
                <button type="button" aria-label="자료 빼기" onClick={() => { setFile(null); setSummary(null); }} className="shrink-0 text-mute"><X size={12} /></button>
              </span>
            )}
            <div className="flex flex-col gap-1 rounded-field bg-bg px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold">활동 요약</span>
                <Tag tone={summary.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{summary.label}</Tag>
                <span className="ml-auto text-[12px] tabular-nums text-sub">{sumBytes.toLocaleString()}B</span>
              </div>
              <textarea value={summary.text} onChange={(e) => setSummary({ ...summary, text: e.target.value })} onKeyDown={onKey} rows={3} maxLength={PIECE_MAX - 50} aria-label="활동 요약" style={NO_RING}
                className="w-full resize-y bg-transparent text-[14px] leading-[22px] outline-none" />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-soft bg-[#FCFCFD] py-2 pl-3 pr-3 md:flex-row md:items-center md:gap-2.5 md:pl-3.5 md:pr-2">
          <div className="min-w-0 md:flex-1">{status}</div>
          {memoMode ? (
            <Button type="button" size="sm" disabled={busy || !memoReady} onClick={() => save(text, "memo")} className={cx(MAIN, OFF)}>
              <Plus size={14} /> {busy ? "남기는 중…" : "메모 남기기"}
            </Button>
          ) : summary ? (
            <div className="flex gap-1.5">
              <Button type="button" kind="ghost" size="sm" onClick={() => setSummary(null)} className="h-11 md:h-9"><RotateCcw size={14} /> 다시</Button>
              <Button type="button" size="sm" disabled={busy || !sumReady} onClick={() => save(summary.text, "file")} className={cx("h-11 flex-1 md:h-9 md:flex-none", OFF)}>
                <Plus size={14} /> {busy ? "남기는 중…" : "메모로 남기기"}
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" disabled={busy || !fileReady} onClick={run} className={cx(MAIN, OFF)}>
              <Sparkles size={14} /> {busy ? "읽는 중…" : "요약 만들기"}
            </Button>
          )}
        </div>
      </div>

      {memoMode && (
        <>
          <SoftenNotice hits={blunt} busy={busy} onRun={soften ? runSoften : undefined} />
          {softShown?.r.ok && (
            <SoftenResult memo={softShown.memo} soft={softShown.r.text} hits={blunt} label={softShown.r.label} busy={busy} insertLabel="메모로 넣기"
              onRedo={runSoften} onKeep={() => setSoft(null)} onInsert={() => { if (softShown.r.ok) { const t = softShown.r.text; setSoft(null); save(t, "memo"); } }} />
          )}
          {softShown && !softShown.r.ok && <p className="text-[13px] text-bad" role="alert">{softShown.r.error}</p>}
        </>
      )}
    </div>
  );
}
