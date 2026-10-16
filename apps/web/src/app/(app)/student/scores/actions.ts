"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { judgeMinimum, shortRule, sortExams, SUBJECT_LABEL, SUBJECTS } from "@/lib/domain/scores";
import { aiJson } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type TargetState = { error?: string; ok?: boolean };

const Target = z.object({
  university: z.string().trim().min(1).max(40),
  major: z.string().trim().min(1).max(40),
  ruleId: z.string().nullable(),
});

/** 목표 대학 (최대 3개). 기준 목록에서 고르거나 직접 쓰기 (직접 쓰면 판정 불가 → 담임이 기준을 추가하면 판정) */
export async function saveTargets(_: TargetState, form: FormData): Promise<TargetState> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { error: "학생만 정할 수 있어요" };
  let list: z.infer<typeof Target>[];
  try {
    list = z.array(Target).max(3).parse(JSON.parse(String(form.get("targets") ?? "[]")));
  } catch {
    return { error: "대학과 학과를 모두 써 주세요 (3개까지)" };
  }
  const rules = new Map((await repo.listMinRules()).map((r) => [r.id, r]));
  const rows = list.map((t, i) => {
    const r = t.ruleId ? rules.get(t.ruleId) : undefined;
    return r ? { rank: i + 1, university: r.university, major: r.major, ruleId: r.id } : { rank: i + 1, university: t.university, major: t.major, ruleId: null };
  });
  await repo.setStudentTargets(v.student.id, rows);
  await repo.audit(v.accountId, "scores.targets", v.student.pseudonymId);
  revalidatePath("/student/scores");
  revalidatePath("/homeroom/minimum");
  return { ok: true };
}

// ---------------------------------------------------------------- AI 성적 분석 (학생)

export type Analysis = { ok: true; summary: string; needs: string[]; plan: string[] } | { ok: false; error: string };

const AiOut = z.object({
  summary: z.string(),
  needs: z.array(z.string()).max(3),
  plan: z.array(z.string()).max(5),
});

/** 내 모의고사 추이와 목표 대학 기준을 보고 필요한 등급·공부 계획을 정리한다. 가명ID·등급만 보낸다 */
export async function analyzeMyScores(): Promise<Analysis> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const id = v.student.id;
  const [exams, scores, rules, targets] = await Promise.all([repo.listExams(), repo.listMockScores([id]), repo.listMinRules(), repo.listStudentTargets([id])]);
  const sorted = sortExams(exams).filter((e) => scores.some((s) => s.examId === e.id));
  if (!sorted.length) return { ok: false, error: "아직 모의고사 성적이 없어요" };
  const latest = scores.find((s) => s.examId === sorted[sorted.length - 1].id)!;
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const lines = sorted.map((e) => {
    const g = scores.find((s) => s.examId === e.id)!.grades;
    return `${e.month}월: ${SUBJECTS.map((k) => `${SUBJECT_LABEL[k]} ${g[k] ?? "결시"}`).join(", ")}`;
  });
  const tLines = targets.map((t) => {
    const r = t.ruleId ? ruleMap.get(t.ruleId) : null;
    const j = judgeMinimum(r, latest.grades);
    return `${t.rank}순위 ${t.university} ${t.major}: ${r ? shortRule(r) + (r.historyMax ? `, 한국사 ${r.historyMax} 이내` : "") : "기준 없음"} → ${j.status} (${j.reason})`;
  });
  const res = await aiJson(AiOut, {
    model: "fast",
    system:
      "고등학생 본인이 자기 모의고사 성적을 이해하도록 돕는다. 대신 공부해 주거나 꾸짖지 않는다. summary 는 추이 한 줄(50자 이내). needs 는 목표 대학 최저를 맞추려면 어느 과목을 몇 등급으로 올려야 하는지(각 40자 이내, 최대 3개, 기준이 없으면 빼기). plan 은 다음 모의고사까지 할 수 있는 구체적인 공부 계획(각 40자 이내, 3~5개). 해요체로 쓴다.",
    content: `학생 ${v.student.pseudonymId}\n모의고사(공통과목 등급):\n${lines.join("\n")}\n\n목표 대학:\n${tLines.join("\n") || "없음"}`,
  });
  if (!res.ok) return res;
  return { ok: true, summary: res.data.summary.slice(0, 80), needs: res.data.needs.map((x) => x.slice(0, 80)), plan: res.data.plan.map((x) => x.slice(0, 80)) };
}

export type PlanState = { error?: string; saved?: boolean };

/** 확인 후 공부 계획에 담기 (추가만) */
export async function saveStudyPlan(_: PlanState, form: FormData): Promise<PlanState> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { error: "학생만 쓸 수 있어요" };
  let items: string[];
  try {
    items = z.array(z.string().trim().min(1).max(100)).min(1).max(8).parse(JSON.parse(String(form.get("items") ?? "[]")));
  } catch {
    return { error: "담을 계획을 하나 이상 골라 주세요" };
  }
  await repo.addStudyPlan(v.student.id, items);
  revalidatePath("/student/scores");
  return { saved: true };
}
