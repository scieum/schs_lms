import "server-only";
import type { Student } from "@/lib/domain/types";
import { briefingLine, pickBriefing, type BriefInput, type BriefPick } from "@/lib/domain/homeroom";
import { addDays, seoulNow } from "@/lib/domain/night";
import { repo } from "@/lib/server/repo";

/** 우리 반 브리핑의 규칙 계산 (담임 홈 H1). 최저·야자 4주·정정 요청·최근 14일 초안 */
export async function briefingInputs(mine: Student[]): Promise<{ inputs: BriefInput[]; picks: BriefPick[]; line: string }> {
  const ids = mine.map((s) => s.id);
  const today = seoulNow().date;
  const [scores, att, corrections, drafts] = await Promise.all([
    repo.scoresClassSummary(ids),
    repo.listNightAttendance(addDays(today, -27), today, ids),
    repo.listCorrectionRequests(ids),
    repo.listDraftsForStudents(ids),
  ]);
  const since = addDays(today, -14);
  const inputs: BriefInput[] = mine.map((s) => {
    const sc = scores.find((r) => r.studentId === s.id);
    return {
      studentId: s.id,
      verdict: sc?.verdict ?? null,
      verdictReason: sc?.reason ?? null,
      absences: att.filter((a) => a.studentId === s.id && a.status !== "출석"),
      pendingCorrections: corrections.filter((c) => c.studentId === s.id && c.status !== "done").length,
      newDrafts: drafts.filter((d) => d.studentId === s.id && d.finalizedAt.slice(0, 10) >= since).length,
    };
  });
  const picks = pickBriefing(inputs);
  const line = briefingLine(picks, {
    near: inputs.filter((x) => x.verdict === "근접").length,
    pendingFix: corrections.filter((c) => c.status !== "done").length,
  });
  return { inputs, picks, line };
}
