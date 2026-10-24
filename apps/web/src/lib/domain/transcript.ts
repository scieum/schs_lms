// 발표 받아쓰기 다듬기 (Figma N73): 이 기기의 Whisper 는 말소리가 없거나 잡음뿐인 구간에서
// 같은 낱말을 끝없이 되풀이하거나("영상이 영상이 영상이 …") 방송 끝맺음 말을 지어내곤 한다(2026-10-24 시험).
// 받아쓴 글을 화면에 보이기 전에 그런 부분만 걷어 낸다. 실제 발표 내용은 건드리지 않는다.

const MADE_UP = [/시청해\s?주셔서 감사합니다\.?/g, /구독과 좋아요(?: 부탁드립니다)?\.?/g, /다음 영상에서 만나요\.?/g];

/** 1~4 낱말 묶음이 세 번 넘게 잇따라 되풀이되면 한 번만 남긴다 · 지어낸 끝맺음 말을 뺀다 */
export function cleanTranscript(text: string): string {
  let out = String(text ?? "");
  for (const re of MADE_UP) out = out.replace(re, " ");
  let words = out.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  for (let n = 1; n <= 4; n++) {
    const kept: string[] = [];
    for (let i = 0; i < words.length;) {
      const gram = words.slice(i, i + n).join(" ");
      let k = i + n;
      let times = 1;
      while (k + n <= words.length && words.slice(k, k + n).join(" ") === gram) { times++; k += n; }
      if (times >= 3) { kept.push(...words.slice(i, i + n)); i = k; } else { kept.push(words[i]); i++; }
    }
    words = kept;
  }
  return words.join(" ");
}
