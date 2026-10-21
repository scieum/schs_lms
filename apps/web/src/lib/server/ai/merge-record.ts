import "server-only";
import { createHash } from "node:crypto";
import { joinParagraphs } from "@/lib/domain/paragraphs";
import { repo } from "../repo";
import { z } from "zod";
import { applyTags, SUB_ITEMS, tagByRules, type TaggedSentence } from "@/lib/domain/competency";
import { measure, UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import { fitGap, fitGoal, groupByActivity, mergeByRules, orderPieces, type MergePiece } from "@/lib/domain/merge";
import { stripActivity } from "@/lib/domain/activity-name";
import { polishStyle } from "@/lib/domain/neis-style";
import type { Student } from "@/lib/domain/types";
import { findIdentity, fitToMax, scrubIdentity, sentences } from "@/lib/domain/writing";
import { applyRuleFixes, autoCheck, fixableRows, type PraiseCheck } from "@/lib/domain/auto-check";
import { sampleVariants, type VariantMode } from "@/lib/domain/variants";
import { aiEnabled, aiJson } from "./claude";
import { subjectStandards } from "../standards";
import { recordSystemPrompt } from "./record-prompts";
import type { WriteKind, WriteResult } from "./write-record";
import { joinSentences, SOURCED_RULES, SourcedOut, toKeys } from "./sourced";
import { pieceKey } from "../provenance";
import type { Level } from "@/lib/domain/achievement";
import { evidenceAmount, praisePrompt } from "@/lib/domain/praise";
import { appendBand, closest, coverage, gateAim, gateBand, gateCheck, gateResult, GATE_ROUNDS, thinEvidence, type Gate } from "@/lib/domain/length-gate";

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
- 조각 속 구체적인 사실(활동 이름, 과정, 수치, 개념, 결과, 변화)과 교사가 쓴 핵심 낱말은 빠짐없이 살린다. 조각에 없는 내용은 쓰지 않는다.
- 다만 조각 문장을 그대로 옮겨 늘어놓지 않는다. 조각 하나가 문장 하나가 되면 글이 끊긴다. 같은 활동의 조각은 묶어 사실만 가져와 한두 문장으로 새로 짓고, 이어진 행동은 '~하고', '~하며', '~했으며', '특히'로 잇는다.
- <조각>은 활동별로 묶어 보낸다. 활동 이름은 그 활동 첫 문장에만 '활동명에서'처럼 한 번 쓰고 이어지는 문장에는 다시 쓰지 않는다. 대괄호는 쓰지 않는다.
- [핵심] 표시 조각은 교사가 꼭 넣으라고 고른 것이다. 반드시 살리고 앞쪽에 무게를 둔다.
- 고른 조각은 모두 글에 반영한다(조각마다 적어도 한 문장이 기댄다). 분량이 넘치면 조각을 빼지 말고 [참고] 조각부터 짧게 압축하고, 겹치는 말·꾸밈말을 줄인다.
- 겹치는 내용은 한 번만 쓰고, 활동의 흐름(시간 순 또는 주제 순)이 자연스럽게 이어지도록 문장을 잇는다.
- 분량: ${target(range)}. 넘치면 꾸밈과 반복을 먼저 줄이고, 모자라면 조각 속 과정·이유·의미를 더 풀어 쓴다.
- 한 문단, draft 에 최종본만 넣는다.`;

const FIT_RULES = (range: LengthRange) => `
분량 맞추기 규칙:
- 주어진 본문의 내용과 문장 순서를 그대로 두고 분량만 ${target(range)} 에 맞춘다.
- 길면 반복·꾸밈말·덜 중요한 문장을 줄인다. 짧으면 본문에 이미 있는 활동의 과정·이유·의미를 더 풀어 쓴다. 새 활동·수치는 만들지 않는다.
- 줄이거나 늘릴 때 문장을 쪼개 짧은 문장을 늘어놓지 않는다. 이어진 문장은 이어진 채로 둔다.
- 한 문단, draft 에 최종본만 넣는다.`;

async function rewrite(input: { kind: WriteKind; context?: string; student: Student; range: LengthRange; system: string; content: string; fallback: () => string; tone?: string; guard?: string; labels?: Map<string, string>; keepLong?: boolean }): Promise<WriteResult> {
  const { student, range } = input;
  const fallback = (notice: string): WriteResult => ({ text: polishStyle(input.fallback()), sample: true, notice });
  if (!aiEnabled()) return fallback("AI 키가 없어 조각을 순서대로 이어 붙였어요");
  // 성취수준 말투(N35 ③)는 시스템 프롬프트 끝에 한 줄만 — 학생 정보와 함께 보내지 않는다
  // N41 과장 막기: 평가 수위 규칙 (맞추기는 본문에 없는 칭찬을 보태지 않는다)
  const system = recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null) + input.system + (input.tone ?? "") + (input.guard ?? NO_NEW_PRAISE);
  // N38: 근거 표지가 있으면 문장마다 기댄 표지를 같이 받는다
  let draft: string;
  let sentences: WriteResult["sentences"];
  if (input.labels) {
    const r = await aiJson(SourcedOut, { system: system.replace(/draft 에 최종본만 넣는다\./g, "최종본만 쓴다.") + SOURCED_RULES, content: input.content, model: "write", maxTokens: 3500 });
    if (!r.ok) return fallback(`${r.error} — 조각을 이어 붙였어요`);
    draft = joinSentences(r.data.sentences);
    sentences = toKeys(r.data.sentences, input.labels);
  } else {
    const r = await aiJson(Out, { system, content: input.content, model: "write", maxTokens: 3000 });
    if (!r.ok) return fallback(`${r.error} — 조각을 이어 붙였어요`);
    draft = r.data.draft;
  }
  const clean = polishStyle(scrubIdentity(draft, student).text.replaceAll(student.pseudonymId, ""));
  // keepLong: 맞추기는 넘친 글을 여기서 자르지 않고 다시 맞춘다 (fitRecord)
  const fitted = input.keepLong ? clean : fitToMax(clean, range);
  const short = measure(fitted, range.unit) < range.min;
  return {
    text: fitted,
    sample: false,
    notice: fitted !== clean ? "분량을 넘어 마지막 문장을 뺐어요" : short ? `근거가 적어 목표(${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}~)보다 짧아요. 없는 내용은 만들지 않았어요` : undefined,
    sentences,
  };
}

/** 본문을 다시 쓰는 일(맞추기·다른 버전·고치기)에 붙는 한 줄 */
const NO_NEW_PRAISE = `

평가 수위 규칙: 본문에 없는 칭찬어나 높은 평가(탁월함, 뛰어남, 인상적임, 돋보임, 두드러짐 등)와 학생 전체를 단정하는 총평을 새로 보태지 않음.`;

/**
 * tone: 성취수준 말투 한 줄 (achievement.levelPrompt) · level: 고른 수준 (N41, 없으면 사실 그대로)
 * keepOrder: 교사가 정한 순서(메모 모아 쓰기 N41) 그대로 — 아니면 날짜 순
 */
export async function mergeRecord(input: { kind: WriteKind; context?: string; student: Student; pieces: MergePiece[]; range: LengthRange; tone?: string; level?: Level | null; keepOrder?: boolean; background?: string[]; gate?: Gate; limit?: number; keep?: string }): Promise<WriteResult> {
  // N49: 목표 ± 오차 게이트 — 글을 쓴 뒤 ① 빠진 메모 넣기 ② 분량 맞추기 (넘쳐도 문장을 빼지 않고 압축)
  const whole = input.gate ?? gateBand({ unit: input.range.unit, target: input.range.max, limit: input.range.max });
  // N49b 지금 글에 더하기: 지금 글은 한 글자도 안 바꾸고, 남은 띠만큼 새 글을 써서 뒤에 붙인다
  const keep = input.keep?.trim() ?? "";
  const keptLen = keep ? measure(keep, whole.unit) : 0;
  const gate = keep ? appendBand(whole, keptLen) : whole;
  if (!gate) return { text: "", sample: false, notice: "지금 글이 이미 목표 범위에 닿아 더할 자리가 없어요" };
  const limit = Math.max(input.limit ?? 0, input.range.max) - (keep ? keptLen + 1 : 0);
  const join = (part: string) => (keep ? `${keep} ${part.trim()}` : part);
  const range: LengthRange = { ...input.range, min: gate.lo, max: gate.hi };
  const first = await mergeOnce({ ...input, pieces: keep ? input.pieces.filter((p) => p.source !== "본문") : input.pieces, range, keep: keep || undefined });
  if (first.sample) return { ...first, text: first.text ? join(fitToMax(first.text, { unit: gate.unit, max: limit })) : "" };
  if (!first.text) return first;
  const pid = input.student.pseudonymId;
  const picked = (input.keepOrder ? input.pieces : orderPieces(input.pieces)).filter((p) => !keep || p.source !== "본문").map((p) => ({ ...p, text: scrubIdentity(p.text, input.student, pid).text.trim() })).filter((p) => p.text);
  const memos = picked.filter((p) => p.source !== "본문");
  const keyOf = new Map(memos.map((p) => [pieceKey(p), p.id]));
  let r = first;
  let cov = coverage(r.sentences, [...keyOf.keys()]);
  let added: { before: number; after: number } | undefined;
  if (cov.missing.length && r.sentences) {
    const before = cov.covered.length;
    const again = keep ? null : await addMissing({ ...input, range, pieces: picked, draft: r.text, missing: cov.missing });
    if (again && !again.sample && again.text) {
      const c2 = coverage(again.sentences, [...keyOf.keys()]);
      if (c2.covered.length >= cov.covered.length) { r = again; cov = c2; }
    }
    added = { before, after: cov.covered.length };
  }
  const beforeFit = measure(r.text, gate.unit);
  const fit = await fitToGate({ kind: input.kind, context: input.context, student: input.student, text: r.text, gate, limit, evidence: memos.map((p) => p.text), keep: keep || undefined });
  const text = join(fit.text);
  return {
    text,
    sample: false,
    // 다시 맞추면 문장이 바뀌어 근거 표지는 규칙으로 다시 붙인다 (N38)
    sentences: fit.rounds ? undefined : r.sentences,
    notice: fit.notice,
    gate: gateResult(text, whole, fit.rounds, { thin: fit.thin, append: keep ? { kept: keptLen, added: measure(fit.text, whole.unit) } : undefined, trace: { first: measure(first.text, gate.unit), added, fit: fit.rounds ? { from: beforeFit, to: measure(fit.text, gate.unit) } : undefined }, memos: r.sentences ? { picked: memos.length, covered: cov.covered.length, missing: cov.missing.map((k) => keyOf.get(k) ?? k) } : undefined }),
  };
}

/** 빠진 메모 넣기 (N49 ①): 초안의 문장·사실은 그대로 두고 빠진 조각만 알맞은 자리에 넣는다 */
async function addMissing(input: { kind: WriteKind; context?: string; student: Student; pieces: MergePiece[]; range: LengthRange; tone?: string; level?: Level | null; draft: string; missing: string[] }): Promise<WriteResult | null> {
  const labels = new Map(input.pieces.map((p, i) => [`S${i + 1}`, pieceKey(p)]));
  const missingLabels = [...labels].filter(([, k]) => input.missing.includes(k)).map(([s]) => s);
  if (!missingLabels.length) return null;
  const content = [
    `학생: ${input.student.pseudonymId}`,
    `분량: ${target(input.range)}`,
    "",
    "<조각>",
    ...input.pieces.map((p, i) => `  ${i + 1}. [S${i + 1}] ${p.weight === 3 ? "[핵심] " : p.weight === 1 ? "[참고] " : ""}(${p.source}${p.date ? ` ${p.date}` : ""}) ${stripActivity(p.text)}`),
    "</조각>",
    "",
    "<초안>", input.draft, "</초안>",
    "",
    `초안에 빠진 조각: ${missingLabels.join(", ")}`,
  ].join("\n");
  const system = `
빠진 조각 넣기 규칙:
- <초안>의 사실과 문장 흐름은 그대로 두고, 빠진 조각의 사실을 같은 활동 문장 곁이나 알맞은 자리에 한두 구절로 넣는다.
- 빠진 조각을 넣느라 다른 조각의 사실을 빼지 않는다. 분량이 넘치면 겹치는 말·꾸밈말을 줄여 압축한다.
- 조각에 없는 내용은 쓰지 않는다.
- 분량: ${target(input.range)}. 한 문단, draft 에 최종본만 넣는다.`;
  const guard = praisePrompt(input.level, evidenceAmount(input.pieces.filter((p) => p.source !== "본문").map((p) => p.text)));
  return rewrite({ kind: input.kind, context: input.context, student: input.student, range: input.range, system, content, labels, guard, tone: input.tone, keepLong: true, fallback: () => input.draft });
}

/**
 * 분량 게이트 맞추기 (N49 ②): 띠 밖이면 GATE_ROUNDS 번까지 다시 맞춘다.
 * 줄이기는 문장·사실을 빼지 않고 압축, 늘리기는 근거 메모 속 과정·까닭을 풀어 쓴다(근거가 너무 적으면 늘리지 않음 — thin).
 * 띠에 가장 가까운 글을 쓰고, 한도(limit)를 넘을 때만 마지막 수단으로 끝 문장을 뺀다.
 */
async function fitToGate(input: { kind: WriteKind; context?: string; student: Student; text: string; gate: Gate; limit: number; evidence: string[]; keep?: string }): Promise<{ text: string; rounds: number; thin: boolean; notice?: string }> {
  const { gate, student } = input;
  const range: LengthRange = { unit: gate.unit, min: gate.lo, max: gate.hi, capped: false };
  const thin = thinEvidence(input.evidence, gate);
  const evidence = input.evidence.map((t) => scrubIdentity(t, student, student.pseudonymId).text.trim()).filter(Boolean);
  const tried = [input.text];
  let text = input.text;
  let rounds = 0;
  for (let i = 0; i < GATE_ROUNDS && aiEnabled(); i++) {
    const c = gateCheck(text, gate);
    if (c.pass || (c.dir === "늘리기" && thin)) break;
    rounds++;
    const u = UNIT_LABEL[gate.unit];
    const aim = gateAim(gate);
    const chars = gate.unit === "bytes" ? ` (공백 포함 약 ${fitGoal({ unit: "bytes", min: aim, max: aim }, text).chars}자)` : "";
    const note = c.dir === "줄이기"
      ? `지금 ${c.value.toLocaleString()}${u} → 약 ${aim.toLocaleString()}${u}${chars}로 약 ${c.by.toLocaleString()}${u} 줄인다. 문장과 사실은 하나도 빼지 않는다. 겹치는 말·꾸밈말을 덜고, 이어지는 두 문장은 한 문장으로 묶어 압축한다.`
      : `지금 ${c.value.toLocaleString()}${u} → 약 ${aim.toLocaleString()}${u}${chars}로 약 ${c.by.toLocaleString()}${u} 늘린다. <근거 메모>에 있는 활동마다 목적(왜 했는지), 방법·과정(어떻게 했는지), 그 과정에서 쓴 개념, 결과, 배운 점·다음 탐구를 문장 안에서 풀어 쓴다. 세특이면 <성취기준>과 이어지는 학습 의미를 붙여도 된다. 근거에 없는 활동·수치·수상·평가는 만들지 않는다.`;
    const content = [`학생: ${student.pseudonymId}`, `분량: ${target(range)}`, note, "", "<본문>", scrubIdentity(text, student, student.pseudonymId).text, "</본문>",
      ...(c.dir === "늘리기" && evidence.length ? ["", "<근거 메모>", ...evidence.map((e) => `- ${e}`), "</근거 메모>"] : []),
      ...(c.dir === "늘리기" && input.kind === "세특" ? [subjectStandards(input.context, evidence.join(" ")) || ""] : []),
      ...(input.keep ? ["", "<본문>은 아래 <지금 글> 뒤에 붙는 글이다. <지금 글>은 고치지 말고, 그 내용을 <본문>에 되풀이하지 않는다.", "<지금 글>", scrubIdentity(input.keep, student, student.pseudonymId).text, "</지금 글>"] : [])].join("\n");
    const again = await rewrite({ kind: input.kind, context: input.context, student, range, system: GATE_FIT_RULES(range), content, fallback: () => text, keepLong: true });
    if (again.sample || !again.text) break;
    text = again.text;
    tried.push(text);
  }
  const best = closest(tried, gate);
  const capped = fitToMax(best, { unit: gate.unit, max: input.limit });
  const end = gateCheck(capped, gate);
  const notice = capped !== best ? "한도를 넘어 마지막 문장을 뺐어요"
    : !end.pass && end.dir === "늘리기" && thin ? "메모가 적어 목표보다 짧아요. 없는 내용은 만들지 않았어요"
    : undefined;
  return { text: capped, rounds, thin, notice };
}

/** 지금 글에 더하기 (N49b) */
const APPEND_RULES = `
이어 쓰기 규칙:
- <지금 글>은 교사가 이미 쓴 글이다. 고치거나 되풀이하지 않는다.
- <조각>으로 <지금 글> 바로 뒤에 이어 붙일 새 문장만 쓴다. 첫 문장은 '또한', '이후', '이와 함께'처럼 자연스럽게 이어지게 시작한다.
- <지금 글>에 이미 있는 사실은 다시 쓰지 않는다. 분량은 새로 쓸 글만 센다.`;

const GATE_FIT_RULES = (range: LengthRange) => `
분량 맞추기 규칙:
- 주어진 본문의 사실·활동·문장 순서를 지키고 분량만 ${target(range)} 에 맞춘다.
- 줄일 때 문장이나 활동을 통째로 빼지 않는다. 겹치는 말, 꾸밈말, 같은 뜻의 되풀이를 덜고 이어지는 문장을 묶어 압축한다.
- 늘릴 때는 본문과 근거 메모에 이미 있는 활동의 과정·까닭·결과를 풀어 쓴다. 새 활동·수치·평가는 만들지 않는다.
- 문장을 쪼개 짧은 문장을 늘어놓지 않는다.
- 한 문단, draft 에 최종본만 넣는다.`;

async function mergeOnce(input: { kind: WriteKind; context?: string; student: Student; pieces: MergePiece[]; range: LengthRange; tone?: string; level?: Level | null; keepOrder?: boolean; background?: string[]; keep?: string }): Promise<WriteResult> {
  const { student } = input;
  const pid = student.pseudonymId;
  const pieces = (input.keepOrder ? input.pieces : orderPieces(input.pieces)).map((p) => ({ ...p, text: scrubIdentity(p.text, student, pid).text.trim() })).filter((p) => p.text);
  if (!pieces.length) return { text: "", sample: false, notice: "합칠 조각을 골라 주세요" };
  const content = [
    `학생: ${pid}`,
    input.context ? `${input.kind === "세특" ? "과목" : "동아리"}: ${input.context}` : null,
    `분량: ${target(input.range)}${input.keep ? " (새로 쓸 글만 — 지금 글은 세지 않음)" : ""}`,
    "",
    ...(input.keep ? ["<지금 글>", scrubIdentity(input.keep, student, pid).text, "</지금 글>", ""] : []),
    "<조각>",
    // 같은 활동명([활동명])의 조각을 한데 묶어 보낸다 — 조각마다 활동명이 붙어 있으면 AI가 문장마다 활동명을 되풀이한다
    ...groupByActivity(pieces).flatMap((g) => [
      g.activity ? `활동: ${g.activity}` : "활동: (이름 없음)",
      ...g.pieces.map(({ piece: p, n }) => `  ${n}. [S${n}] ${p.weight === 3 ? "[핵심] " : p.weight === 1 ? "[참고] " : ""}(${p.source}${p.date ? ` ${p.date}` : ""}) ${stripActivity(p.text)}`),
    ]),
    "</조각>",
    // 차시 메뉴(N43): 반 전체 수업 계획의 활동 내용 — 이 학생의 행동이 아니다
    input.background?.length ? ["<수업 활동 배경>", ...input.background.map((b) => `- ${b}`), "</수업 활동 배경>", "수업 활동 배경은 반 전체가 한 활동 설명이다. 배경만으로 학생 행동을 지어내지 말고, 학생 행동은 조각에 있는 것만 쓴다."].join("\n") : null,
    // 세특: 그 과목 성취기준 가운데 조각과 이어지는 것 (lib/data, 교육부 고시)
    input.kind === "세특" ? subjectStandards(input.context, pieces.map((p) => p.text).join(" ")) || null : null,
  ].filter((x) => x !== null).join("\n");
  // 근거 표지 [S1] … ↔ 조각 key (서버에만)
  const labels = new Map(pieces.map((p, i) => [`S${i + 1}`, pieceKey(p)]));
  // 근거 양: 지금 글(본문)은 빼고 센다 — 메모 한두 개면 총평·최상급 칭찬을 막는다
  const guard = praisePrompt(input.level, evidenceAmount(pieces.filter((p) => p.source !== "본문").map((p) => p.text)));
  return rewrite({ ...input, system: MERGE_RULES(input.range) + (input.keep ? APPEND_RULES : ""), content, labels, guard, keepLong: true, fallback: () => mergeByRules(input.pieces.map((p) => ({ ...p, text: scrubIdentity(p.text, student).text })), input.range) });
}

// ---------- 수정 요청 (Figma N49 ③) ----------

/**
 * 교사가 AI 글을 읽고 보낸 수정 요청대로 다시 쓴다 (Sonnet) → 분량 게이트.
 * 근거(메모)가 있으면 같이 보내 요청이 새 내용을 원할 때 메모 안에서만 찾게 한다. 결과는 돌려주기만 — 교사가 "이걸로 바꾸기".
 */
export async function reviseRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; request: string; evidence?: string[]; gate: Gate; limit: number }): Promise<WriteResult> {
  const { student, gate } = input;
  const pid = student.pseudonymId;
  const body = scrubIdentity(input.text.trim(), student, pid).text;
  const request = scrubIdentity(input.request.trim(), student, pid).text;
  if (!body) return { text: "", sample: false, notice: "본문이 비어 있어요" };
  if (!request) return { text: "", sample: false, notice: "고칠 점을 적어 주세요" };
  if (!aiEnabled()) return { text: "", sample: true, notice: "AI 키가 없어 수정 요청을 보낼 수 없어요" };
  const range: LengthRange = { unit: gate.unit, min: gate.lo, max: gate.hi, capped: false };
  const evidence = (input.evidence ?? []).map((t) => scrubIdentity(t, student, pid).text.trim()).filter(Boolean);
  const content = [
    `학생: ${pid}`, `분량: ${target(range)}`, "",
    "<본문>", body, "</본문>", "",
    "<교사 요청>", request, "</교사 요청>",
    ...(evidence.length ? ["", "<근거 메모>", ...evidence.map((e) => `- ${e}`), "</근거 메모>"] : []),
  ].join("\n");
  const system = `
수정 요청 규칙:
- <교사 요청>대로 본문을 고친다. 요청과 상관없는 문장은 되도록 그대로 둔다.
- 요청이 더 자세히·더 구체적으로를 바라면 본문과 <근거 메모>에 있는 사실 안에서만 풀어 쓴다. 근거에 없는 활동·수치·수상·평가는 요청이 있어도 만들지 않는다.
- 요청이 기재 금지 사항(교외 수상, 기관·대학 이름, 부모 직업 등)을 넣으라는 것이면 그 부분은 따르지 않는다.
- 본문에 있던 사실은 요청이 빼라고 하지 않으면 빼지 않는다.
- 분량: ${target(range)}. 한 문단, draft 에 최종본만 넣는다.`;
  const r = await rewrite({ kind: input.kind, context: input.context, student, range, system, content, fallback: () => input.text, keepLong: true });
  if (r.sample || !r.text) return { ...r, text: r.sample ? "" : r.text };
  const clean = dropPseudonym(r.text, pid);
  const fit = await fitToGate({ kind: input.kind, context: input.context, student, text: clean, gate, limit: input.limit, evidence: [body, ...evidence] });
  return { text: fit.text, sample: false, notice: fit.notice, gate: gateResult(fit.text, gate, fit.rounds, { thin: fit.thin }) };
}

export async function fitRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; range: LengthRange; gate?: Gate; limit?: number; evidence?: string[] }): Promise<WriteResult> {
  const { student, range } = input;
  const body = scrubIdentity(input.text.trim(), student, student.pseudonymId).text;
  if (!body) return { text: "", sample: false, notice: "본문이 비어 있어요" };
  // N49: 게이트를 주면 게이트로 맞춘다 (넘쳐도 문장을 빼지 않음)
  if (input.gate && aiEnabled()) {
    const fit = await fitToGate({ kind: input.kind, context: input.context, student, text: input.text.trim(), gate: input.gate, limit: input.limit ?? input.gate.hi, evidence: input.evidence ?? [input.text] });
    return { text: fit.text, sample: false, notice: fit.notice, gate: gateResult(fit.text, input.gate, fit.rounds, { thin: fit.thin }) };
  }
  const goal = fitGoal(range, body);
  const aim = `분량: ${target(range)} · 겨냥: 약 ${goal.value.toLocaleString()}${UNIT_LABEL[range.unit]}${range.unit === "bytes" ? ` (공백 포함 약 ${goal.chars}자)` : ""} · 지금 ${measure(body, range.unit).toLocaleString()}${UNIT_LABEL[range.unit]}`;
  const content = [`학생: ${student.pseudonymId}`, aim, "", "<본문>", body, "</본문>"].join("\n");
  const first = await rewrite({ ...input, system: FIT_RULES(range), content, fallback: () => mergeByRules([{ id: "body", source: "본문", date: null, text: scrubIdentity(input.text, student).text }], range), keepLong: true });
  if (first.sample) return first;
  // AI는 분량을 어림으로 맞춘다 → 재어 보고 범위 밖이면 세 번까지 다시 맞춘다 (넘친다고 문장을 통째로 빼지 않는다)
  let text = first.text;
  for (let i = 0; i < 3; i++) {
    const gap = fitGap(text, range);
    if (!gap) break;
    const g = fitGoal(range, text);
    const u = UNIT_LABEL[range.unit];
    const note = `지금 ${gap.now.toLocaleString()}${u} → 약 ${g.value.toLocaleString()}${u}${range.unit === "bytes" ? ` (공백 포함 약 ${g.chars}자)` : ""}로 ${gap.dir === "늘리기" ? `약 ${gap.by.toLocaleString()}${u} 늘린다. 본문에 이미 있는 활동의 과정·까닭·의미를 문장 안에서 더 풀어 쓴다` : `약 ${gap.by.toLocaleString()}${u} 줄인다. 꾸밈말·겹치는 말을 줄이고 문장은 남긴다`}.`;
    const again = await rewrite({ ...input, system: FIT_RULES(range), content: [`학생: ${student.pseudonymId}`, `분량: ${target(range)}`, note, "", "<본문>", text, "</본문>"].join("\n"), fallback: () => text, keepLong: true });
    if (again.sample) break;
    text = again.text;
  }
  const fitted = fitToMax(text, range);
  const short = measure(fitted, range.unit) < range.min;
  return { text: fitted, sample: false, notice: fitted !== text ? "분량을 넘어 마지막 문장을 뺐어요" : short ? `근거가 적어 목표(${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}~)보다 짧아요. 없는 내용은 만들지 않았어요` : undefined };
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
/** praise (N41): 화면 자동 검사와 같은 "근거보다 높은 평가" 행을 같이 고친다 */
export async function fixRecord(input: { kind: WriteKind; context?: string; student: Student; text: string; range: LengthRange; praise?: PraiseCheck }): Promise<FixResult> {
  const { student, range } = input;
  const pid = student.pseudonymId;
  const check = autoCheck(input.text, range, findIdentity(input.text, student), undefined, input.kind === "세특" ? input.context : undefined, input.praise ? { praise: input.praise } : undefined);
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
  const system = `${recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null)}${NO_NEW_PRAISE}

