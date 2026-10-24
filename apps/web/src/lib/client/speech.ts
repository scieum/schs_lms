// 발표 녹음 (Figma N73): 마이크 녹음 → 16kHz 모노로 풀기 → 이 기기 안 Whisper(public/whisper-worker.js)로 받아쓰기.
// 녹음은 메모리에만 두고 받아쓴 뒤 버린다. 서버로는 받아쓴 글만, 교사가 AI 요약을 누를 때 간다.

export const MAX_RECORD_SEC = 10 * 60;

export type Recording = { stop: () => Promise<Blob>; cancel: () => void; level: () => number };

/** 녹음 시작. 마이크를 못 쓰면 이유를 담은 Error */
export async function startRecording(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("이 브라우저는 녹음을 못 해요. 크롬 · 엣지 · 사파리 최신판으로 열어 주세요");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error("마이크를 쓸 수 없어요. 주소창 왼쪽 자물쇠에서 마이크를 허용해 주세요");
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(1000);
  // 소리 크기 막대용
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const end = () => { stream.getTracks().forEach((t) => t.stop()); void ctx.close().catch(() => {}); };
  return {
    level() {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(1, peak / 64);
    },
    stop: () => new Promise<Blob>((ok) => {
      rec.onstop = () => { end(); ok(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); };
      rec.stop();
    }),
    cancel() { rec.onstop = null; if (rec.state !== "inactive") rec.stop(); end(); },
  };
}

/** 녹음 파일 → 16kHz 모노 */
export async function decode16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    // 워커로 넘길 때 버퍼를 옮기므로 복사본을 만든다
    if (audio.numberOfChannels === 1) return new Float32Array(audio.getChannelData(0));
    const a = audio.getChannelData(0), b = audio.getChannelData(1), out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
    return out;
  } finally {
    void ctx.close().catch(() => {});
  }
}

export type TranscribeProgress = { stage: "load"; ratio: number } | { stage: "run" };

let worker: Worker | null = null;
let seq = 0;

/** 받아쓰기. 처음에는 모델을 내려받는 동안 load 진행을 알린다 */
export function transcribe(audio: Float32Array, onProgress: (p: TranscribeProgress) => void): Promise<string> {
  worker ??= new Worker("/whisper-worker.js", { type: "module" });
  const w = worker;
  const id = ++seq;
  const files = new Map<string, [number, number]>();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type: string; id?: number; file?: string; loaded?: number; total?: number; text?: string; error?: string };
      if (m.type === "load" && m.file) {
        files.set(m.file, [m.loaded ?? 0, m.total ?? 0]);
        const [l, t] = [...files.values()].reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
        onProgress({ stage: "load", ratio: t ? l / t : 0 });
        return;
      }
      if (m.id !== id) return;
      if (m.type === "start") onProgress({ stage: "run" });
      else if (m.type === "done") { w.removeEventListener("message", onMessage); resolve(m.text ?? ""); }
      else if (m.type === "error") { w.removeEventListener("message", onMessage); reject(new Error(m.error || "받아쓰지 못했어요")); }
    };
    w.addEventListener("message", onMessage);
    w.onerror = () => { w.removeEventListener("message", onMessage); worker = null; reject(new Error("받아쓰기를 시작하지 못했어요. 인터넷 연결을 확인해 주세요 (처음 한 번 모델을 받아요)")); };
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}

export const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
