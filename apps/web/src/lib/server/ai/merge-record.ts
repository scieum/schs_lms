import "server-only";
import { z } from "zod";
import { applyTags, SUB_ITEMS, tagByRules, type TaggedSentence } from "@/lib/domain/competency";
import { measure, UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import { mergeByRules, orderPieces, type MergePiece } from "@/lib/domain/merge";
import { polishStyle } from "@/lib/domain/neis-style";
import type { Student } from "@/lib/domain/types";
import { fitToMax, scrubIdentity, sentences } from "@/lib/domain/writing";
import { aiEnabled, aiJson } from "./claude";
import { recordSystemPrompt } from "./record-prompts";
import type { WriteKind, WriteResult } from "./write-record";

// 합치기·맞추기·역량 보기 (Figma N11). 교사가 버튼을 눌렀을 때만, 결과는 돌려주기만 한다 (저장은 교사가).
// AI에는 가명ID만 보낸다. 조각 속 이름·학번은 지운 뒤 보내고, 결과도 다시 지운다.

const Out = z.object({ draft: z.string() });

function target(range: LengthRange): string {
  const chars = range.unit === "bytes" ? ` (한글 약 ${Math.floor(range.min / 3)}~${Math.floor(range.max / 3)}자)` : "";
  return `${range.min.toLocaleString()}~${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}${chars}`;
}

const MERGE_RULES = (range: LengthRange) => `
합치기 규칙:
- 교사가 학기 동안 따로 쓴 조각(누가기록·관찰 메모·지금 본문)을 하나의 기록 문단으로 합친다.
- [특색 활동] 조각은 프로그램 선생님이 확정해 보낸 초안이다. 프로그램 이름은 그 활동 첫 문장에 한 번만 짧게 쓴다.
- 조각 속 구체적인 사실(활동 이름, 과정, 수치, 개념, 결과, 변화)과 교사가 쓴 표현을 최대한 살린다. 조각에 없는 내용은 쓰지 않는다.
- 겹치는 내용은 한 번만 쓰고, 활동의 흐름(시간 순 또는 주제 순)이 자연스럽게 이어지도록 문장을 잇는다.
- 분량: ${target(range)}. 넘치면 덜 중요한 꾸밈과 반복을 먼저 줄이고, 모자라면 조각 속 과정·이유·의미를 더 풀어 쓴다.
- 한 문단, draft 에 최종본만 넣는다.`;

const FIT_RULES = (range: LengthRange) => `
분량 맞추기 규칙:
- 주어진 본문의 내용과 문장 순서를 그대로 두고 분량만 ${target(range)} 에 맞춘다.
- 길면 반복·꾸밈말·덜 중요한 문장을 줄인다. 짧으면 본문에 이미 있는 활동의 과정·이유·의미를 더 풀어 쓴다. 새 활동·수치는 만들지 않는다.
- 한 문단, draft 에 최종본만 넣는다.`;

async function rewrite(input: { kind: WriteKind; context?: string; student: Student; range: LengthRange; system: string; content: string; fallback: () => string }): Promise<WriteResult> {
  const { student, range } = input;
  const fallback = (notice: string): WriteResult => ({ text: polishStyle(input.fallback()), sample: true, notice });
  if (!aiEnabled()) return fallback("AI 키가 없어 조각을 순서대로 이어 붙였어요");
  const r = await aiJson(Out, { system: recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null) + input.system, content: input.content, model: "write", maxTokens: 3000 });
  if (!r.ok) return fallback(`${r.error} — 조각을 이어 붙였어요`);
  const clean = polishStyle(scrubIdentity(r.data.draft, student).text.replaceAll(student.pseudonymId, ""));
  const fitted = fitToMax(clean, range);
  const short = measure(fitted, range.unit) < range.min;
  return {
    text: fitted,
    sample: false,
    notice: fitted !== clean ? "분량을 넘어 마지막 문장을 뺐어요" : short ? `근거가 적어 목표(${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}~)보다 짧아요. 없는 내용은 만들지 않았어요` : undefined,
  };
}

export async function mergeRecord(input: { kind: WriteKind; context?: string; student: Student; pieces: MergePiece[]; range: LengthRange }): Promise<WriteResult> {
  const { student } = input;
  const pid = student.pseudonymId;
  const pieces = orderPieces(input.pieces).map((p) => ({ ...p, text: scrubIdentity(p.text, student, pid).text.trim() })).filter((p) => p.text);
  if (!pieces.length) return { text: "", sample: false, notice: "합칠 조각을 골라 주세요" };
  const content = [
    `학생: ${pid}`,
    input.context ? `${input.kind === "세특" ? "과목" : "동아리"}: ${input.context}` : null,
    `분량: ${target(input.range)}`,
    "",
    "<조각>",
    ...pieces.map((p, i) => `${i + 1}. [${p.source}${p.date ? ` ${p.date}` : ""}] ${p.text}`),
    "</조각>",
  ].filter((x) => x !== null).join("\n");
  return rewrite({ ...input, system: MERGE_RULES(input.range), content, fallback: () => mergeByRules(input.pieces.map((p) => ({ ...p, text: scrubIdentity(p.text, student).text })), input.range) });
}

export async function fitRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; range: LengthRange }): Promise<WriteResult> {
  const { student } = input;
  const body = scrubIdentity(input.text.trim(), student, student.pseudonymId).text;
  if (!body) return { text: "", sample: false, notice: "본문이 비어 있어요" };
  const content = [`학생: ${student.pseudonymId}`, `분량: ${target(input.range)}`, "", "<본문>", body, "</본문>"].join("\n");
  return rewrite({ ...input, system: FIT_RULES(input.range), content, fallback: () => mergeByRules([{ id: "body", source: "본문", date: null, text: scrubIdentity(input.text, student).text }], input.range) });
}

const TagOut = z.object({ tags: z.array(z.object({ index: z.number().int(), competency: z.string().nullable(), sub: z.string().nullable() })) });

const TAG_SYSTEM = `생기부 문장을 대입 학생부종합전형 평가 3대 역량으로 나눈다. 문장 번호마다 하나를 고른다.
- 학업: ${SUB_ITEMS.학업.join(", ")} (교과 지식, 탐구 과정, 배우려는 태도)
- 진로: ${SUB_ITEMS.진로.join(", ")} (희망 진로·계열과 이어지는 과목 선택, 심화 학습, 진로 탐색)
- 공동체: ${SUB_ITEMS.공동체.join(", ")} (함께 하는 활동, 남을 돕는 행동, 책임, 이끄는 행동)
- competency 는 "학업", "진로", "공동체" 중 하나, 어느 것도 아니면 null. sub 는 그 역량의 항목 이름 그대로.
- 문장에 여러 역량이 섞이면 가장 두드러진 하나만.`;

/** 역량 보기: 문장마다 역량. AI가 없거나 실패하면 낱말 규칙 */
export async function tagCompetency(text: string, student: Student): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동" }> {
  const body = scrubIdentity(text, student, student.pseudonymId).text;
  const list = sentences(body);
  if (!list.length) return { tags: [], label: "자동" };
  if (!aiEnabled()) return { tags: tagByRules(text), label: "자동" };
  const r = await aiJson(TagOut, { system: TAG_SYSTEM, content: list.map((s, i) => `${i}. ${s}`).join("\n"), model: "fast", maxTokens: 2000 });
  if (!r.ok) return { tags: tagByRules(text), label: "자동" };
  // 화면에는 원래 본문 문장을 보여 준다 (지운 이름 자리가 비지 않게)
  return { tags: applyTags(text, r.data.tags), label: "AI" };
}
