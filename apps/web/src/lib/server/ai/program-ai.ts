import "server-only";
import { z } from "zod";
import type { DraftCategory } from "@/lib/domain/length";
import { md, rephraseRule, sentences, type Program, type Question, type ResponseDigest } from "@/lib/domain/program";
import { EMPTY_PLAN, isYmd, targetClassesFromText, type PlanRead } from "@/lib/domain/program-plan";
import { aiEnabled, aiJson, fileBlock, type AiResult } from "./claude";
import { kindOfArea, recordSystemPrompt } from "./record-prompts";

// 프로그램 화면의 버튼형 AI (docs/ai-features.md §3). 결과는 화면에서 사람이 확인한 뒤에만 반영한다.
// 학생은 가명ID만 보낸다. 예외: T6·T7 서류 읽기(표지 이름으로 학생 연결) — 이름은 연결에만 쓰고 저장 전에 가린다.

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const withDay = (ymd: string) => `${md(ymd)}(${WEEK[new Date(`${ymd}T00:00:00`).getDay()]})`;

/** T3 설문 문항 추천: 활동 개요 → 추가 문항 후보 */
export async function suggestQuestions(p: { title: string; area: string; overview: string }): Promise<AiResult<string[]>> {
  const r = await aiJson(z.object({ questions: z.array(z.string()) }), {
    model: "write",
    system: `너는 고등학교 활동 설문 문항을 만드는 도우미다. 고정 문항(활동 내용·배운 점·느낀 점·후속 계획)과 겹치지 않는 추가 문항 3개를 만든다.
- 학생이 구체적인 사실(과정·수치·어려움·역할)을 쓰게 하는 질문
- 한 문항 40자 이내, 존댓말 의문문 ("~은 무엇인가요?")`,
    content: `프로그램: ${p.title}\n기록 영역: ${p.area}\n활동 개요: ${p.overview || "(없음)"}`,
  });
  return r.ok ? { ok: true, data: r.data.questions.map((q) => q.trim()).filter(Boolean).slice(0, 3) } : r;
}

/** T2 미응답 독촉 문구. AI 가 꺼져 있으면 규칙으로 만든다 (label 자동) */
export async function reminderMessage(p: Program, missing: number): Promise<{ text: string; label: "AI" | "자동"; error?: string }> {
  const fallback = `"${p.title}" 설문이 ${withDay(p.endDate)}에 마감돼요. ${p.questions.length}문항, 10분이면 끝나요.${p.requestDocs ? " 제출 서류만 올려도 괜찮아요!" : ""}`;
  if (!aiEnabled()) return { text: fallback, label: "자동" };
  const r = await aiJson(z.object({ message: z.string() }), {
    model: "write",
    system: "너는 고등학생에게 보내는 설문 응답 독촉 알림을 쓴다. 다정하고 짧게(80자 이내), 마감일과 걸리는 시간을 넣는다. 이름은 넣지 않는다.",
    content: `프로그램: ${p.title}\n마감: ${withDay(p.endDate)}\n문항 수: ${p.questions.length}\n미응답: ${missing}명\n서류 제출 요청: ${p.requestDocs ? "있음" : "없음"}`,
  });
  return r.ok ? { text: r.data.message.trim(), label: "AI" } : { text: fallback, label: "자동", error: r.error };
}

export interface ReviewItem {
  phrase: string;
  issue: string;
  suggestion: string;
}

/** T4 검토 도우미: 근거 없는 표현·어미·중복을 찾아 바꿀 말을 제안한다. 입력은 이미 가린 글이어야 한다 */
export async function reviewDraft(draft: string, evidence: { label: string; text: string }[]): Promise<{ items: ReviewItem[]; label: "AI" | "자동"; error?: string }> {
  const rule = (): ReviewItem[] =>
    sentences(draft)
      .filter((s) => !/[함음임됨봄줌움냄짐름김힘림]\.$/.test(s))
      .slice(0, 5)
      .map((s) => ({
        phrase: s,
        issue: "어미가 '~함.' 형식이 아니에요",
        suggestion: s.replace(/(했다|하였다|했어요|해요|한다)\.?$/, "함.").replace(/(이다|입니다)\.?$/, "임.").replace(/(였다|었다)\.?$/, "음."),
      }))
      .filter((x) => x.suggestion !== x.phrase);
  if (!aiEnabled()) return { items: rule(), label: "자동" };
  const r = await aiJson(z.object({ items: z.array(z.object({ phrase: z.string(), issue: z.string(), suggestion: z.string() })) }), {
    model: "write",
    system: `너는 생활기록부 초안 검토 도우미다. 초안에서 문제가 있는 표현을 찾는다.
- 근거 자료에 없는 사실·과장 (가장 중요)
- '~함.' 같은 명사형 어미가 아닌 문장, 같은 뜻이 되풀이되는 문장
phrase 는 초안에 그대로 있는 부분 문자열이어야 한다. suggestion 은 그 자리에 바꿔 넣을 말이다 (근거가 없으면 근거 자료에 맞게 고치거나 빈 문자열). 최대 5개.`,
    content: `초안:\n${draft}\n\n근거 자료:\n${evidence.map((e) => `[${e.label}] ${e.text}`).join("\n")}`,
  });
  if (!r.ok) return { items: rule(), label: "자동", error: r.error };
  return { items: r.data.items.filter((x) => x.phrase && draft.includes(x.phrase)).slice(0, 5), label: "AI" };
}

