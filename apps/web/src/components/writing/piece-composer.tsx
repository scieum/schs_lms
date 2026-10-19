"use client";
import { useMemo, useRef, useState, useTransition, type RefObject } from "react";
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

// 조각 추가 (Figma N32 400:475): 하나뿐인 입력 블록. [메모 | 자료] 세그먼트 · 활동명 칸 하나(②와 같은 값).
// 메모 = 활동명 + 지금 본 것 → "조각 남기기". 자료 = 활동명 + 자료 + 짧은 설명 → AI 활동 요약(고쳐 쓸 수 있음) → "조각으로 남기기".
// 생기부 초안은 여기서 만들지 않는다 — ② 본문 만들기에서만.

export type ComposerProps = {
  activity: string;
  setActivity: (v: string) => void;
  activityRef?: RefObject<HTMLInputElement | null>;
  /** 남기기: 서버가 "[활동명] …"으로 붙여 저장한다 */
  add: (text: string, activity: string, kind: PieceKind) => Promise<{ error?: string }>;
  /** 자료 읽기 → 활동 요약 (없으면 자료 모드를 숨긴다) */
  summarize?: (fd: FormData) => Promise<EvidenceResult>;
  placeholder: string;
  onAdded: () => void;
  /** 순화하기 (Figma N34 ③): 메모에 퉁명스러운 말이 있으면 알림 줄 → 순화한 글 → 조각으로 넣기. 없으면(AI 꺼짐) 버튼 숨김 */
  soften?: (text: string) => Promise<{ ok: true; text: string; label: "AI" } | { ok: false; error: string }>;
  /** 메모 칸 밑줄·알림 줄을 보일지 (기록 쓰기 화면) */
  bluntCheck?: boolean;
};

type Summary = { text: string; label: "AI" | "자동" };
const FIELD = "w-full min-w-0 rounded-field bg-[#fff] px-3 text-[14px] outline-none placeholder:text-mute focus:ring-2 focus:ring-key";

