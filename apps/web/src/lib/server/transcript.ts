import "server-only";
import { z } from "zod";
import { maskIdentity } from "@/lib/domain/program";
import { aiEnabled, aiJson } from "./ai/claude";
import { readEvidence, type EvidenceResult } from "./ai/read-evidence";

// 발표 녹음 (Figma N73): 이 기기에서 받아쓴 글 → 누가기록 문체 활동 요약 1~2문장. 자료 요약(N60)과 같은 길(readEvidence log)로,
// 이름 · 학번을 가린 뒤 보내고 돌아온 글도 다시 가린다. 저장하지 않는다(교사가 메모 칸에서 고친 뒤 남긴다).

export const TRANSCRIPT_MAX = 12000;

export async function readTranscript(text: string, opts: { kind: string; people: { name: string; studentNo: string }[] }): Promise<EvidenceResult> {
  const body = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TRANSCRIPT_MAX);
  if (body.length < 5) return { ok: false, error: "받아쓴 글이 너무 짧아요" };
  return readEvidence({ bytes: new Uint8Array(), mime: "text/plain", name: "발표 받아쓰기", text: body }, { mode: "log", kind: `${opts.kind} (학생 발표를 받아쓴 글 — 말버릇 · 군말은 빼고 발표 내용만)`, people: opts.people });
}

// 오타 고치기 (Figma 724:1882, 2026-10-25 "받아쓰기 할 때 오타가 조금 많은 편"): 이 기기의 Whisper base 는 한국어 글자 오류가
// 약 12%(1분 발표 시험)이고 과목 낱말을 비슷한 소리로 적는다(빗면 → 빛면, 바퀴 → 바꾸, 측정값 → 직접 값). 한 단계 큰 small 도 약 8%로
// 같은 낱말을 틀려서, 모델을 키우는 대신 과목 · 활동명을 맥락으로 잘못 들은 낱말 · 띄어쓰기만 고친다. 요약 · 다듬기는 하지 않는다.

export type FixResult = { ok: true; text: string; fixes: { from: string; to: string }[] } | { ok: false; error: string };

const FixOut = z.object({ text: z.string(), fixes: z.array(z.object({ from: z.string(), to: z.string() })) });

const FIX_SYSTEM = (kind: string, activity: string) => `첨부한 글은 ${kind} 시간에 고등학생 발표를 음성 인식으로 받아쓴 글이다${activity ? ` (활동: ${activity})` : ""}.
음성 인식이 비슷한 소리로 잘못 적은 낱말만 고친다.
- 과목 · 활동 맥락으로 보아 분명히 잘못 들은 낱말(예: 빛면 → 빗면, 바꾸와 → 바퀴와, 직접 값 → 측정값, 마찰 역 → 마찰력), 틀린 띄어쓰기 · 맞춤법만 고친다.
- 문장을 더하거나 빼거나 줄이거나 바꿔 쓰지 않는다. 말투(~습니다), 말버릇, 숫자 표기는 그대로 둔다.
- 무엇으로 고칠지 확실하지 않으면 그대로 둔다.
- text: 고친 전체 글. fixes: 고친 곳 { from: 원래 낱말, to: 고친 낱말 } (최대 30개).`;

export async function fixTranscript(text: string, opts: { kind: string; activity: string; people: { name: string; studentNo: string }[] }): Promise<FixResult> {
  if (!aiEnabled()) return { ok: false, error: "AI가 꺼져 있어 오타를 고치지 못해요. 글 칸에서 직접 고쳐 주세요" };
  const body = maskIdentity(String(text ?? "").replace(/\s+/g, " ").trim(), opts.people).slice(0, TRANSCRIPT_MAX);
  if (body.length < 5) return { ok: false, error: "받아쓴 글이 너무 짧아요" };
  const r = await aiJson(FixOut, {
    system: FIX_SYSTEM(opts.kind, maskIdentity(opts.activity, opts.people)),
    content: [{ type: "text", text: `<받아쓴_글>\n${body}\n</받아쓴_글>` }],
    model: "fast",
    maxTokens: 12000,
  });
  if (!r.ok) return r;
  const out = maskIdentity(r.data.text.replace(/\s+/g, " ").trim(), opts.people);
  // 요약 · 다시 쓰기를 막는다: 길이가 크게 달라지면 버린다
  if (!out || Math.abs(out.length - body.length) > Math.max(20, body.length * 0.15)) return { ok: false, error: "AI가 글을 너무 많이 바꿔서 쓰지 않았어요. 다시 눌러 주세요" };
  const fixes = r.data.fixes.filter((f) => f.from.trim() && f.from !== f.to).slice(0, 30);
  return { ok: true, text: out, fixes };
}
