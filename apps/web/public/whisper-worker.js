// 발표 녹음 받아쓰기 (Figma N73, 2026-10-24 "기기 안"): 이 브라우저 안에서 Whisper 로 한국어를 받아쓴다.
// 소리는 밖으로 보내지 않는다 — 처음 한 번 받아쓰기 모델 파일(약 80MB, 8비트)만 내려받고, 다음부터는 브라우저 캐시를 쓴다.
// WebGPU 는 쓰지 않는다: 학교 PC 는 GPU 어댑터가 없는 경우가 많고, WebGPU 용 모델은 200MB 넘게 받아야 해서 (2026-10-24 시험).
// 화면(lib/client/speech.ts)이 { id, audio: Float32Array(16kHz 모노) } 를 보내면 load(내려받기 진행) · start · done | error 를 돌려준다.
import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";

env.allowLocalModels = false;
const MODEL = "onnx-community/whisper-base";
let ready = null;

function load() {
  ready ??= pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) self.postMessage({ type: "load", file: p.file, loaded: p.loaded, total: p.total });
    },
  }).catch((e) => { ready = null; throw e; });
  return ready;
}

self.onmessage = async (e) => {
  const { id, audio } = e.data;
  try {
    const asr = await load();
    self.postMessage({ type: "start", id });
    const out = await asr(audio, { language: "korean", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).replace(/\s+/g, " ").trim();
    self.postMessage({ type: "done", id, text });
  } catch (err) {
    self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
  }
};
