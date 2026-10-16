import "server-only";
import { programGates, programStage, type Stage } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { programRows } from "../../teacher/programs/_lib/data";

export const STAGES: Stage[] = ["S1", "S2", "S3", "S4", "S5"];

/** 발행된 프로그램별 학생 단계 + 전체 단계별 학생 수 (A1 관리 홈 · A4 초안 생성 현황 공용) */
export async function loadPipeline() {
  const programs = (await repo.listPrograms()).filter((p) => p.status !== "draft");
  const all = await Promise.all(programs.map((p) => programRows(p)));
  const per = programs.map((p, i) => {
    const stages = all[i].rows.map((r) => r.stage);
    const hasError = all[i].rows.some((r) => r.review === "생성 실패");
    const finalized = stages.filter((s) => s === "S4" || s === "S5").length;
    return { p, stages, stage: programStage(stages), gates: programGates(stages, hasError), pct: stages.length ? (finalized / stages.length) * 100 : 0 };
  });
  const stageCount = Object.fromEntries(STAGES.map((s) => [s, per.reduce((n, x) => n + x.stages.filter((y) => y === s).length, 0)])) as Record<Stage, number>;
  // 가장 많이 몰린 앞 단계(수집·초안·검사)를 강조한다
  const busy = (["S1", "S2", "S3"] as Stage[]).reduce((a, b) => (stageCount[b] > stageCount[a] ? b : a), "S2" as Stage);
  return { per, stageCount, busy };
}
