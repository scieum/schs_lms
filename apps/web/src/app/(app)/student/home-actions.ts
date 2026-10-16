"use server";
import { today } from "@/lib/domain/activity";
import type { TodoStep } from "@/lib/domain/student-assist";
import { planToday } from "@/lib/server/ai/student-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { myTodoInputs } from "./_lib/todos";

export type PlanResult = { ok: true; steps: TodoStep[]; line: string; label: "AI" | "자동"; note?: string } | { ok: false; error: string };

/** S1 할 일 정리: 마감·분량·야자·과목 신청 → 오늘 순서 3개. 제목·마감·진행만 보낸다 (이름·학번 X) */
export async function planMyDay(): Promise<PlanResult> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return { ok: false, error: "학생만 쓸 수 있어요" };
  const t = today();
  const items = await myTodoInputs(v.student, t);
  const r = await planToday(items, t);
  await repo.audit(v.accountId, "student.ai.todo", `${v.student.pseudonymId} ${r.label}`);
  return { ok: true, steps: r.steps, line: r.line, label: r.label, note: r.error ? "AI가 답하지 않아 규칙으로 정리했어요" : undefined };
}
