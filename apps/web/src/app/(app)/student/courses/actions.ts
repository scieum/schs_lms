"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { careerPicks, checkApplication, problemMessage, type ComboNote } from "@/lib/domain/offering";
import { schoolYear } from "@/lib/domain/curriculum";
import { aiJson } from "@/lib/server/ai/claude";
import { checkCombo } from "@/lib/server/ai/student-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type ApplyState = { error?: string; done?: string };

async function myRound() {
  const v = await requireCan("student.self");
  if (v.kind !== "student") throw new Error("학생만 신청해요");
  const round = await repo.offeringRound(schoolYear(), v.student.grade);
  return { v, student: v.student, round };
}

/** 신청하기: 학점 한도·정원·마감을 다시 검사하고 통째로 바꾼다 */
export async function applyCourses(_: ApplyState, form: FormData): Promise<ApplyState> {
  const { student, round } = await myRound();
  if (!round) return { error: "열린 과목 신청이 없어요" };
  const picked = [...new Set(form.getAll("id").map(String))].slice(0, 30);
  const [offerings, counts, mine] = await Promise.all([
    repo.offeringList(round.id), repo.offeringCounts(round.id), repo.offeringChoicesOf(round.id, student.id),
  ]);
  const problems = checkApplication({ round, offerings, picked, mine, counts, now: new Date() });
  if (problems.length) return { error: problemMessage(problems[0]) };
  try {
    await repo.offeringApply(round.id, student.id, picked);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return { error: m.startsWith("full:") ? `${m.slice(5)}은(는) 방금 자리가 찼어요` : "신청하지 못했어요. 다시 해 주세요" };
  }
  await repo.audit(student.id, "offering.apply", `${student.pseudonymId} ${picked.length}과목`);
  revalidatePath("/student/courses");
  const credits = offerings.filter((o) => picked.includes(o.id)).reduce((n, o) => n + o.credits, 0);
  return { done: picked.length ? `${picked.length}과목 ${credits}학점 신청했어요` : "신청을 모두 뺐어요" };
}

export type Recommend = { ok: true; ids: string[]; reason: string; label: "AI" | "자동" } | { ok: false; error: string };

const RecSchema = z.object({
  subjects: z.array(z.string()).max(4),
  reason: z.string().max(80),
});

/** 진로 맞춤 과목: 희망 진로와 열린 과목 이름만 보낸다 (이름·학번 X). AI가 꺼져 있으면 규칙으로 고른다 */
export async function recommendCourses(): Promise<Recommend> {
  const { student, round } = await myRound();
  if (!round) return { ok: false, error: "열린 과목 신청이 없어요" };
  const goal = student.careerGoal?.trim();
  if (!goal) return { ok: false, error: "희망 진로가 없어요. 담임 선생님께 알려 주세요" };
  const offerings = await repo.offeringList(round.id);

  const ai = await aiJson(RecSchema, {
    model: "fast",
    system: "고등학생 과목 선택 도우미. 희망 진로에 도움이 되는 과목을 열린 과목 목록에서만 2~3개 고른다. 이유는 40자 안의 한 문장.",
    content: `희망 진로: ${goal.slice(0, 40)}\n열린 과목: ${offerings.map((o) => `${o.subject}(${o.field}, ${o.credits}학점)`).join(", ")}`,
  });
  await repo.audit(student.id, "offering.ai.recommend", `${student.pseudonymId} ${ai.ok ? "AI" : "자동"}`);
  if (ai.ok) {
    const ids = ai.data.subjects.map((s) => offerings.find((o) => o.subject === s.trim())?.id).filter((x): x is string => !!x);
    if (ids.length) return { ok: true, ids: [...new Set(ids)], reason: ai.data.reason, label: "AI" };
  }
  const ids = careerPicks(goal, offerings);
  if (!ids.length) return { ok: false, error: "진로에 맞는 과목을 찾지 못했어요" };
  return { ok: true, ids, reason: `${goal} 희망 — 먼저 볼 과목이에요`, label: "자동" };
}

export type ComboResult = { ok: true; notes: ComboNote[]; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

/** 고른 과목 조합 점검: 진로 연계·학점·분야 쏠림. 희망 진로·과목 이름만 보낸다 (이름·학번 X). 저장하지 않는다 */
export async function checkMyCombo(ids: string[]): Promise<ComboResult> {
  const { student, round } = await myRound();
  if (!round) return { ok: false, error: "열린 과목 신청이 없어요" };
  const all = await repo.offeringList(round.id);
  const want = new Set(ids.slice(0, 30));
  const picked = all.filter((o) => want.has(o.id));
  if (!picked.length) return { ok: false, error: "과목을 먼저 담아 주세요" };
  const r = await checkCombo({ picked, all, maxCredits: round.maxCredits, careerGoal: student.careerGoal?.trim() || null });
  await repo.audit(student.id, "offering.ai.combo", `${student.pseudonymId} ${picked.length}과목 ${r.label}`);
  return { ok: true, notes: r.notes, label: r.label, note: r.error ? "AI가 답하지 않아 규칙으로 점검했어요" : undefined };
}
