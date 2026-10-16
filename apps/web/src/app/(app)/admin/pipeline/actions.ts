"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
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
