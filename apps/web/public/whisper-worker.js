// 발표 녹음 받아쓰기 (Figma N73, 2026-10-24 "기기 안"): 이 브라우저 안에서 Whisper 로 한국어를 받아쓴다.
// 소리는 밖으로 보내지 않는다 — 처음 한 번 받아쓰기 모델 파일(약 80MB, 8비트)만 내려받고, 다음부터는 브라우저 캐시를 쓴다.
// WebGPU 는 쓰지 않는다: 학교 PC 는 GPU 어댑터가 없는 경우가 많고, WebGPU 용 모델은 200MB 넘게 받아야 해서 (2026-10-24 시험).
// 긴 녹음은 직접 28초 안쪽 조각으로 나눈다(가장 조용한 곳에서 자름, 겹침 없음). 라이브러리의 30초 겹침 이어 붙이기는
// 같은 말이 되풀이되는 녹음에서 문장을 빠뜨렸다(5분 시험 16번 중 6번만 남음 — 2026-10-24).
// 화면(lib/client/speech.ts)이 { id, audio: Float32Array(16kHz 모노) } 를 보내면 load(내려받기) · start · progress(조각 n/m) · done | error 를 돌려준다.
import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";

env.allowLocalModels = false;
const MODEL = "onnx-community/whisper-base";
const RATE = 16000;
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

/** 28초 안쪽 조각으로: 20~28초 사이에서 가장 조용한 0.4초 자리에서 자른다 */
function pieces(audio) {
  const out = [];
  const max = 28 * RATE, min = 20 * RATE, win = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE);
  let start = 0;
  while (audio.length - start > max) {
    let best = start + max, quiet = Infinity;
    for (let s = start + min; s + win <= start + max; s += hop) {
      let e = 0;
      for (let i = s; i < s + win; i += 4) e += audio[i] * audio[i];
      if (e < quiet) { quiet = e; best = s + Math.round(win / 2); }
    }
    out.push(audio.subarray(start, best));
    start = best;
  }
  if (audio.length - start > RATE * 0.3) out.push(audio.subarray(start));
  return out;
}

self.onmessage = async (e) => {
  const { id, audio } = e.data;
  try {
    const asr = await load();
    self.postMessage({ type: "start", id });
    const parts = pieces(audio);
    const texts = [];
    for (let i = 0; i < parts.length; i++) {
      self.postMessage({ type: "progress", id, done: i, total: parts.length });
      const out = await asr(parts[i], { language: "korean", task: "transcribe" });
      texts.push((Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim());
    }
    self.postMessage({ type: "done", id, text: texts.join(" ").replace(/\s+/g, " ").trim() });
  } catch (err) {
    self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
  }
};
