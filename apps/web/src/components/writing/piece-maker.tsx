"use client";
import { useRef, useState, useTransition } from "react";
import { Copy, FileUp, Paperclip, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "./evidence-files";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { ACTIVITY_MAX, cleanActivity, withActivity } from "@/lib/domain/activity-name";
import type { AiDraftResult } from "@/lib/domain/writing";
import type { EvidenceResult } from "@/lib/server/ai/read-evidence";

// 자료로 조각 만들기 (Figma N22 325:435): 활동 자료 + 간단한 설명 → 활동 요약(조각 후보) + 고른 분량의 생기부 초안.
// 둘 다 교사가 확인한 뒤에만 남기거나 본문에 넣는다.

export type PieceMakerApi = {
  summarize: (fd: FormData) => Promise<EvidenceResult>;
  draft: (input: { note: string; summary: string; unit: LengthUnit; max: number; activity: string }) => Promise<AiDraftResult>;
  unit: LengthUnit;
  neisMax: number;
  onApply: (text: string) => void;
};

type Result = { summary: string; label: "AI" | "자동"; draft: Extract<AiDraftResult, { ok: true }> | null; draftError?: string; target: number };

export function PieceMaker({ api, save }: { api: PieceMakerApi; save: (text: string, activity: string) => Promise<{ error?: string }> }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [activity, setActivity] = useState("");
  const [note, setNote] = useState("");
  // 초안 분량 (N27): 선생님이 바이트를 바로 적는다. 최대를 넘으면 최대로
  const [max, setMax] = useState(api.neisMax);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const u = api.unit === "bytes" ? "B" : UNIT_LABEL[api.unit];
  const target = Math.min(api.neisMax, Math.max(1, max || api.neisMax));

  const run = () => start(async () => {
    setError("");
    setSaved(false);
    setCopied(false);
    try {
      let summary = note.trim();
      let label: "AI" | "자동" = "자동";
      if (file) {
        const texts: string[] = [];
        for (const part of await prepareUpload(file)) {
          const fd = new FormData();
          fd.set("file", part);
          const r = await api.summarize(fd);
          if (!r.ok) return setError(r.error);
          texts.push(r.text);
          label = r.label;
        }
        summary = texts.join(" ").slice(0, 1000);
      }
      const d = await api.draft({ note: note.trim(), summary: file ? summary : "", unit: api.unit, max: target, activity });
      setRes({ summary: withActivity(activity, summary), label, draft: d.ok ? d : null, draftError: d.ok ? undefined : d.error, target });
    } catch {
      setError("만들지 못했어요. 다시 해 주세요");
    }
  });

  const keep = () => start(async () => {
    if (!res) return;
    const r = await save(res.summary, activity);
    if (r.error) setError(r.error);
    else setSaved(true);
  });

  const copy = async () => {
    if (!res?.draft) return;
    try { await navigator.clipboard.writeText(res.draft.text); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <div className="flex flex-col gap-3 rounded-inner bg-[#F5F6F8] p-3.5">
      <div className="flex items-center gap-2">
        <Tag tone="bg-new-soft text-new">AI</Tag>
        <span className="text-[14px] font-bold">자료로 조각 만들기</span>
      </div>

      {!res ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">활동명</span>
          <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={ACTIVITY_MAX} placeholder="예: 빗면 실험 탐구"
            className="h-10 rounded-field bg-[#fff] px-3 text-[14px] outline-none focus:ring-2 focus:ring-key" />
          <span className="text-[12px] text-mute">활동명은 기록 맨 앞에 붙어요</span>
        </label>
      ) : (
        <span className="inline-flex items-center gap-1.5 self-start rounded-chip bg-[#fff] px-2.5 py-1">
          <span className="text-[12px] text-mute">활동명</span><span className="text-[13px] font-medium">{cleanActivity(activity)}</span>
        </span>
      )}
      {!res && (
        <button type="button" onClick={() => input.current?.click()}
          className={cx("flex items-center gap-3 rounded-inner border-2 border-dashed bg-[#fff] px-3.5 py-3 text-left", file ? "border-key" : "border-[#D9DDE3]")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-key-soft text-key"><FileUp size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">활동 자료 올리기</span>
            <span className="block text-[12px] text-mute">보고서·활동지·사진·PDF·HWPX</span>
          </span>
        </button>
      )}
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="활동 자료"
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); e.target.value = ""; }} />
      {file && (
        <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-chip border border-line bg-[#fff] px-2 py-1 text-[12px]">
          <Paperclip size={12} className="shrink-0 text-mute" />
          <span className="min-w-0 truncate">{file.name}</span>
          {res && <span className="shrink-0 font-bold text-ok">읽음</span>}
          <button type="button" aria-label="자료 빼기" onClick={() => { setFile(null); setRes(null); }} className="shrink-0 text-mute"><X size={12} /></button>
        </span>
      )}

      {!res && (
        <>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} aria-label="활동 설명"
            placeholder="무엇을 했는지 간단히 (예: 오차 원인 분석, 다시 측정)"
            className="w-full resize-y rounded-field bg-[#fff] p-3 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-key" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
            <div className="flex items-center justify-between md:contents">
              <span className="text-[13px] font-medium text-sub">초안 분량</span>
              <span className="text-[12px] text-mute md:order-3">최대 {api.neisMax.toLocaleString()}{u}</span>
            </div>
            <label className="flex h-10 items-center rounded-field bg-[#fff] px-2.5 focus-within:ring-2 focus-within:ring-key md:order-2 md:h-8 md:w-24">
              <input inputMode="numeric" value={max ? max.toLocaleString() : ""} aria-label="초안 분량"
                onChange={(e) => setMax(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                className="w-full min-w-0 bg-transparent text-right text-[14px] font-medium tabular-nums outline-none" />
              <span className="ml-1 shrink-0 text-[13px] text-mute">{u}</span>
            </label>
            <Button type="button" size="sm" disabled={busy || !activity.trim() || (!file && !note.trim())} onClick={run} className="max-md:h-10 max-md:w-full md:order-4 md:ml-auto">
              <Sparkles size={14} /> {busy ? "만드는 중…" : "요약·초안 만들기"}
            </Button>
          </div>
        </>
      )}

      {res && (
        <>
          <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">활동 요약</span>
              <Tag tone={res.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{res.label}</Tag>
            </div>
            <p className="text-[14px] leading-6">{res.summary}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" kind="ghost" size="sm" onClick={() => { setRes(null); setSaved(false); }}><RotateCcw size={14} /> 다시</Button>
              <Button type="button" kind="soft" size="sm" disabled={busy || saved} onClick={keep}>
                <Plus size={14} /> {saved ? "남겼어요" : "조각으로 남기기"}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">생기부 초안</span>
              {res.draft && <Tag tone={res.draft.sample ? "bg-key-soft text-key-strong" : "bg-new-soft text-new"}>{res.draft.sample ? "자동" : "AI"}</Tag>}
              {res.draft && (
                <span className="ml-auto text-[12px] tabular-nums text-sub">
                  <b className="text-ink">{measure(res.draft.text, api.unit).toLocaleString()}</b> / {res.target.toLocaleString()}{u}
                </span>
              )}
            </div>
            {res.draft ? (
              <>
                <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-key" style={{ width: `${Math.min(100, (measure(res.draft.text, api.unit) / res.target) * 100)}%` }} />
                </div>
                <p className="text-[14px] leading-7">{res.draft.text}</p>
                {res.draft.notice && <p className="text-[12px] text-mute">{res.draft.notice}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" kind="outline" size="sm" onClick={copy}><Copy size={14} /> {copied ? "복사했어요" : "복사"}</Button>
                  <Button type="button" size="sm" onClick={() => api.onApply(res.draft!.text)}>본문에 넣기</Button>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-bad" role="alert">{res.draftError}</p>
            )}
          </div>
        </>
      )}
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
