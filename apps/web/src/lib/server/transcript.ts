import "server-only";
import { readEvidence, type EvidenceResult } from "./ai/read-evidence";

// 발표 녹음 (Figma N73): 이 기기에서 받아쓴 글 → 누가기록 문체 활동 요약 1~2문장. 자료 요약(N60)과 같은 길(readEvidence log)로,
// 이름 · 학번을 가린 뒤 보내고 돌아온 글도 다시 가린다. 저장하지 않는다(교사가 메모 칸에서 고친 뒤 남긴다).

export const TRANSCRIPT_MAX = 12000;

export async function readTranscript(text: string, opts: { kind: string; people: { name: string; studentNo: string }[] }): Promise<EvidenceResult> {
  const body = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TRANSCRIPT_MAX);
  if (body.length < 5) return { ok: false, error: "받아쓴 글이 너무 짧아요" };
  return readEvidence({ bytes: new Uint8Array(), mime: "text/plain", name: "발표 받아쓰기", text: body }, { mode: "log", kind: `${opts.kind} (학생 발표를 받아쓴 글 — 말버릇 · 군말은 빼고 발표 내용만)`, people: opts.people });
}
