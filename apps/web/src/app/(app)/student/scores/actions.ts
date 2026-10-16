"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { judgeMinimum, shortRule, sortExams, SUBJECT_LABEL, SUBJECTS, type SubjectKey } from "@/lib/domain/scores";
import { minimumNeedLine } from "@/lib/domain/student-assist";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
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

export type Analysis = { ok: true; summary: string; needs: string[]; plan: string[]; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

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
  const judged = targets.map((t) => {
    const r = t.ruleId ? ruleMap.get(t.ruleId) : null;
    return { t, r, j: judgeMinimum(r, latest.grades) };
  });
  const tLines = judged.map(({ t, r, j }) => `${t.rank}순위 ${t.university} ${t.major}: ${r ? shortRule(r) + (r.historyMax ? `, 한국사 ${r.historyMax} 이내` : "") : "기준 없음"} → ${j.status} (${j.reason})`);
  // 규칙: 최저까지 필요한 등급 문장 + 낮은 과목부터 공부 계획
  const ruleNeeds = judged.filter((x) => x.r).map(({ t, r, j }) => minimumNeedLine(`${t.university} ${t.major}`, r, j)).slice(0, 3);
  const weak = (["ko", "ma", "en", "t1", "t2"] as SubjectKey[])
    .filter((k) => latest.grades[k] !== null)
    .sort((a, b) => (latest.grades[b] ?? 0) - (latest.grades[a] ?? 0))
    .slice(0, 2);
  const fix = judged.find((x) => x.j.status === "근접")?.j.fixes[0];
  const rulePlan = [
    ...(fix ? [`${SUBJECT_LABEL[fix]} — 최저에 가장 가까워요. 기출 오답부터 다시 풀기`] : []),
    ...weak.filter((k) => k !== fix).map((k) => `${SUBJECT_LABEL[k]} ${latest.grades[k]}등급 — 지난 모의고사 틀린 문제 다시 풀기`),
    "모의고사 1주 전: 시간 재고 한 회 풀어 보기",
  ].slice(0, 4);
  const first = sorted[0].id === sorted[sorted.length - 1].id ? null : scores.find((s) => s.examId === sorted[0].id)!;
  const avg = (g: typeof latest.grades) => {
    const xs = (["ko", "ma", "en"] as SubjectKey[]).map((k) => g[k]).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const a0 = first ? avg(first.grades) : null;
  const a1 = avg(latest.grades);
  const ruleSummary = a1 === null ? "최근 모의고사 등급을 정리했어요" : a0 === null ? `국·수·영 평균 ${a1.toFixed(1)}등급이에요` : `국·수·영 평균 ${a0.toFixed(1)} → ${a1.toFixed(1)}등급`;
  const rule = { ok: true as const, summary: ruleSummary, needs: ruleNeeds, plan: rulePlan, label: "자동" as const };

  await repo.audit(v.accountId, "scores.ai.analysis", `${v.student.pseudonymId} ${aiEnabled() ? "AI" : "자동"}`);
  if (!aiEnabled()) return rule;
  const res = await aiJson(AiOut, {
    model: "fast",
    system:
      "고등학생 본인이 자기 모의고사 성적을 이해하도록 돕는다. 대신 공부해 주거나 꾸짖지 않는다. summary 는 추이 한 줄(50자 이내). needs 는 목표 대학 최저를 맞추려면 어느 과목을 몇 등급으로 올려야 하는지 해석 문장(각 50자 이내, 최대 3개, 기준이 없으면 빼기, '규칙 해석'을 참고하되 숫자를 바꾸지 않는다). plan 은 다음 모의고사까지 할 수 있는 구체적인 공부 계획(각 40자 이내, 3~5개). 해요체로 쓴다.",
    content: [
      `학생 ${v.student.pseudonymId}`,
      `모의고사(공통과목 등급):\n${lines.join("\n")}`,
      `목표 대학:\n${tLines.join("\n") || "없음"}`,
      `규칙 해석:\n${ruleNeeds.join("\n") || "없음"}`,
    ].join("\n\n"),
  });
  if (!res.ok) return { ...rule, note: "AI가 답하지 않아 규칙으로 정리했어요" };
  return { ok: true, summary: res.data.summary.slice(0, 80), needs: res.data.needs.map((x) => x.slice(0, 90)), plan: res.data.plan.map((x) => x.slice(0, 80)), label: "AI" };
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