/** T6 서류 읽기: 표지의 이름·학번(학생 연결용) + 본문 글 */
export async function readMaterial(bytes: Uint8Array, mime: string): Promise<AiResult<{ studentName: string | null; studentNo: string | null; text: string | null }>> {
  return aiJson(z.object({ studentName: z.string().nullable(), studentNo: z.string().nullable(), text: z.string().nullable() }), {
    model: "fast",
    system: `첨부한 문서는 고등학생이 낸 활동 서류(보고서·활동지·소감문)다.
- studentName: 표지·머리말에 적힌 학생 이름, studentNo: 학번 숫자(예: 20312). 없으면 null
- text: 본문 내용을 1200자 이내로 원문 표현을 살려 옮긴다 (요약하지 말고 중요한 문장 위주)`,
    content: [fileBlock(bytes, mime), { type: "text", text: "이 서류를 읽어 주세요." }],
  });
}

/** T7 쪽 나누기 제안: 합본 PDF → 학생별 쪽 구간 (첫 쪽 이름으로) */
export async function suggestSplit(bytes: Uint8Array): Promise<AiResult<{ from: number; to: number; studentName: string | null; studentNo: string | null }[]>> {
  const r = await aiJson(
    z.object({ ranges: z.array(z.object({ from: z.number().int(), to: z.number().int(), studentName: z.string().nullable(), studentNo: z.string().nullable() })) }),
    {
      model: "fast",
      maxTokens: 6000,
      system: `첨부한 PDF는 여러 학생의 서류를 한 파일로 모은 합본이다. 학생이 바뀌는 쪽을 찾아 학생별 쪽 구간을 나눈다.
- 각 구간 첫 쪽에 적힌 학생 이름·학번을 읽는다. 읽을 수 없으면 null
- 구간은 겹치지 않게, 1쪽부터 마지막 쪽까지 순서대로`,
      content: [fileBlock(bytes, "application/pdf"), { type: "text", text: "학생별 쪽 구간을 나눠 주세요." }],
    },
  );
  return r.ok ? { ok: true, data: r.data.ranges } : r;
}

/** S2 작성 도우미: 학생 답 → 보완 힌트 (대신 쓰지 않는다). AI 가 꺼져 있으면 규칙 힌트 */
export async function studentHints(questions: Question[], answers: Record<string, string>): Promise<{ hints: string[]; label: "AI" | "자동"; error?: string }> {
  const rule = () => {
    const out: string[] = [];
    questions.forEach((q, i) => {
      const a = (answers[q.id] ?? "").trim();
      if (!a) out.push(`Q${i + 1} ${q.title}: 아직 비어 있어요. 떠오르는 장면 하나부터 써 보세요`);
      else if (a.length < q.minChars) out.push(`Q${i + 1} ${q.title}: ${q.minChars}자 이상이어야 해요. 왜 그렇게 했는지 한 문장 더 써 보세요`);
      else if (!/\d/.test(a) && i === 0) out.push(`Q1 ${q.title}: 횟수·양 같은 숫자를 넣으면 활동이 더 분명해져요`);
    });
    return out.slice(0, 3);
  };
  if (!aiEnabled()) return { hints: rule(), label: "자동" };
  const r = await aiJson(z.object({ hints: z.array(z.string()) }), {
    model: "fast",
    system: `너는 고등학생의 활동 설문 작성을 돕는다. 절대 답을 대신 써 주지 않는다. 예시 문장도 쓰지 않는다.
학생이 스스로 보완할 수 있게 "무엇을 더 쓰면 좋은지" 짧은 힌트 3개(각 50자 이내)만 준다. 문항 번호를 앞에 붙인다(예: "Q1 …").`,
    content: questions.map((q, i) => `Q${i + 1} ${q.title} (${q.prompt})\n답: ${(answers[q.id] ?? "").trim() || "(비어 있음)"}`).join("\n\n"),
  });
  return r.ok ? { hints: r.data.hints.slice(0, 3), label: "AI" } : { hints: rule(), label: "자동", error: r.error };
}

