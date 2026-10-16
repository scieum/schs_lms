"use server";
import { forecastDemand, isClosed, offeringStats } from "@/lib/domain/offering";
import { explainDemand } from "@/lib/server/ai/admin-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type DemandExplain = { ok: true; line: string; label: "AI" | "자동" } | { ok: false; error: string };

/** A6 신청 예측: 지금 신청 비율로 마감 때 인원을 어림하고, 키가 있으면 AI 가 설명한다. 과목·인원 숫자만 보낸다 */
export async function explainDemandAction(roundId: string): Promise<DemandExplain> {
  const v = await requireCan("offering.manage");
  const round = await repo.offeringGetRound(roundId);
  if (!round) return { ok: false, error: "신청을 찾지 못했어요" };
  const [offerings, counts, applicants, students] = await Promise.all([
    repo.offeringList(round.id), repo.offeringCounts(round.id), repo.offeringApplicants(round.id), repo.listStudents(),
  ]);
  const eligible = students.filter((s) => s.grade === round.grade).length;
  const now = new Date();
  const closed = isClosed(round.deadline, now);
  const forecast = closed ? forecastDemand(offerings, counts, eligible, eligible) : forecastDemand(offerings, counts, applicants, eligible);
  const daysLeft = Math.max(0, Math.ceil((new Date(`${round.deadline}T00:00:00+09:00`).getTime() + 86400000 - now.getTime()) / 86400000));
  const r = await explainDemand({ grade: round.grade, daysLeft, rate: offeringStats(offerings, counts, applicants, eligible).rate, forecast });
  await repo.audit(v.accountId, "offering.ai.forecast", `${round.grade}학년 ${round.semester}학기 ${r.label}`);
  return { ok: true, line: r.line, label: r.label };
}
