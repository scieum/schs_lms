"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Mic, RotateCcw, Square } from "lucide-react";
import { cx } from "@/components/ui";
import { MAX_RECORD_SEC, clock, decode16k, startRecording, transcribe, type Recording } from "@/lib/client/speech";
import { cleanTranscript } from "@/lib/domain/transcript";

// 발표 녹음 칸 (Figma N73 711:2000): 녹음 전 → 녹음 중(시간 · 소리 막대 · 멈추고 받아쓰기) → 받아쓰는 중(처음엔 모델 받기 %)
// → 받아쓴 글(고칠 수 있음) → [AI 요약해 넣기] 또는 [그대로 넣기]가 아래 메모 칸을 채운다. 남기기는 조각 모으기 버튼 그대로.
// 녹음은 이 기기 메모리에만 두고 받아쓴 뒤 버린다.

type Summary = { ok: true; text: string; label: "AI" | "자동" } | { ok: false; error: string };
type State = { s: "idle" } | { s: "rec"; since: number } | { s: "run"; sec: number; load: number | null } | { s: "done"; sec: number; text: string };

const BARS = 26;

export function SpeechRecorder({ aiOn, summarize, onUse }: {
  aiOn: boolean;
  /** 받아쓴 글 → 활동 요약 (서버, 이름 · 학번 가림) */
  summarize: (text: string) => Promise<Summary>;
  /** 메모 칸에 넣기 */
  onUse: (text: string, from: "ai" | "raw") => void;
}) {
  const [st, setSt] = useState<State>({ s: "idle" });
  const [error, setError] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [now, setNow] = useState(0);
  const rec = useRef<Recording | null>(null);
  const [busy, start] = useTransition();

  // 녹음 중: 시간 · 소리 막대 · 10분이면 멈춤
  useEffect(() => {
    if (st.s !== "rec") return;
    let raf = 0;
    const tick = () => {
      const r = rec.current;
      if (r) setLevels((l) => [...l.slice(1), Math.max(0.08, r.level())]);
      const sec = (Date.now() - st.since) / 1000;
      setNow(sec);
      if (sec >= MAX_RECORD_SEC) void finish();
      else raf = window.setTimeout(tick, 120) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
    // finish 는 st 로만 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
  useEffect(() => () => rec.current?.cancel(), []);

  const begin = async () => {
    setError("");
    try {
      rec.current = await startRecording();
      setSt({ s: "rec", since: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "녹음을 시작하지 못했어요");
    }
  };
  const cancel = () => { rec.current?.cancel(); rec.current = null; setSt({ s: "idle" }); };
  async function finish() {
    const r = rec.current;
    if (!r || st.s !== "rec") return;
    rec.current = null;
    const sec = Math.round((Date.now() - st.since) / 1000);
    setSt({ s: "run", sec, load: null });
    try {
      const audio = await decode16k(await r.stop());
      const text = cleanTranscript(await transcribe(audio, (p) => setSt((x) => (x.s === "run" ? { ...x, load: p.stage === "load" ? p.ratio : null } : x))));
      if (!text.trim()) { setSt({ s: "idle" }); setError("말소리를 찾지 못했어요. 마이크 가까이에서 다시 녹음해 주세요"); return; }
      setSt({ s: "done", sec, text });
    } catch (e) {
      setSt({ s: "idle" });
      setError(e instanceof Error ? e.message : "받아쓰지 못했어요");
    }
  }
  const useAi = () => st.s === "done" && start(async () => {
    setError("");
    const r = await summarize(st.text).catch((): Summary => ({ ok: false, error: "요약하지 못했어요. 다시 해 주세요" }));
    if (!r.ok) return setError(r.error);
    onUse(r.text, "ai");
  });

  return (
    <div className="flex flex-col gap-2.5">
      {st.s === "idle" && (
        <div className="flex flex-col items-center gap-2 rounded-control border border-dashed border-faint bg-[#fff] px-4 py-5 text-center">
          <button type="button" onClick={begin} aria-label="녹음 시작" className="flex size-16 items-center justify-center rounded-full bg-key text-white hover:bg-key-strong">
            <Mic size={28} />
          </button>
          <span className="text-[14px] font-bold">눌러서 녹음 시작</span>
          <span className="text-[12px] text-mute">녹음 파일은 남기지 않아요 · 받아쓰기는 이 기기에서 해요</span>
        </div>
      )}

      {st.s === "rec" && (
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

      {st.s === "run" && (
        <div className="flex flex-col gap-2 rounded-control border border-hair bg-[#fff] px-3.5 py-3.5" role="status" aria-live="polite">
          <span className="flex items-center text-[14px] font-bold">
            {st.load !== null ? "받아쓰기 모델 받는 중" : "받아쓰는 중"} · {clock(st.sec)} 녹음
            {st.load !== null && <span className="ml-auto tabular-nums text-key-strong">{Math.round(st.load * 100)}%</span>}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-soft">
            <span className={cx("block h-full rounded-full bg-key", st.load === null && "w-1/3 animate-pulse")} style={st.load !== null ? { width: `${Math.round(st.load * 100)}%` } : undefined} />
          </span>
          <span className="text-[12px] text-mute">처음 한 번은 받아쓰기 모델(약 80MB)을 받아요 · 소리는 밖으로 나가지 않아요</span>
        </div>
      )}

      {st.s === "done" && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-bold">
            받아쓴 글 <span className="rounded-[6px] bg-soft px-1.5 py-px text-[11px] font-bold text-sub">이 기기</span>
            <span className="ml-auto text-[12px] font-medium text-mute">{clock(st.sec)} · {st.text.length}자</span>
          </span>
          <textarea value={st.text} onChange={(e) => setSt({ ...st, text: e.target.value })} rows={4} aria-label="받아쓴 글"
            className="resize-y rounded-control border border-line bg-[#fff] px-3 py-2 text-[13px] leading-5 text-[#333d4b] outline-none focus:border-key" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSt({ s: "idle" })} className="inline-flex h-9 items-center gap-1.5 rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold"><RotateCcw size={13} /> 다시 녹음</button>
            <span className="flex-1" />
            <button type="button" onClick={() => onUse(st.text.slice(0, 1000), "raw")} className="h-9 rounded-control px-3 text-[13px] font-medium text-sub hover:text-ink">그대로 넣기</button>
            <button type="button" onClick={useAi} disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">
              <span className="rounded-[6px] bg-new-soft px-1.5 py-px text-[11px] font-bold text-new">{aiOn ? "AI" : "자동"}</span>{busy ? "요약하는 중…" : "요약해 메모 칸에 넣기"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
