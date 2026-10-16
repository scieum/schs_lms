import "server-only";
import { z } from "zod";
import {
  careerKeywordsRule, checkDocs, followUpQuestions, nextTopicsRule, orderTodos, type DocCheck, type TodoInput, type TodoStep,
} from "@/lib/domain/student-assist";
import type { ComboNote, Offering } from "@/lib/domain/offering";
import { comboCheck } from "@/lib/domain/offering";
import type { Question } from "@/lib/domain/program";
import { aiEnabled, aiJson } from "./claude";

// 학생 화면의 버튼형 AI (docs/ai-features.md S1~S7, /me).
// 원칙: 힌트·요약·정리만, 대신 써 주지 않는다. 가명ID만 보낸다 (이름·학번 X).
// 키가 없거나 실패하면 lib/domain/student-assist.ts 규칙 결과를 "자동" 라벨로 돌려준다.

export type Label = "AI" | "자동";

/** S1 할 일 정리: 마감·분량·야자·과목 신청 → 오늘 순서 3개 */
export async function planToday(items: TodoInput[], today: string): Promise<{ steps: TodoStep[]; line: string; label: Label; error?: string }> {
  const rule = orderTodos(items, today);
  const ruleLine = rule.length ? `${rule.map((s) => s.title).join(" → ")} 순서로 해요` : "지금 낼 것이 없어요";
  if (!aiEnabled() || items.length < 2) return { steps: rule, line: ruleLine, label: "자동" };
  const r = await aiJson(z.object({ order: z.array(z.string()), line: z.string() }), {
    model: "fast",
    system: `고등학생의 오늘 할 일 순서를 정한다. 마감이 가까운 것, 많이 남은 것(분량), 시간이 오래 걸리는 설문을 먼저 둔다.
order 는 할 일 key 3개(주어진 key 만), line 은 학생에게 보여 줄 한 줄(40자 이내, 해요체, 이유 한 가지).`,
    content: `오늘: ${today}\n할 일:\n${items.map((it) => `- key=${it.key} [${it.kind}] ${it.title} · 마감 ${it.due} · ${it.progress}`).join("\n")}`,
  });
  if (!r.ok) return { steps: rule, line: ruleLine, label: "자동", error: r.error };
  const all = orderTodos(items, today, items.length);
  const steps = [...new Set(r.data.order)].map((k) => all.find((s) => s.key === k)).filter((s): s is TodoStep => !!s).slice(0, 3);
  return steps.length ? { steps, line: r.data.line.slice(0, 60), label: "AI" } : { steps: rule, line: ruleLine, label: "자동" };
}

/** S2 문항별 "이 답에 더 쓸 수 있는 것" — 질문 2개씩. 답은 이미 가린 글이어야 한다 */
export async function followUps(questions: Question[], answers: Record<string, string>): Promise<{ items: { id: string; asks: string[] }[]; label: Label; error?: string }> {
  const rule = questions.map((q) => ({ id: q.id, asks: followUpQuestions(answers[q.id] ?? "") }));
  if (!aiEnabled()) return { items: rule, label: "자동" };
  const r = await aiJson(z.object({ items: z.array(z.object({ no: z.number().int(), asks: z.array(z.string()) })) }), {
    model: "fast",
    system: `너는 고등학생의 활동 설문 작성을 돕는다. 절대 답을 대신 쓰지 않고, 예시 문장도 쓰지 않는다.
문항마다 학생이 스스로 더 쓸 수 있게 되묻는 질문 2개(각 35자 이내, 존댓말 의문문)를 준다.
답에 이미 있는 내용은 묻지 않는다. 구체적인 사실(과정·숫자·어려움·역할·배운 점)을 끌어내는 질문으로. no 는 문항 번호.`,
    content: questions.map((q, i) => `${i + 1}. ${q.title} (${q.prompt})\n답: ${(answers[q.id] ?? "").trim() || "(비어 있음)"}`).join("\n\n"),
  });
  if (!r.ok) return { items: rule, label: "자동", error: r.error };
  const items = questions.map((q, i) => {
    const asks = r.data.items.find((x) => x.no === i + 1)?.asks.map((a) => a.trim().slice(0, 60)).filter(Boolean).slice(0, 2) ?? [];
    return { id: q.id, asks: asks.length ? asks : rule[i].asks };
  });
  return { items, label: "AI" };
}

/** S2 서류 빠진 항목 점검. 본문은 가린 TXT 만 보낸다 (PDF·사진은 보내지 않고 체크리스트만) */
export async function docCheck(kinds: string[], files: { name: string; text: string | null }[]): Promise<{ checks: DocCheck[]; label: Label; error?: string }> {
  const rule = checkDocs(kinds, files);
  const texts = files.filter((f) => f.text);
  if (!aiEnabled() || !texts.length) return { checks: rule, label: "자동" };
  const r = await aiJson(z.object({ items: z.array(z.object({ kind: z.string(), missing: z.array(z.string()) })) }), {
    model: "fast",
    system: `첨부한 글은 고등학생이 낸 활동 서류 본문이다. 서류 종류마다 빠진 항목만 짧은 명사구(각 15자 이내, 최대 3개)로 알려 준다.
고쳐 쓰거나 예시 문장을 주지 않는다. 보고서는 주제·동기, 방법·과정, 결과, 배운 점·후속 탐구를 본다.`,
    content: `서류 종류: ${kinds.join(", ") || "서류"}\n\n${texts.map((f) => `[${f.name}]\n${(f.text ?? "").slice(0, 2500)}`).join("\n\n")}`,
  });
  if (!r.ok) return { checks: rule, label: "자동", error: r.error };
  const checks = rule.map((c) => {
    if (!c.uploaded || c.checklist.length) return c;
    const hit = r.data.items.find((x) => x.kind.replace(/\s/g, "") === c.kind.replace(/\s/g, "")) ?? (rule.length === 1 ? r.data.items[0] : undefined);
    return hit ? { ...c, missing: hit.missing.map((m) => m.slice(0, 30)).slice(0, 3) } : c;
  });
  return { checks, label: "AI" };
}

