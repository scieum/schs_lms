import "server-only";
import { today } from "@/lib/domain/activity";
import { counselStats } from "@/lib/domain/counsel";
import { daysLeft, ddayLabel, effectiveStatus, latestVersion, reviewStatus } from "@/lib/domain/program";
import type { BriefingInput } from "@/lib/domain/teacher-assist";
import type { Viewer } from "@/lib/domain/types";
import { loadAssigned, loadCounsel } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";

/** 오늘 브리핑 재료: 숫자와 프로그램 제목만 (학생 이름 없음) */
export async function loadBriefingInput(v: Viewer): Promise<BriefingInput> {
  if (v.kind !== "teacher") return { failed: 0, waiting: 0, dueSoon: [], noCounsel: 0 };
  const now = today();
  const programs = (await repo.listPrograms({ ownerId: v.accountId })).filter((p) => p.status !== "draft");
  const ids = programs.map((p) => p.id);
  const [waiting, jobs, versions, responses, assigned] = await Promise.all([
    repo.countDraftReviewQueue(v.accountId),
    ids.length ? repo.listDraftJobs({ programIds: ids }) : Promise.resolve([]),
    ids.length ? repo.listDraftVersions({ programIds: ids }) : Promise.resolve([]),
    Promise.all(programs.map((p) => repo.listResponses(p.id))),
    loadAssigned(v),
  ]);
  const records = await loadCounsel(v, assigned);
  const dueSoon = programs
    .map((p, i) => ({ p, submitted: responses[i].filter((r) => r.submittedAt).length }))
    .filter(({ p }) => effectiveStatus(p, now) === "open" && p.source !== "docs" && daysLeft(p.endDate, now) <= 7)
    .sort((a, b) => a.p.endDate.localeCompare(b.p.endDate))
    .map(({ p, submitted }) => ({ id: p.id, title: p.title, dday: ddayLabel(p.endDate, now), missing: p.targetIds.length - submitted }));
  const failed = jobs.filter((j) => j.state === "ERROR").length;
  const pending = jobs.filter((j) => reviewStatus(j, latestVersion(versions, j.id)) === "검토 대기").length;
  return { failed, waiting: Math.max(waiting, pending), dueSoon, noCounsel: counselStats(assigned.map((s) => s.id), records).none };
}
