import { redirect } from "next/navigation";
import { latestVersion, reviewStatus } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

type Props = { searchParams: Promise<{ program?: string; d?: string; tab?: string; check?: string }> };

/**
 * 옛 주소 (N52): 초안 검토는 이제 프로그램 안 탭 /teacher/programs/<id>/drafts.
 * d · program 이 있으면 그 프로그램으로, 없으면 검토할 초안이 남은 첫 프로그램으로, 그것도 없으면 프로그램 목록으로 넘긴다.
 * 권한은 넘어간 페이지가 판정한다.
 */
export default async function OldDraftsPage({ searchParams }: Props) {
  const v = await requireCan("draft.review");
  const q = await searchParams;
  const keep = new URLSearchParams();
  for (const k of ["d", "tab", "check"] as const) if (q[k]) keep.set(k, q[k]!);
  const to = (programId: string) => redirect(`/teacher/programs/${programId}/drafts${keep.size ? `?${keep}` : ""}`);

  if (q.d) {
    const j = await repo.getDraftJob(q.d);
    if (j) to(j.programId);
  }
  if (q.program) to(q.program);

  const programs = (await repo.listPrograms({ ownerId: v.accountId })).sort((a, b) => a.title.localeCompare(b.title, "ko"));
  const ids = programs.map((p) => p.id);
  const [jobs, versions] = ids.length ? await Promise.all([repo.listDraftJobs({ programIds: ids }), repo.listDraftVersions({ programIds: ids })]) : [[], []];
  const waiting = new Set(jobs.filter((j) => ["검토 대기", "생성 실패"].includes(reviewStatus(j, latestVersion(versions, j.id)))).map((j) => j.programId));
  const first = programs.find((p) => waiting.has(p.id));
  if (first) to(first.id);
  redirect("/teacher/programs");
}
