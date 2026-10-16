"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canReadCounsel, COUNSEL_AREAS, isCounselArea } from "@/lib/domain/counsel";
import { scrubIdentity } from "@/lib/domain/writing";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
import { nextCounselQuestions } from "@/lib/server/ai/teacher-ai";
import { loadAssigned, loadCounsel } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type CounselState = { error?: string; saved?: number };

const Schema = z.object({
  studentId: z.string().min(1),
  area: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  content: z.string().trim().min(5, "5자 이상 써 주세요").max(2000, "2000자까지 쓸 수 있어요"),
  prevId: z.string().optional(),
});

/** 상담 기록 추가. 고칠 때도 새 버전을 추가한다 (C4) */
export async function addCounselRecord(prev: CounselState, form: FormData): Promise<CounselState> {
  const v = await requireCan("counsel.write");
  const p = Schema.safeParse({ ...Object.fromEntries(form), prevId: form.get("prevId") || undefined });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { studentId, area, date, content, prevId } = p.data;
  if (!isCounselArea(area)) return { error: "영역을 골라 주세요" };

  const student = (await loadAssigned(v)).find((s) => s.id === studentId);
  if (!student) return { error: "담당 학생만 기록할 수 있어요" };
  if (prevId) {
    const old = (await repo.listCounsel({ studentIds: [studentId] })).find((r) => r.id === prevId);
    if (!old || old.authorId !== v.accountId) return { error: "내가 쓴 기록만 고칠 수 있어요" };
  }
  await repo.addCounsel({ studentId, authorId: v.accountId, area, date, content, prevId: prevId ?? null });
  await repo.audit(v.accountId, prevId ? "counsel.revise" : "counsel.add", student.pseudonymId);
  revalidatePath("/teacher/counseling");
  revalidatePath(`/homeroom/students/${studentId}`);
  return { saved: (prev.saved ?? 0) + 1 };
}

export type SummaryResult = { ok: true; summary: string; topics: string[]; label?: "AI" | "자동"; notice?: string } | { ok: false; error: string };

const SummarySchema = z.object({
  summary: z.string().describe("상담 흐름 요약 한두 문장"),
  topics: z.array(z.string()).describe("다음 상담에서 이야기할 주제 1~3개"),
});

/** 담당 학생 + 볼 수 있는 상담 기록(최신순). 기록 속 이름·학번은 가린다 */
async function readable(studentId: string) {
  const v = await requireCan("counsel.write");
  const student = (await loadAssigned(v)).find((s) => s.id === studentId);
  if (!student) return null;
  const records = (await loadCounsel(v, [student]))
    .filter((r) => canReadCounsel(v, r, student))
    .map((r) => ({ date: r.date, area: r.area, content: scrubIdentity(r.content, student, student.pseudonymId).text }));
  return { v, student, records };
}

/** 키가 없을 때: 최근 기록 한 줄 + 아직 다루지 않은 영역 */
function summaryRule(records: { date: string; area: string; content: string }[]): { summary: string; topics: string[] } {
  const last = records[0];
  const done = new Set(records.map((r) => r.area));
  return {
    summary: `상담 ${records.length}건 · 최근 ${last.date} ${last.area}: ${last.content.replace(/\s+/g, " ").slice(0, 60)}`,
    topics: COUNSEL_AREAS.filter((a) => !done.has(a)).map((a) => `${a} 상담`).slice(0, 3),
  };
}

/** AI 상담 요약: 볼 수 있는 기록만, 가명ID로 보낸다. 저장하지 않는다 */
export async function summarizeCounsel(studentId: string): Promise<SummaryResult> {
  const ctx = await readable(studentId);
  if (!ctx) return { ok: false, error: "담당 학생만 요약할 수 있어요" };
  const { v, student, records } = ctx;
  if (!records.length) return { ok: false, error: "요약할 상담 기록이 없어요" };
  if (!aiEnabled()) return { ok: true, ...summaryRule(records), label: "자동" };
  const text = records.map((r) => `- ${r.date} [${r.area}] ${r.content}`).join("\n");
  const r = await aiJson(SummarySchema, {
    model: "fast",
    system: "고등학교 교사의 상담 기록을 읽고, 상담 흐름을 짧게 요약하고 다음 상담 주제를 제안한다. 존댓말 대신 '~함' 체로 짧게 쓴다.",
    content: `학생: ${student.pseudonymId}\n상담 기록:\n${text}`,
  });
  await repo.audit(v.accountId, "counsel.ai_summary", student.pseudonymId);
  if (!r.ok) return { ok: true, ...summaryRule(records), label: "자동", notice: `AI 대신 최근 기록으로 정리했어요 (${r.error})` };
  return { ok: true, summary: scrubIdentity(r.data.summary, student).text.replaceAll(student.pseudonymId, "학생"), topics: r.data.topics.slice(0, 3), label: "AI" };
}

/** 다음 상담 질문 추천: 최근 상담 기록 → 물어볼 질문 3개. 저장하지 않는다 */
export async function suggestCounselQuestions(studentId: string): Promise<SummaryResult> {
  const ctx = await readable(studentId);
  if (!ctx) return { ok: false, error: "담당 학생만 볼 수 있어요" };
  const { v, student, records } = ctx;
  const r = await nextCounselQuestions(student.pseudonymId, records);
  if (r.label === "AI") await repo.audit(v.accountId, "counsel.ai.questions", student.pseudonymId);
  const clean = (t: string) => scrubIdentity(t, student).text.replaceAll(student.pseudonymId, "학생");
  return {
    ok: true,
    summary: clean(r.data.line),
    topics: r.data.questions.map(clean),
    label: r.label,
    notice: r.error ? `AI 대신 기본 질문을 골랐어요 (${r.error})` : undefined,
  };
}
