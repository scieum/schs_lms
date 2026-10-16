import "server-only";
import { z } from "zod";
import { md, sentences, type Program, type Question } from "@/lib/domain/program";
import { aiEnabled, aiJson, fileBlock, type AiResult } from "./claude";

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