// ---------- T3 계획서·기안문으로 채우기 ----------

const Got = <T extends z.ZodType>(t: T) => z.object({ value: t.nullable(), from: z.string() });
const GotList = z.object({ value: z.array(z.string()), from: z.string() });
const PlanSchema = z.object({
  title: Got(z.string()),
  area: Got(z.enum(["세특", "창체-자율", "창체-동아리", "창체-진로"])),
  subject: Got(z.string()),
  startDate: Got(z.string()),
  endDate: Got(z.string()),
  overview: Got(z.string()),
  target: Got(z.string()),
  extraQuestions: GotList,
  docKinds: GotList,
  source: Got(z.enum(["survey", "docs", "both"])),
});

/**
 * 계획서·기안문(PDF·캡처 이미지·글) → 프로그램 등록 칸. 교사 문서라 그대로 보낸다 (학생 개인정보 아님).
 * 대상 표현은 학교 반 목록에 맞추고, 날짜는 실제 날짜만 남긴다.
 */
export async function readPlan(files: { bytes: Uint8Array; mime: string; name: string }[], ctx: { year: number; classes: string[] }): Promise<AiResult<PlanRead>> {
  const blocks = files.map((f) =>
    f.mime === "text/plain" ? ({ type: "text", text: `[${f.name}]\n${new TextDecoder().decode(f.bytes).slice(0, 20000)}` } as const) : fileBlock(f.bytes, f.mime),
  );
  const r = await aiJson(PlanSchema, {
    model: "fast",
    maxTokens: 3000,
    system: `첨부한 문서는 고등학교 교사가 쓴 활동 계획서 또는 기안문(캡처 이미지일 수 있음)이다. 프로그램 등록 칸을 채운다.
- title: 활동(프로그램) 이름만. "2026학년도", "운영 계획(안)", "기안" 같은 말은 뺀다 (60자 이내)
- area: 생활기록부 기록 영역 추정. 교과 수업 활동이면 세특, 창의적 체험활동이면 창체-자율(자율·자치)/창체-동아리/창체-진로
- subject: 담당 교과 과목 이름 (예: 통합과학). 창체면 보통 null
- startDate, endDate: 활동 기간 YYYY-MM-DD. 연도가 없으면 ${ctx.year}년으로 본다. 하루짜리면 둘이 같다
- overview: 무엇을 어떻게 하는 활동인지 3~5줄 요약 (줄바꿈으로 구분, 각 줄 60자 이내)
- target: 대상 학년·반 표현을 문서 그대로 (예: "2학년 1~3반", "1학년 전체"). 없으면 null
- extraQuestions: 학생 활동 설문에 넣을 추가 문항 후보 0~2개. 고정 문항(활동 내용·배운 점·느낀 점·후속 계획)과 겹치지 않게, 40자 이내 존댓말 의문문
- docKinds: 학생이 낼 서류 종류 (예: 탐구 보고서, 활동지, 소감문). 없으면 빈 배열
- source: 학생 근거 자료 방식 추정. 설문만 survey, 제출 서류만 docs, 둘 다 both
- 모든 칸의 from: 어디서 읽었는지 아주 짧게 (예: "1쪽 제목", "3. 기간 항목", "추정"). 20자 이내`,
    content: [...blocks, { type: "text", text: "이 문서로 프로그램 등록 칸을 채워 주세요." }],
  });
  if (!r.ok) return r;
  const d = r.data;
  const clip = (s: string | null, n: number) => (s ? s.trim().slice(0, n) || null : null);
  const t = targetClassesFromText(d.target.value, ctx.classes);
  const start = isYmd(d.startDate.value) ? d.startDate.value : null;
  const end = isYmd(d.endDate.value) && (!start || d.endDate.value >= start) ? d.endDate.value : start;
  const fields: PlanRead["fields"] = {
    ...EMPTY_PLAN,
    title: clip(d.title.value, 60),
    area: d.area.value as DraftCategory | null,
    subject: clip(d.subject.value, 30),
    startDate: start,
    endDate: end,
    overview: clip(d.overview.value, 1000),
    targetText: clip(d.target.value, 60),
    targetClasses: t.keys,
    extraQuestions: d.extraQuestions.value.map((q) => q.trim().slice(0, 100)).filter(Boolean).slice(0, 2),
    docKinds: [...new Set(d.docKinds.value.map((k) => k.trim().slice(0, 20)).filter(Boolean))].slice(0, 8),
    source: d.source.value,
  };
  const from: PlanRead["from"] = {};
  const put = (k: keyof PlanRead["fields"], f: string) => {
    const v = fields[k];
    if (v !== null && !(Array.isArray(v) && v.length === 0)) from[k] = f.slice(0, 30);
  };
  put("title", d.title.from);
  put("area", d.area.from);
  put("subject", d.subject.from);
  put("startDate", d.startDate.from);
  put("endDate", d.endDate.from);
  put("overview", d.overview.from);
  put("targetClasses", d.target.from);
  put("extraQuestions", d.extraQuestions.from);
  put("docKinds", d.docKinds.from);
  put("source", d.source.from);
  return { ok: true, data: { fields, from } };
}

