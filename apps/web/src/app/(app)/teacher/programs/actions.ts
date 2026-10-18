"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { latestVersion, reviewStatus } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "./_lib/data";
import { generateDrafts, type GenState } from "./[id]/actions";

const refresh = (programId: string) => {
  revalidatePath("/teacher/programs");
  revalidatePath(`/teacher/programs/${programId}`);
  revalidatePath("/teacher/drafts");
};

/** 목록 카드 "초안 만들기": 상세와 같은 동작 + 목록도 새로 */
export async function generateFromList(prev: GenState, form: FormData): Promise<GenState> {
  const r = await generateDrafts(prev, form);
  refresh(String(form.get("programId") ?? ""));
  return r;
}

/** 목록 카드 "다시 만들기 k": 이 프로그램의 생성 실패 초안만 처음부터 다시 */
export async function retryFailedFromList(prev: GenState, form: FormData): Promise<GenState> {
  const n = (prev.n ?? 0) + 1;
  const { v, program } = await requireProgram(String(form.get("programId") ?? ""), "draft.review");
  const [jobs, versions] = await Promise.all([repo.listDraftJobs({ programIds: [program.id] }), repo.listDraftVersions({ programIds: [program.id] })]);
  const ids = jobs
    .filter((j) => program.targetIds.includes(j.studentId) && reviewStatus(j, latestVersion(versions, j.id)) === "생성 실패")
    .map((j) => j.id);
  if (ids.length === 0) return { error: "다시 만들 초안이 없어요", n };
  await Promise.all(ids.map((id) => resetDraftJob(id)));
  await repo.audit(v.accountId, "pipeline.retry", `${program.id} ${ids.length}건`);
  if (aiEnabled()) {
    after(() => runDraftJobs(ids));
    refresh(program.id);
    return { started: `${ids.length}건 다시 만드는 중이에요`, n };
  }
  const r = await runDraftJobs(ids);
  refresh(program.id);
  return { started: `${r.done}건 다시 만들었어요${r.failed ? ` · 실패 ${r.failed}건` : ""}`, n };
}
