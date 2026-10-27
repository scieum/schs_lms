"use client";
import { useState } from "react";
import { FileText, Mic, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";
import { ACCEPT } from "@/components/writing/evidence-files";
import { SpeechRecorder } from "@/components/writing/speech-recorder";
import { clock } from "@/lib/client/speech";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { fixAssessVoice, readAnswerPart } from "./actions";

// 답안 · 자료 여러 개 (Figma N81 a · c 채점 창, d 한 명씩 올리기): 발표 + 보고서처럼 나뉜 평가는 파일과 발표 녹음을 하나씩 더한다.
// 녹음은 이 기기에서 받아쓰고(N73 받아쓰기 그대로) 받아쓴 글만 넘긴다. 파일 · 녹음은 저장하지 않는다.

export type AnswerPart = { id: number; kind: "file"; file: File } | { id: number; kind: "voice"; text: string; sec: number };

const VOICE_MAX = 12000;
let seq = 0;

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

/** 몇 번째 녹음인지 (이름 "발표 녹음 n") */
const voiceNo = (parts: AnswerPart[], id: number) => parts.filter((p) => p.kind === "voice").findIndex((p) => p.id === id) + 1;

export function AnswerParts({ assessmentId, parts, setParts, aiOn, head, disabled }: {
  assessmentId: string; parts: AnswerPart[]; setParts: (f: (p: AnswerPart[]) => AnswerPart[]) => void; aiOn: boolean; head: string; disabled?: boolean;
}) {
  const [rec, setRec] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const addFiles = (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (list.length) setParts((p) => [...p, ...list.map((file): AnswerPart => ({ id: ++seq, kind: "file", file }))]);
  };
  const remove = (id: number) => setParts((p) => p.filter((x) => x.id !== id));
  const edit = (id: number, text: string) => setParts((p) => p.map((x) => (x.id === id && x.kind === "voice" ? { ...x, text } : x)));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold">{head}</span>
        <span className="ml-auto text-[12px] text-mute">발표 + 자료면 하나씩 더해요</span>
      </div>
      {parts.map((p) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-control border border-line bg-[#fff] px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-control", p.kind === "voice" ? "bg-key-soft text-key" : "bg-soft text-sub")}>
              {p.kind === "voice" ? <Mic size={15} /> : <FileText size={15} />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13px] font-bold">{p.kind === "voice" ? `발표 녹음 ${voiceNo(parts, p.id)}` : p.file.name}</span>
                <span className={cx("shrink-0 rounded-[6px] px-1.5 py-px text-[11px] font-bold", p.kind === "voice" ? "bg-key-soft text-key-strong" : "bg-soft text-sub")}>{p.kind === "voice" ? "발표" : "자료"}</span>
              </span>
              <span className="truncate text-[12px] text-mute">
                {p.kind === "voice" ? (
                  <>{clock(p.sec)} · 받아쓴 글 {p.text.length.toLocaleString()}자 · <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="font-bold text-key-strong">{open === p.id ? "접기" : "펼쳐 고치기"}</button></>
                ) : size(p.file.size)}
              </span>
            </span>
            <button type="button" onClick={() => remove(p.id)} disabled={disabled} aria-label={`${p.kind === "voice" ? `발표 녹음 ${voiceNo(parts, p.id)}` : p.file.name} 빼기`} className="shrink-0 p-1 text-mute hover:text-bad disabled:opacity-40"><X size={15} /></button>
          </div>
          {p.kind === "voice" && open === p.id && (
            <textarea value={p.text} onChange={(e) => edit(p.id, e.target.value)} rows={5} maxLength={VOICE_MAX} aria-label={`발표 녹음 ${voiceNo(parts, p.id)} 받아쓴 글`}
              className="resize-y rounded-control border border-line px-3 py-2 text-[13px] leading-5 text-[#333d4b] outline-none focus:border-key" />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <label className={cx("flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] text-[13px] font-bold hover:bg-soft md:h-9", disabled && "pointer-events-none opacity-50")}>
          <Plus size={14} aria-hidden /> 파일 더하기
          <input type="file" multiple accept={ACCEPT} className="sr-only" disabled={disabled} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <button type="button" onClick={() => setRec((r) => !r)} disabled={disabled} aria-expanded={rec}
          className={cx("flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border text-[13px] font-bold disabled:opacity-50 md:h-9", rec ? "border-key bg-key-soft text-key-strong" : "border-hair bg-[#fff] hover:bg-soft")}>
          <span aria-hidden className="size-2 rounded-full bg-bad" /> {rec ? "녹음 닫기" : "녹음"}
        </button>
      </div>
      {rec && (
        <SpeechRecorder aiOn={aiOn} autoStart max={VOICE_MAX} useLabel="답안에 더하기"
          fix={(text) => fixAssessVoice({ assessmentId, text })}
          onUse={(text, _from, sec) => { setParts((p) => [...p, { id: ++seq, kind: "voice", text, sec }]); setRec(false); }} />
      )}
    </div>
  );
}

/** 여러 조각 → AI에 보낼 답안 글 하나. 파일은 쪽 묶음마다 서버에서 글로 옮긴다(저장 안 함) */
export async function partsText(assessmentId: string, studentId: string, parts: AnswerPart[], report?: (s: string) => void): Promise<{ text: string } | { error: string }> {
  const out: string[] = [];
  let fileNo = 0;
  for (const [k, p] of parts.entries()) {
    if (p.kind === "voice") { out.push(`[발표 녹음 ${voiceNo(parts, p.id)} · ${clock(p.sec)} · 받아쓴 글]\n${p.text.trim()}`); continue; }
    report?.(`${k + 1} / ${parts.length} 옮기는 중`);
    const texts: string[] = [];
    for (const part of await prepareUpload(p.file).catch(() => [p.file])) {
      const fd = new FormData(); fd.set("assessmentId", assessmentId); fd.set("studentId", studentId); fd.set("file", part);
      const r = await readAnswerPart(fd).catch(() => ({ ok: false as const, error: "파일을 읽지 못했어요" }));
      if (!r.ok) return { error: `${p.file.name}: ${r.error}` };
      texts.push(r.text);
    }
    out.push(`[자료 ${++fileNo} · ${p.file.name}]\n${texts.join("\n")}`);
  }
  return { text: out.join("\n\n") };
}
