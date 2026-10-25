"use client";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, Mic, Square, Trash2 } from "lucide-react";
import { MAX_RECORD_SEC, clock, startRecording, type Recording } from "@/lib/client/speech";
import { addTake, editTake, getServerTakes, getTakes, markUsed, removeTake, subscribeTakes, type Take } from "@/lib/client/speech-queue";

// 발표 녹음 칸 (Figma N73 711:2000): 녹음 전 → 녹음 중(시간 · 소리 막대 · 멈추고 받아쓰기) → 바로 다음 녹음을 할 수 있고,
// 멈춘 녹음은 아래 "녹음 n" 줄에서 차례로 받아쓴다(처음엔 모델 받기 %) → 받아쓴 글(고칠 수 있음) → [AI 요약해 넣기] 또는 [그대로 넣기]가
// 메모 칸을 채운다. 남기기는 조각 모으기 버튼 그대로. 녹음은 이 기기 메모리에만 두고 받아쓴 뒤 버린다(lib/client/speech-queue.ts).

type Summary = { ok: true; text: string; label: "AI" | "자동" } | { ok: false; error: string };

/** 메모 칸 한도 (조각 모으기 메모 칸과 같음) */
const MEMO_MAX = 1000;
const BARS = 26;

export function SpeechRecorder({ aiOn, summarize, onUse }: {
  aiOn: boolean;
  /** 받아쓴 글 → 활동 요약 (서버, 이름 · 학번 가림) */
  summarize: (text: string) => Promise<Summary>;
  /** 메모 칸에 넣기 */
  onUse: (text: string, from: "ai" | "raw") => void;
}) {
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [now, setNow] = useState(0);
  const rec = useRef<Recording | null>(null);
  const takes = useSyncExternalStore(subscribeTakes, getTakes, getServerTakes);

  // 녹음 중: 시간 · 소리 막대 · 10분이면 멈춤
  useEffect(() => {
    if (since === null) return;
    let t = 0;
    const tick = () => {
      const r = rec.current;
      if (r) setLevels((l) => [...l.slice(1), Math.max(0.08, r.level())]);
      const sec = (Date.now() - since) / 1000;
      setNow(sec);
      if (sec >= MAX_RECORD_SEC) void finish();
      else t = window.setTimeout(tick, 120);
    };
    tick();
    return () => window.clearTimeout(t);
    // finish 는 since 로만 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);
  useEffect(() => () => rec.current?.cancel(), []);

  const begin = async () => {
    setError("");
    try {
      rec.current = await startRecording();
      setNow(0);
      setSince(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "녹음을 시작하지 못했어요");
    }
  };
  const cancel = () => { rec.current?.cancel(); rec.current = null; setSince(null); };
  async function finish() {
    const r = rec.current;
    if (!r || since === null) return;
    rec.current = null;
    const sec = Math.round((Date.now() - since) / 1000);
    setSince(null);
    try { addTake(await r.stop(), sec); } catch { setError("녹음을 마치지 못했어요. 다시 녹음해 주세요"); }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {since === null ? (
        <div className="flex flex-col items-center gap-2 rounded-control border border-dashed border-faint bg-[#fff] px-4 py-5 text-center">
          <button type="button" onClick={begin} aria-label="녹음 시작" className="flex size-16 items-center justify-center rounded-full bg-key text-white hover:bg-key-strong">
            <Mic size={28} />
          </button>
          <span className="text-[14px] font-bold">{takes.length ? "눌러서 다음 녹음" : "눌러서 녹음 시작"}</span>
          <span className="text-[12px] text-mute break-keep">
            {takes.some((t) => t.status === "run" || t.status === "wait") ? "받아쓰는 동안 다음 발표를 바로 녹음해도 돼요" : "녹음 파일은 남기지 않아요 · 받아쓰기는 이 기기에서 해요"}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-control border border-hair bg-[#fff] px-4 py-4" role="status" aria-live="polite">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-bad" />
            <span className="text-[14px] font-bold text-bad">녹음 중</span>
            <span className="text-[22px] font-bold tabular-nums">{clock(now)}</span>
          </span>
          <span aria-hidden className="flex h-9 items-center gap-[3px]">
            {levels.map((l, i) => <span key={i} className="w-1 rounded-full bg-key" style={{ height: `${Math.round(6 + l * 30)}px` }} />)}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => void finish()} className="inline-flex h-10 items-center gap-2 rounded-control bg-ink px-4 text-[14px] font-bold text-white">
              <Square size={12} fill="currentColor" /> 멈추고 받아쓰기
            </button>
            <button type="button" onClick={cancel} className="h-10 rounded-control border border-hair bg-[#fff] px-3.5 text-[13px] font-bold">취소</button>
          </div>
          <span className="text-[12px] text-mute">말하는 학생 가까이에 두면 더 정확해요 · {MAX_RECORD_SEC / 60}분까지</span>
        </div>
      )}

      {takes.map((t) => <TakeCard key={t.id} t={t} aiOn={aiOn} summarize={summarize} onUse={onUse} />)}
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}

function TakeCard({ t, aiOn, summarize, onUse }: { t: Take; aiOn: boolean; summarize: (text: string) => Promise<Summary>; onUse: (text: string, from: "ai" | "raw") => void }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const head = (
    <span className="flex items-center gap-1.5 text-[13px] font-bold">
      {t.label}
      <span className="text-[12px] font-medium text-mute">{t.at} · {clock(t.sec)}{t.status === "done" ? ` · ${t.text.length.toLocaleString()}자` : ""}</span>
      {t.used && <span className="inline-flex items-center gap-0.5 rounded-[6px] bg-ok-soft px-1.5 py-px text-[11px] font-bold text-ok"><Check size={11} /> 넣음</span>}
      <button type="button" onClick={() => { if (t.status !== "done" || t.used || window.confirm(`${t.label}의 받아쓴 글을 지울까요?`)) removeTake(t.id); }}
        aria-label={`${t.label} 지우기`} className="ml-auto p-1 text-mute hover:text-bad"><Trash2 size={14} /></button>
    </span>
  );
  if (t.status === "wait" || t.status === "run") {
    const pct = t.status === "run" ? Math.round(t.ratio * 100) : 0;
    return (
      <div className="flex flex-col gap-2 rounded-control border border-hair bg-[#fff] px-3.5 py-3" role="status" aria-live="polite">
        {head}
        <span className="flex items-center text-[13px] text-sub">
          {t.status === "wait" ? "차례를 기다려요" : t.stage === "load" ? "받아쓰기 모델 받는 중" : "받아쓰는 중"}
          {t.status === "run" && <span className="ml-auto font-bold tabular-nums text-key-strong">{pct}%</span>}
        </span>
        <span className="h-2 overflow-hidden rounded-full bg-soft">
          <span className="block h-full rounded-full bg-key transition-[width]" style={{ width: `${Math.max(3, pct)}%` }} />
        </span>
        {t.stage === "load" && t.status === "run" && <span className="text-[12px] text-mute">처음 한 번은 받아쓰기 모델(약 80MB)을 받아요 · 소리는 밖으로 나가지 않아요</span>}
      </div>
    );
  }
  if (t.status === "error") {
    return (
      <div className="flex flex-col gap-1.5 rounded-control border border-hair bg-[#fff] px-3.5 py-3">
        {head}
        <p className="text-[13px] text-bad" role="alert">{t.error}</p>
      </div>
    );
  }
  const useAi = () => start(async () => {
    setError("");
    const r = await summarize(t.text).catch((): Summary => ({ ok: false, error: "요약하지 못했어요. 다시 해 주세요" }));
    if (!r.ok) return setError(r.error);
    onUse(r.text, "ai");
    markUsed(t.id);
  });
  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-hair bg-[#fff] px-3.5 py-3">
      {head}
      <textarea value={t.text} onChange={(e) => editTake(t.id, e.target.value)} rows={4} aria-label={`${t.label} 받아쓴 글`}
        className="resize-y rounded-control border border-line bg-[#fff] px-3 py-2 text-[13px] leading-5 text-[#333d4b] outline-none focus:border-key" />
      {t.text.length > MEMO_MAX && <p className="text-[12px] text-[#9a6400]">메모 칸은 {MEMO_MAX.toLocaleString()}자까지예요 · 긴 발표는 AI 요약을 권해요</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => { onUse(t.text.slice(0, MEMO_MAX), "raw"); markUsed(t.id); }} className="h-9 rounded-control px-3 text-[13px] font-medium text-sub hover:text-ink">
          {t.text.length > MEMO_MAX ? `앞 ${MEMO_MAX.toLocaleString()}자 넣기` : "그대로 넣기"}
        </button>
        <button type="button" onClick={useAi} disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">
          <span className="rounded-[6px] bg-new-soft px-1.5 py-px text-[11px] font-bold text-new">{aiOn ? "AI" : "자동"}</span>{busy ? "요약하는 중…" : "요약해 메모 칸에 넣기"}
        </button>
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
