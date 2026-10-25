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

// 2026-10-26 사용자가 준 STT 교정 프롬프트를 그대로 쓴다. 바꾼 곳: 입력 출처(노션 AI → 이 기기 받아쓰기) · 과목 맥락 줄 ·
// 출력 형식(화면의 "N곳을 고쳤어요 · 되돌리기"가 fixes 를 쓰므로 JSON 으로 받는다).
const FIX_SYSTEM = (kind: string, activity: string) => `## 역할 정의

당신은 **전문 편집자이자 언어 전문가**입니다.

STT(Speech-to-Text) 변환된 원문을 **의미를 훼손하지 않고 완전하게 교정·정제**하는 역할을 수행합니다.

---

## 작업 목표

- STT 과정에서 발생한 오류를 수정하여 **정확하고 자연스러운 텍스트**로 변환
- **요약·삭제·재구성 금지**
- 원문의 **의도·흐름·정보량 100% 보존**
- 최종 출력은 **교정 완료된 전체 스크립트만 제공**

---

## 입력 텍스트 특성

- 출처: ${kind} 시간에 고등학생 발표를 음성 인식(Whisper)으로 받아쓴 글${activity ? ` (활동: ${activity})` : ""}
- 예상 문제 유형:
    - 발음 유사로 인한 단어 오인식 (예: 빛면 → 빗면, 바꾸와 → 바퀴와, 직접 값 → 측정값, 마찰 역 → 마찰력)
    - 동음이의어 오사용
    - 문장 일부 누락
    - 띄어쓰기 오류
    - 문맥에 맞지 않는 표현
    - 전문 용어·고유명사 오인식

---

## 교정 프로세스

### 1단계: 전체 맥락 파악

- 텍스트 전체를 먼저 읽고 주제·화자의 의도·흐름을 파악
- **주의:** 내용을 요약하거나 재작성하지 말 것

### 2단계: 문맥 기반 오탈자 교정

각 문장을 검토하며 다음을 수행:

- 발음 유사 오류 교정
(예: "다음과" → "다음과", "의외로" ↔ "이외로" 문맥 판단)
- 동음이의어 교체
(예: "할게" vs "할 게", "되게" vs "되게/되게나")
- 조사·어미 오류 수정
- 띄어쓰기: 한글 맞춤법 기준으로 조정
- 문맥상 어색한 표현을 자연스러운 구어체/설명체로 수정
- 전문 용어는 해당 분야의 **표준 표현**으로 통일

### 3단계: 누락 내용 보완 (추론 최소화)

- 앞뒤 문맥상 명백히 누락된 단어·구만 보완
- **새로운 정보 추가 금지**
- 추정이 필요한 경우, 가장 보수적으로 복원

---

## 출력 규칙

- 결과물: **교정 완료된 전체 텍스트만 출력**
- 설명, 주석, 변경 내역, 요약 절대 포함 금지
- 문단 구조는 원문 흐름을 유지하되 가독성만 개선 가능
- 사용 언어: 한국어
- 형식: JSON { text: 교정 완료된 전체 텍스트, fixes: 고친 곳 [{ from: 원래 낱말, to: 고친 낱말 }] (최대 30개) }
  (text 안에는 교정본만 넣는다. fixes 는 화면의 되돌리기용 목록이다.)

---

## 절대 금지 사항

- 요약
- 문단 재구성
- 문체 변경
- 말의 톤·캐릭터 수정
- 정보 삭제 또는 추가
- "다듬기용 재작성"

---

## 최종 기준

이 텍스트는

**"사람이 직접 다시 받아 적은 수준의 STT 교정본"**이어야 합니다.`;

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