/** S4 다음 학년에 이어갈 주제: 확정 기록 → 주제 3개 + 이유 */
export async function nextYearTopics(pseudonymId: string, careerGoal: string | null, records: { area: string; title: string; content: string }[]): Promise<{ topics: { title: string; why: string }[]; label: Label; error?: string }> {
  const rule = nextTopicsRule(records).map((t) => ({ title: t, why: "지난 기록에서 이어져요" }));
  if (!aiEnabled()) return { topics: rule, label: "자동" };
  const r = await aiJson(z.object({ topics: z.array(z.object({ title: z.string(), why: z.string() })) }), {
    model: "fast",
    system: `고등학생이 다음 학년에 이어서 탐구할 주제 3개를 추천한다. 확정 기록의 활동에서 한 단계 깊어지는 주제로.
title 은 25자 이내 명사구, why 는 근거가 된 기록을 짚는 한 문장(40자 이내, 해요체). 생활기록부 문장을 대신 쓰지 않는다.`,
    content: `학생 ${pseudonymId}\n희망 진로: ${careerGoal ?? "없음"}\n확정 기록:\n${records.map((x) => `[${x.area} ${x.title}] ${x.content.slice(0, 400)}`).join("\n")}`,
  });
  if (!r.ok) return { topics: rule, label: "자동", error: r.error };
  return { topics: r.data.topics.slice(0, 3).map((t) => ({ title: t.title.slice(0, 40), why: t.why.slice(0, 70) })), label: "AI" };
}

/** S7 고른 과목 조합 점검: 진로 연계·학점·분야 쏠림 */
export async function checkCombo(args: { picked: Offering[]; all: Offering[]; maxCredits: number; careerGoal: string | null }): Promise<{ notes: ComboNote[]; label: Label; error?: string }> {
  const rule = comboCheck(args);
  if (!aiEnabled() || !args.picked.length) return { notes: rule, label: "자동" };
  const r = await aiJson(z.object({ notes: z.array(z.object({ warn: z.boolean(), text: z.string() })) }), {
    model: "fast",
    system: `고등학생이 고른 선택 과목 조합을 점검한다. 학점 한도, 희망 진로와의 연계, 빠진 기초 과목(예: 미적분Ⅱ 없이 물리학Ⅱ), 한 분야 쏠림을 본다.
notes 는 2~4개, 각 45자 이내 해요체. 문제면 warn=true. 과목은 열린 과목 목록에 있는 이름만 말한다.`,
    content: `희망 진로: ${args.careerGoal?.slice(0, 40) ?? "없음"}\n최대 학점: ${args.maxCredits}\n고른 과목: ${args.picked.map((o) => `${o.subject}(${o.field}, ${o.credits}학점)`).join(", ")}\n열린 과목: ${args.all.map((o) => o.subject).join(", ")}`,
  });
  if (!r.ok) return { notes: rule, label: "자동", error: r.error };
  const notes = r.data.notes.slice(0, 4).map((n) => ({ tone: n.warn ? ("warn" as const) : ("ok" as const), text: n.text.slice(0, 70) }));
  // 학점 계산은 규칙이 정확하다 — 맨 앞에 둔다
  return { notes: [rule[0], ...notes.filter((n) => !/학점/.test(n.text))].slice(0, 4), label: "AI" };
}

/** /me 진로 키워드 정리: 자유 문장 → 진로 분야·키워드 (저장하지 않음, 확인 후 진로 칸에 넣기) */
export async function careerKeywords(text: string): Promise<{ fields: { field: string; keywords: string[] }[]; goal: string | null; label: Label; error?: string }> {
  const rule = careerKeywordsRule(text);
  const ruleGoal = rule[0]?.field ?? null;
  if (!aiEnabled()) return { fields: rule, goal: ruleGoal, label: "자동" };
  const r = await aiJson(z.object({ goal: z.string().nullable(), fields: z.array(z.object({ field: z.string(), keywords: z.array(z.string()) })) }), {
    model: "fast",
    system: `고등학생이 자유롭게 쓴 희망 진로 문장을 정리한다. 대신 진로를 정해 주지 않고, 학생이 쓴 말에서만 뽑는다.
goal 은 진로 칸에 넣을 짧은 이름(15자 이내, 예: "산업디자이너"), fields 는 진로 분야 1~2개와 분야마다 탐구 키워드 3개(각 10자 이내).`,
    content: text.slice(0, 300),
  });
  if (!r.ok) return { fields: rule, goal: ruleGoal, label: "자동", error: r.error };
  return {
    fields: r.data.fields.slice(0, 2).map((f) => ({ field: f.field.slice(0, 20), keywords: f.keywords.slice(0, 3).map((k) => k.slice(0, 15)) })),
    goal: r.data.goal?.trim().slice(0, 40) || null,
    label: "AI",
  };
}