고치기 규칙:
- 아래 <걸린 곳>만 고치고 나머지 문장은 글자 그대로 둔다. 문장 순서를 바꾸지 않는다.
- 문장을 둘로 나누지 않는다. 쉼표가 많은 문장은 나열을 '와/과'나 '~하고', '~하며' 같은 연결어미로 바꿔 한 문장으로 둔다.
- 사실·활동·수치를 보태지 않는다. 기재 금지 표현은 일반 명사로 바꾸거나 그 구를 뺀다.
- '근거보다 높은 평가'로 걸린 칭찬어는 관찰한 행동을 담백하게 쓰는 말(드러남, 설명함, 수행함 등)로 낮춘다.
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
  const system = `${recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null)}${NO_NEW_PRAISE}

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

// ---------- 행발 키워드 초안 (Figma N35 ④) ----------

const BEHAVIOR_RULES = (range: LengthRange) => `
키워드 초안 규칙:
- 고른 키워드는 말의 방향일 뿐, 메모·누가기록에 있는 일로만 문장을 쓴다.
- 키워드를 나열하지 않는다. 키워드에 맞는 일이 자료에 없으면 그 키워드는 쓰지 않는다.
- 사실·활동·변화를 지어내지 않는다. 학생 이름·가명ID·주어는 쓰지 않는다.
- 분량: ${target(range)}. 한 문단, draft 에 최종본만 넣는다.`;

/**
 * 행발 키워드 초안 (Sonnet): 고른 키워드 + 에피소드 메모 + (켜면) 누가기록. 메모·누가기록은 이름·학번을 가명ID로 바꿔 보낸다.
 * 결과는 돌려주기만 한다 — 교사가 본문에 넣고 저장·확정한다.
 */
export async function behaviorDraft(input: { student: Student; keywords: string[]; memo: string; logs: { date: string; content: string; key?: string }[]; range: LengthRange; memoKey?: string; gate?: Gate }): Promise<WriteResult> {
  const { student } = input;
  const pid = student.pseudonymId;
  const memo = scrubIdentity(input.memo.trim(), student, pid).text;
  const logs = input.logs.map((l) => ({ date: l.date, content: scrubIdentity(l.content, student, pid).text, key: l.key })).filter((l) => l.content.trim());
  if (!memo && !logs.length) return { text: "", sample: false, notice: "에피소드 메모나 누가기록이 있어야 초안을 만들 수 있어요" };
  const content = [
    `학생: ${pid}`,
    `분량: ${target(input.range)}`,
    `고른 키워드(말의 방향): ${input.keywords.length ? input.keywords.join(", ") : "(없음)"}`,
    "",
    "<에피소드 메모>", memo ? `[S1] ${memo}` : "(없음)", "</에피소드 메모>",
    "",
    "<누가기록>", logs.length ? logs.map((l, i) => `${i + 1}. [S${i + 2}] [${l.date}] ${l.content}`).join("\n") : "(없음)", "</누가기록>",
  ].join("\n");
  const pieces: MergePiece[] = [
    ...(memo ? [{ id: "memo", source: "메모" as const, date: null, text: scrubIdentity(input.memo, student).text }] : []),
    ...input.logs.map((l, i) => ({ id: `log-${i}`, source: "누가기록" as const, date: l.date, text: scrubIdentity(l.content, student).text })),
  ];
  // 근거 표지 [S1] 메모 · [S2…] 누가기록 ↔ key (서버에만)
  const labels = new Map<string, string>([["S1", input.memoKey ?? ""] as [string, string], ...logs.map((l, i): [string, string] => [`S${i + 2}`, l.key ?? ""])].filter(([, k]) => !!k));
  const guard = praisePrompt(null, evidenceAmount([memo, ...logs.map((l) => l.content)]));
  // N49: 행발도 목표 ± 오차 게이트 (넘쳐도 문장을 빼지 않고 압축)
  const gate = input.gate ?? gateBand({ unit: input.range.unit, target: input.range.max, limit: input.range.max });
  const range: LengthRange = { ...input.range, min: gate.lo, max: gate.hi };
  const r = await rewrite({ kind: "행발", student, range, system: BEHAVIOR_RULES(range), content, labels, guard, keepLong: true, fallback: () => mergeByRules(pieces, input.range) });
  if (!r.text || r.sample) return { ...r, text: r.sample ? fitToMax(r.text, input.range) : r.text };
  const fit = await fitToGate({ kind: "행발", student, text: r.text, gate, limit: input.range.max, evidence: [memo, ...logs.map((l) => l.content)] });
  return { text: fit.text, sample: false, notice: fit.notice, sentences: fit.rounds ? undefined : r.sentences, gate: gateResult(fit.text, gate, fit.rounds, { thin: fit.thin }) };
}

const TagOut = z.object({ tags: z.array(z.object({ index: z.number().int(), competency: z.string().nullable(), sub: z.string().nullable() })) });

const TAG_SYSTEM = `생기부 문장을 대입 학생부종합전형 평가 3대 역량으로 나눈다. 문장 번호마다 하나를 고른다.
- 학업: ${SUB_ITEMS.학업.join(", ")} (교과 지식, 탐구 과정, 배우려는 태도)
- 진로: ${SUB_ITEMS.진로.join(", ")} (희망 진로·계열과 이어지는 과목 선택, 심화 학습, 진로 탐색)
- 공동체: ${SUB_ITEMS.공동체.join(", ")} (함께 하는 활동, 남을 돕는 행동, 책임, 이끄는 행동)
- competency 는 "학업", "진로", "공동체" 중 하나, 어느 것도 아니면 null. sub 는 그 역량의 항목 이름 그대로.
- 문장에 여러 역량이 섞이면 가장 두드러진 하나만.`;

/** 역량 보기: 문장마다 역량. AI가 없거나 실패하면 낱말 규칙 */
export async function tagCompetency(text: string, student: Student, opts: { force?: boolean } = {}): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동"; savedAt?: string; cached?: boolean }> {
  const body = scrubIdentity(text, student, student.pseudonymId).text;
  const list = sentences(body);
  if (!list.length) return { tags: [], label: "자동" };
  if (!aiEnabled()) return { tags: tagByRules(text), label: "자동" };
  // N56: 같은 학생 · 같은 글이면 저장된 AI 결과 (다시 나누기를 누르면 force)
  const hash = createHash("sha256").update(joinParagraphs(text)).digest("hex");
  if (!opts.force) {
    const hit = await repo.getCompetencyTags(student.id, hash).catch(() => null);
    if (hit) return { tags: hit.tags, label: "AI", savedAt: hit.savedAt, cached: true };
  }
  const r = await aiJson(TagOut, { system: TAG_SYSTEM, content: list.map((s, i) => `${i}. ${s}`).join("\n"), model: "fast", maxTokens: 2000 });
  if (!r.ok) return { tags: tagByRules(text), label: "자동" };
  // 화면에는 원래 본문 문장을 보여 준다 (지운 이름 자리가 비지 않게)
  const tags = applyTags(text, r.data.tags);
  const savedAt = await repo.saveCompetencyTags(student.id, hash, tags).catch(() => undefined);
  return { tags, label: "AI", savedAt };
}
