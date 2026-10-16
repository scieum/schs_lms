"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { aiEnabled } from "@/lib/server/ai/claude";
import { errorAdvice, summarizeErrors } from "@/lib/domain/program";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
import { adviseErrors } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

const refresh = () => {
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/errors");
  revalidatePath("/teacher/drafts");
};

/** 다시 시도: jobId 하나, 또는 비우면 실패한 작업 전부. 재시도 횟수를 처음으로 돌린다 */
export async function retryDrafts(form: FormData) {
  const v = await requireCan("pipeline.view");
  const one = String(form.get("jobId") ?? "");
  const failed = await repo.listDraftJobs({ states: ["ERROR"] });
  const ids = (one ? failed.filter((j) => j.id === one) : failed).map((j) => j.id);
  if (!ids.length) return;
  for (const id of ids) await resetDraftJob(id);
  await repo.audit(v.accountId, "pipeline.retry", `${ids.length}건`);
  if (aiEnabled()) after(() => runDraftJobs(ids));
  else await runDraftJobs(ids);
  refresh();
}

/** 담당 교사에게 수동 작성 요청: 표시만 남긴다 (교사 초안 검토 목록에 "수동 작성 요청") */
export async function requestManual(form: FormData) {
  const v = await requireCan("pipeline.view");
  const job = await repo.getDraftJob(String(form.get("jobId") ?? ""));
  if (!job || job.state !== "ERROR") return;
  await repo.updateDraftJob(job.id, { manualRequestedAt: new Date().toISOString() });
  const s = await repo.getStudent(job.studentId);
  await repo.audit(v.accountId, "pipeline.manual", `${job.programId} ${s?.pseudonymId ?? ""}`);
  refresh();
}

export type AdviceState = { lines?: string[]; label?: "AI" | "자동"; error?: string; n?: number };

/** A4·오류 처리 "해결 제안": 실패 원인 요약(규칙) → AI 가 조치 문장으로 다듬는다. 학생 정보는 보내지 않는다. 화면 표시만 */
export async function adviseAction(prev: AdviceState): Promise<AdviceState> {
  const v = await requireCan("pipeline.view");
  const n = (prev.n ?? 0) + 1;
  const failed = await repo.listDraftJobs({ states: ["ERROR"] });
  if (failed.length === 0) return { lines: [], label: "자동", n };
  const errors = failed.map((j) => j.error ?? "생성 실패");
  const r = await adviseErrors(errorAdvice(summarizeErrors(errors)), errors);
  await repo.audit(v.accountId, "pipeline.ai.advice", `${failed.length}건 ${r.label}`);
  return { lines: r.lines, label: r.label, error: r.error, n };
}