// ---------- T2 응답 분석 ----------

/** 제출된 설문 답(가명ID·가린 글)으로 공통 주제·눈에 띄는 활동·근거 부족 학생을 요약한다. 꺼져 있으면 규칙 결과 */
export async function analyzeResponses(
  p: Pick<Program, "title" | "area" | "overview" | "questions">,
  students: { pid: string; answers: string[] }[],
  rule: ResponseDigest,
): Promise<{ digest: ResponseDigest & { summary: string | null }; label: "AI" | "자동"; error?: string }> {
  const fallback = { digest: { ...rule, summary: null }, label: "자동" as const };
  if (!aiEnabled() || students.length === 0) return fallback;
  const r = await aiJson(
    z.object({
      summary: z.string(),
      themes: z.array(z.string()),
      highlights: z.array(z.object({ pid: z.string(), note: z.string() })),
      thin: z.array(z.object({ pid: z.string(), note: z.string() })),
    }),
    {
      model: "fast",
      maxTokens: 3000,
      system: `너는 고등학교 교사가 학생 활동 설문 응답을 훑어보도록 돕는다. 학생은 가명ID로만 부른다.
- summary: 전체 응답의 공통 흐름 한두 문장 (80자 이내)
- themes: 여러 학생에게 공통으로 나온 주제 3~5개 (각 20자 이내)
- highlights: 구체적인 과정·수치·시행착오가 있어 생기부 근거로 좋은 학생 최대 3명. note 는 무엇이 좋은지 40자 이내
- thin: 답이 짧거나 막연해 근거가 부족한 학생 최대 5명. note 는 무엇이 부족한지 40자 이내
pid 는 입력에 있는 가명ID 그대로 쓴다.`,
      content: [
        `프로그램: ${p.title} (${p.area})`,
        `활동 개요: ${p.overview || "없음"}`,
        `문항: ${p.questions.map((q, i) => `Q${i + 1} ${q.fixed ? q.title : q.prompt}`).join(" / ")}`,
        "",
        ...students.map((s) => `[${s.pid}] ${s.answers.map((a, i) => `Q${i + 1}: ${a || "(빈칸)"}`).join(" | ")}`),
      ].join("\n").slice(0, 60000),
    },
  );
  if (!r.ok) return { ...fallback, error: r.error };
  const known = new Set(students.map((s) => s.pid));
  return {
    label: "AI",
    digest: {
      summary: r.data.summary.trim() || null,
      themes: r.data.themes.map((t) => t.trim()).filter(Boolean).slice(0, 6),
      highlights: r.data.highlights.filter((x) => known.has(x.pid)).slice(0, 3),
      thin: r.data.thin.filter((x) => known.has(x.pid)).slice(0, 5),
    },
  };
}

// ---------- T4 문장 다르게 쓰기 ----------

