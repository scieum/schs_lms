import "server-only";
import { z } from "zod";
import { applyTags, SUB_ITEMS, tagByRules, type TaggedSentence } from "@/lib/domain/competency";
import { measure, UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import { mergeByRules, orderPieces, type MergePiece } from "@/lib/domain/merge";
import { polishStyle } from "@/lib/domain/neis-style";
import type { Student } from "@/lib/domain/types";
import { findIdentity, fitToMax, scrubIdentity, sentences } from "@/lib/domain/writing";
import { applyRuleFixes, autoCheck, fixableRows } from "@/lib/domain/auto-check";
import { sampleVariants, type VariantMode } from "@/lib/domain/variants";
import { aiEnabled, aiJson } from "./claude";
import { subjectStandards } from "../standards";
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
- [핵심] 표시 조각은 교사가 꼭 넣으라고 고른 것이다. 반드시 살리고 앞쪽에 무게를 둔다. 분량이 넘치면 [참고] 조각부터 줄이거나 빼고, 그다음 표시 없는 조각을 줄인다.
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
    ...pieces.map((p, i) => `${i + 1}. ${p.weight === 3 ? "[핵심] " : p.weight === 1 ? "[참고] " : ""}[${p.source}${p.date ? ` ${p.date}` : ""}] ${p.text}`),
    "</조각>",
    // 세특: 그 과목 성취기준 가운데 조각과 이어지는 것 (lib/data, 교육부 고시)
    input.kind === "세특" ? subjectStandards(input.context, pieces.map((p) => p.text).join(" ")) || null : null,
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

// ---------- AI로 고치기 · 다른 버전 (Figma N34) ----------

/** AI가 돌려준 글에서 가명ID를 지운다 (이름을 다시 넣지 않는다 — 생기부에는 이름을 쓰지 않음) */
function dropPseudonym(text: string, pid: string): string {
  if (!pid) return text;
  const re = new RegExp(`${pid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:은|는|이가|이|가|의|을|를)?\\s*`, "g");
  return text.replace(re, "").replace(/[ \t]{2,}/g, " ").trim();
}

export type FixResult = { text: string; changes: { from: string; to: string }[]; label: "AI" | "자동"; notice?: string };

/**
 * AI로 고치기: 자동 검사에 걸린 곳만 고친다 (Haiku). 보내기 전 이름·학번 → 가명ID, 받은 글은 가명ID를 지운다.
 * AI가 꺼져 있거나 실패하면 규칙 고칠 말만 모두 적용한다 (label "자동"). 분량은 range.max 를 넘지 않게 자른다.
 */
export async function fixRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; range: LengthRange }): Promise<FixResult> {
  const { student, range } = input;
  const pid = student.pseudonymId;
  const check = autoCheck(input.text, range, findIdentity(input.text, student), undefined, input.kind === "세특" ? input.context : undefined);
  const rows = fixableRows(check);
  const byRule = (notice?: string): FixResult => {
    const t = fitToMax(applyRuleFixes(input.text, rows), range);
    return { text: t, changes: rows.filter((r) => r.fix).map((r) => ({ from: r.fix!.from, to: r.fix!.to ?? "" })), label: "자동", notice };
  };
  if (!rows.length) return { text: input.text, changes: [], label: "자동", notice: "고칠 곳이 없어요" };
  if (!aiEnabled()) return byRule();

  const scrub = (s: string) => scrubIdentity(s, student, pid).text;
  const body = scrub(input.text.trim());
  const issues = rows.map((r, i) => `${i + 1}. ${r.label.replace(/'.*'/, "")}${r.phrase ? ` — 걸린 말: "${scrub(r.phrase)}"` : ""} — 이유: ${r.why}${r.fix ? ` — 규칙 제안: ${r.fix.to ? `"${scrub(r.fix.to)}"(으)로 바꾸기` : "그 구 빼기"}` : ""}`);
  const content = [`학생: ${pid}`, `분량: ${range.max.toLocaleString()}${UNIT_LABEL[range.unit]} 이하`, "", "<본문>", body, "</본문>", "", "<걸린 곳>", ...issues, "</걸린 곳>"].join("\n");
  const system = `${recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null)}

고치기 규칙:
- 아래 <걸린 곳>만 고치고 나머지 문장은 글자 그대로 둔다. 문장 순서를 바꾸지 않는다.
- 사실·활동·수치를 보태지 않는다. 기재 금지 표현은 일반 명사로 바꾸거나 그 구를 뺀다.
- 학생 이름·가명ID·"이 학생은" 같은 주어는 쓰지 않는다.
- 문장은 "~함." "~임." 같은 명사형 어미로 끝낸다.
- 분량: ${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}를 넘지 않는다.
- text 에 고친 본문 전체, changes 에 바꾼 곳(from 원래 말, to 바꾼 말 — 뺐으면 빈 글)을 넣는다.`;
  const r = await aiJson(z.object({ text: z.string(), changes: z.array(z.object({ from: z.string(), to: z.string() })) }), { system, content, model: "fast", maxTokens: 2000 });
  if (!r.ok) return byRule(`${r.error} — 규칙으로 고쳤어요`);
  const clean = dropPseudonym(scrubIdentity(r.data.text, student).text, pid);
  if (!clean) return byRule("AI 답이 비어 규칙으로 고쳤어요");
  const fitted = fitToMax(clean, range);
  return {
    text: fitted,
    changes: r.data.changes.map((c) => ({ from: dropPseudonym(c.from, pid), to: dropPseudonym(c.to, pid) })).filter((c) => c.from || c.to).slice(0, 20),
    label: "AI",
    notice: fitted !== clean ? "분량을 넘어 마지막 문장을 뺐어요" : undefined,
  };
}

