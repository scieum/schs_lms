"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiJson } from "@/lib/server/ai/claude";
import { loadMyRecords } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type CorrectionState = { error?: string; sent?: number };

const Schema = z.object({
  recordId: z.string().min(1, "고칠 기록을 골라 주세요"),
  reason: z.string().trim().min(5, "5자 이상 써 주세요").max(500, "500자까지 쓸 수 있어요"),
});

/** 정정 요청: 담임에게 요청만 남긴다. 기록은 선생님만 고친다 */
export async function requestCorrection(prev: CorrectionState, form: FormData): Promise<CorrectionState> {
  const v = await requireCan("student.self");
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const rec = (await loadMyRecords(v)).find((r) => r.id === p.data.recordId);
  if (!rec) return { error: "내 확정 기록만 요청할 수 있어요" };
  await repo.addCorrectionRequest({ studentId: v.accountId, recordId: rec.id, reason: p.data.reason });
  await repo.audit(v.accountId, "record.correction", v.kind === "student" ? v.student.pseudonymId : null);
  revalidatePath("/student/record");
  return { sent: (prev.sent ?? 0) + 1 };
}

const KeywordSchema = z.object({
  keywords: z.array(z.string()).describe("기록에서 보이는 핵심 키워드 3~5개"),
  topics: z.array(z.string()).describe("이어서 탐구하면 좋을 주제 1~3개"),
});

export type KeywordResult = { ok: true; keywords: string[]; topics: string[] } | { ok: false; error: string };

/** AI 기록 요약: 그 학년 확정 기록 → 키워드·이어갈 주제. 가명ID만 보낸다 */
export async function summarizeMyRecord(grade: number): Promise<KeywordResult> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const records = (await loadMyRecords(v)).filter((r) => r.grade === grade);
  if (!records.length) return { ok: false, error: "요약할 확정 기록이 없어요" };
  const r = await aiJson(KeywordSchema, {
    model: "fast",
    system: "고등학생이 자기 생활기록부 확정 기록을 한눈에 보도록 핵심 키워드와 이어갈 주제를 뽑는다. 짧은 명사구로 쓴다.",
    content: `학생: ${v.student.pseudonymId}\n기록:\n${records.map((x) => `[${x.area} ${x.title}] ${x.content}`).join("\n")}`,
  });
  await repo.audit(v.accountId, "record.ai_keywords", v.student.pseudonymId);
  if (!r.ok) return r;
  return { ok: true, keywords: r.data.keywords.slice(0, 5), topics: r.data.topics.slice(0, 3) };
}