/** 초안 문장 하나를 문체 규칙(record-prompts)에 맞게 2~3안으로. 입력은 가린 글. 꺼져 있으면 규칙 안 */
export async function rephraseSentence(
  p: { area: string; subject: string | null },
  sentence: string,
  context: { draft: string; evidence: { label: string; text: string }[]; avoid?: string },
): Promise<{ options: string[]; label: "AI" | "자동"; error?: string }> {
  const rule = { options: rephraseRule(sentence), label: "자동" as const };
  if (!aiEnabled()) return rule;
  const r = await aiJson(z.object({ options: z.array(z.string()) }), {
    model: "write",
    maxTokens: 1500,
    system: `${recordSystemPrompt(kindOfArea(p.area), p.subject)}

이번 작업: 초안 전체가 아니라 지정한 문장 하나만 다르게 쓴 안 2~3개를 options 에 넣는다.
- 뜻과 사실은 그대로 두고 표현과 문장 구조만 바꾼다. 근거 자료에 없는 사실을 더하지 않는다.
- 위의 문체 규칙(명사형 어미, 마침표, 가운데 점 금지, 학생 주어 금지)을 지킨다.
- 길이는 원래 문장과 비슷하게.${context.avoid ? "\n- 다른 학생 초안의 문장과 겹치지 않게 어휘와 구조를 확실히 바꾼다." : ""}`,
    content: [
      `바꿀 문장: ${sentence}`,
      context.avoid ? `겹치면 안 되는 다른 학생 문장: ${context.avoid}` : "",
      `초안 전체(문맥): ${context.draft}`,
      "근거 자료:",
      ...context.evidence.map((e) => `[${e.label}] ${e.text}`),
    ].filter(Boolean).join("\n").slice(0, 20000),
  });
  if (!r.ok) return { ...rule, error: r.error };
  const opts = [...new Set(r.data.options.map((o) => o.replace(/\s+/g, " ").trim()).filter((o) => o && o !== sentence.trim()))].slice(0, 3);
  return opts.length ? { options: opts, label: "AI" } : rule;
}

// ---------- A4 실패 원인 → 해결 제안 ----------

/** 규칙 조치 문장을 AI 가 상황에 맞게 다듬는다. 입력에 학생 정보는 없다 (원인·건수·오류 문구만) */
export async function adviseErrors(rule: string[], errors: string[]): Promise<{ lines: string[]; label: "AI" | "자동"; error?: string }> {
  if (!aiEnabled() || rule.length === 0) return { lines: rule, label: "자동" };
  const r = await aiJson(z.object({ lines: z.array(z.string()) }), {
    model: "fast",
    system: `너는 학교 생활기록부 초안 자동 생성 시스템의 관리자를 돕는다. 실패 원인 요약과 오류 문구를 보고, 관리자가 이 화면에서 바로 할 수 있는 조치를 2~4줄로 쓴다.
- 할 수 있는 조치: 다시 시도, 담당 교사에게 수동 작성 요청, 초안 보기(분량 바꿔 다시 만들기), 자료 관리에서 서류 확인, AI 키·사용량 확인
- 각 줄 60자 이내, "~해요" 체, 원인 이름과 건수를 앞에 둔다`,
    content: `규칙 요약:\n${rule.join("\n")}\n\n오류 문구(최대 20개):\n${errors.slice(0, 20).join("\n")}`,
  });
  if (!r.ok) return { lines: rule, label: "자동", error: r.error };
  const lines = r.data.lines.map((l) => l.trim()).filter(Boolean).slice(0, 4);
  return lines.length ? { lines, label: "AI" } : { lines: rule, label: "자동" };
}

// ---------- 프로그램 목록 "이번 주 할 일" ----------

/** 규칙으로 뽑은 할 일 목록을 한 문장으로. 학생 정보 없음 */
export async function weekTodoSentence(todos: string[]): Promise<{ text: string; label: "AI" | "자동"; error?: string }> {
  const fallback = todos.slice(0, 3).join(" · ") || "이번 주 급한 일이 없어요";
  if (!aiEnabled() || todos.length === 0) return { text: fallback, label: "자동" };
  const r = await aiJson(z.object({ text: z.string() }), {
    model: "fast",
    system: `너는 교사의 이번 주 할 일을 한 문장(70자 이내, "~해요" 체)으로 정리한다. 가장 급한 것부터, 프로그램 이름과 숫자를 살린다.`,
    content: todos.slice(0, 8).join("\n"),
  });
  if (!r.ok) return { text: fallback, label: "자동", error: r.error };
  return r.data.text.trim() ? { text: r.data.text.trim().slice(0, 120), label: "AI" } : { text: fallback, label: "자동" };
}