export function PieceComposer({ activity, setActivity, activityRef, add, summarize, placeholder, onAdded, soften, bluntCheck = !!soften }: ComposerProps) {
  const [mode, setMode] = useState<"memo" | "file">("memo");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const hasActivity = !!cleanActivity(activity);
  const blunt = useMemo(() => (bluntCheck ? bluntWords(text) : []), [bluntCheck, text]);
  const [soft, setSoft] = useState<{ memo: string; r: { ok: true; text: string; label: "AI" } | { ok: false; error: string } } | null>(null);
  const runSoften = () => soften && start(async () => {
    const memo = text;
    try { setSoft({ memo, r: await soften(memo) }); } catch { setSoft({ memo, r: { ok: false, error: "순화하지 못했어요. 직접 고쳐 주세요" } }); }
  });
  const softShown = mode === "memo" && soft && soft.memo === text ? soft : null;

  const save = (body: string, kind: PieceKind) => start(async () => {
    setMsg(null);
    const r = await add(body, activity, kind).catch(() => ({ error: "남기지 못했어요" }));
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "조각을 남겼어요" });
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

  const segment = summarize && (
    <div role="tablist" aria-label="조각 종류" className="flex shrink-0 rounded-full bg-[#fff] p-[3px]">
      {([["memo", "메모"], ["file", "자료"]] as const).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setMsg(null); }}
          className={cx("h-7 whitespace-nowrap rounded-full px-3.5 text-[13px] md:h-[30px]", mode === k ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>{l}</button>
      ))}
    </div>
  );

  const activityField = (
    <input ref={activityRef} value={activity} onChange={(e) => { setActivity(e.target.value); setMsg(null); }} maxLength={ACTIVITY_MAX} aria-label="활동명"
      placeholder="활동명 (예: 빗면 실험 탐구)" className={cx(FIELD, "h-11 md:h-10 md:w-[220px] md:shrink-0")} />
  );

  const memoReady = hasActivity && text.trim().length >= PIECE_MIN;
  const fileReady = hasActivity && !!file;
  const sumBytes = summary ? neisBytes(withActivity(activity, summary.text)) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-inner bg-bg p-3.5 md:p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[14px] font-bold">조각 추가</span>
        {segment}
      </div>

      {mode === "memo" || !summarize ? (
        <div className="flex flex-col gap-2 md:flex-row">
          {activityField}
          <HighlightTextarea value={text} onChange={(v) => { setText(v); setMsg(null); }} maxLength={PIECE_MAX} aria-label="새 조각"
            placeholder={placeholder} marks={blunt.map((h) => ({ start: h.start, end: h.end, tone: "warn" as const }))}
            boxClassName="min-w-0 flex-1 rounded-field bg-[#fff] focus-within:ring-2 focus-within:ring-key"
            textClassName="min-h-[72px] px-3 py-2.5 text-[14px] leading-6 md:min-h-10 md:py-2" />
        </div>
      ) : !summary ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 md:flex-row">
            {activityField}
            <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="활동 자료" tabIndex={-1}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); e.target.value = ""; }} />
            {file ? (
              <span className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-field border border-line bg-[#fff] px-3 text-[13px] md:h-10">
                <Paperclip size={14} className="shrink-0 text-mute" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => input.current?.click()} className="shrink-0 text-[12px] font-medium text-key-strong">바꾸기</button>
                <button type="button" aria-label="자료 빼기" onClick={() => setFile(null)} className="shrink-0 text-mute"><X size={14} /></button>
              </span>
            ) : (
              <button type="button" onClick={() => input.current?.click()}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-field border border-dashed border-faint bg-[#fff] px-3 md:h-10">
                <FileUp size={16} className="shrink-0 text-key" />
                <span className="whitespace-nowrap text-[14px] font-medium text-key-strong">활동 자료 올리기</span>
                <span className="whitespace-nowrap text-[12px] text-mute">PDF·사진·HWPX</span>
              </button>
            )}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label="활동 설명"
            placeholder="무엇을 했는지 짧게 (선택)" className={cx(FIELD, "h-11 md:h-10")} />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-chip bg-[#fff] px-2.5 py-1">
              <span className="shrink-0 text-[12px] text-mute">활동명</span>
              <span className="min-w-0 truncate text-[13px] font-medium">{cleanActivity(activity)}</span>
            </span>
            {file && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-line bg-[#fff] px-2 py-1 text-[12px]">
                <Paperclip size={12} className="shrink-0 text-mute" />
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 font-bold text-ok">읽음</span>
                <button type="button" aria-label="자료 빼기" onClick={() => { setFile(null); setSummary(null); }} className="shrink-0 text-mute"><X size={12} /></button>
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 rounded-inner bg-[#fff] p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">활동 요약</span>
              <Tag tone={summary.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{summary.label}</Tag>
              <span className="ml-auto text-[12px] tabular-nums text-sub">{sumBytes.toLocaleString()}B</span>
            </div>
            <textarea value={summary.text} onChange={(e) => setSummary({ ...summary, text: e.target.value })} rows={3} maxLength={PIECE_MAX - 50} aria-label="활동 요약"
              className="w-full resize-y bg-transparent text-[14px] leading-[22px] outline-none" />
          </div>
        </div>
      )}

      {(mode === "memo" || !summarize) && (
        <>
          <SoftenNotice hits={blunt} busy={busy} onRun={soften ? runSoften : undefined} />
          {softShown?.r.ok && (
            <SoftenResult memo={softShown.memo} soft={softShown.r.text} hits={blunt} label={softShown.r.label} busy={busy}
              onRedo={runSoften} onKeep={() => setSoft(null)} onInsert={() => { if (softShown.r.ok) { const t = softShown.r.text; setSoft(null); save(t, "memo"); } }} />
          )}
          {softShown && !softShown.r.ok && <p className="text-[13px] text-bad" role="alert">{softShown.r.error}</p>}
        </>
      )}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {msg ? (
          <p className={cx("min-w-0 flex-1 text-[12px]", msg.ok ? "text-ok" : "text-bad")} role={msg.ok ? "status" : "alert"}>{msg.text}</p>
        ) : (
          <span className="min-w-0 flex-1 text-[12px] text-mute">
            {mode === "memo" || !summarize ? "활동명은 기록 맨 앞에 붙어요" : summary ? "고쳐 쓴 뒤 남겨도 돼요" : "AI가 자료를 읽고 활동 요약을 만들어요"}
          </span>
        )}
        {mode === "memo" || !summarize ? (
          <Button type="button" kind="soft" size="sm" disabled={busy || !memoReady || !!softShown?.r.ok} onClick={() => save(text, "memo")} className="h-11 disabled:opacity-40 max-md:w-full md:h-9">
            <Plus size={14} /> {busy ? "남기는 중…" : "조각 남기기"}
          </Button>
        ) : summary ? (
          <div className="flex gap-2">
            <Button type="button" kind="ghost" size="sm" onClick={() => setSummary(null)} className="h-11 md:h-9"><RotateCcw size={14} /> 다시</Button>
            <Button type="button" kind="soft" size="sm" disabled={busy || !hasActivity || summary.text.trim().length < PIECE_MIN} onClick={() => save(summary.text, "file")}
              className="h-11 flex-1 disabled:opacity-40 md:h-9 md:flex-none">
              <Plus size={14} /> {busy ? "남기는 중…" : "조각으로 남기기"}
            </Button>
          </div>
        ) : (
          <Button type="button" kind="soft" size="sm" disabled={busy || !fileReady} onClick={run} className="h-11 disabled:opacity-40 max-md:w-full md:h-9">
            <Sparkles size={14} /> {busy ? "읽는 중…" : "요약해서 남기기"}
          </Button>
        )}
      </div>
    </div>
  );
}