export type Variant = { text: string; block: boolean };
export type VariantsResult = { versions: Variant[]; label: "AI" | "자동"; sample: boolean; notice?: string };

const VARIANT_RULE: Record<VariantMode, string> = {
  keep: "뜻 그대로: 본문의 내용과 문장 순서를 지키고 표현(낱말·어순·문장 잇기)만 바꾼다.",
  fresh: "새롭게: 본문에 있는 같은 사실로 글의 구성(문장 순서·묶음·강조)을 새로 짠다. 사실·활동·수치를 보태지 않는다.",
};

/**
 * 다른 버전 3개 (Sonnet). 버전마다 분량(range.max)을 넘으면 그 버전만 맞추기(fitRecord)로 줄이고, 그래도 넘으면 버린다.
 * 결과는 저장하지 않는다 — 교사가 "이걸로 바꾸기"를 눌러야 본문에 들어간다.
 */
export async function variantsRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; mode: VariantMode; range: LengthRange }): Promise<VariantsResult> {
  const { student, range } = input;
  const pid = student.pseudonymId;
  const ctx = input.kind === "세특" ? input.context : undefined;
  const judge = (t: string): Variant => ({ text: t, block: autoCheck(t, range, findIdentity(t, student), undefined, ctx).status === "block" });
  const body = scrubIdentity(input.text.trim(), student, pid).text;
  if (!body) return { versions: [], label: "자동", sample: false, notice: "본문이 비어 있어요" };
  if (!aiEnabled()) {
    const plain = scrubIdentity(input.text.trim(), student).text;
    return { versions: sampleVariants(plain, input.mode).map((t) => fitToMax(t, range)).filter((t) => t).slice(0, 3).map(judge), label: "자동", sample: true, notice: "AI 키가 없어 규칙으로 만든 예시예요" };
  }
  const content = [`학생: ${pid}`, `분량: 버전마다 ${range.max.toLocaleString()}${UNIT_LABEL[range.unit]} 이하`, "", "<본문>", body, "</본문>"].join("\n");
  const system = `${recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null)}

다른 버전 규칙:
- 본문을 서로 다른 3개 버전으로 다시 쓴다. ${VARIANT_RULE[input.mode]}
- 본문에 없는 내용은 쓰지 않는다. 학생 이름·가명ID·주어는 쓰지 않는다.
- 버전마다 ${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}를 넘지 않는다. 한 문단.
- versions 에 3개를 넣는다.`;
  const r = await aiJson(z.object({ versions: z.array(z.string()) }), { system, content, model: "write", maxTokens: 4000 });
  if (!r.ok) return { versions: [], label: "AI", sample: false, notice: r.error };
  const out: Variant[] = [];
  for (const raw of r.data.versions.slice(0, 3)) {
    let t = polishStyle(dropPseudonym(scrubIdentity(raw, student).text, pid));
    if (!t) continue;
    if (measure(t, range.unit) > range.max) {
      const f = await fitRecord({ kind: input.kind, context: input.context, student, text: t, range: { ...range, min: Math.min(range.min, Math.ceil(range.max * 0.9)) } });
      t = f.text;
    }
    if (t && measure(t, range.unit) <= range.max) out.push(judge(t));
  }
  return { versions: out, label: "AI", sample: false, notice: out.length < 3 ? `분량에 맞는 버전 ${out.length}개만 보여 줘요` : undefined };
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
