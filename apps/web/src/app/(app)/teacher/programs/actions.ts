"use server";
import { today } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { weekTodos } from "@/lib/domain/program";
import { weekTodoSentence } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { programSummaries } from "./_lib/data";

export type WeekState = { text?: string; label?: "AI" | "자동"; error?: string; n?: number };

/** 프로그램 목록 "이번 주 할 일": 규칙으로 뽑은 할 일을 AI 가 한 문장으로 정리한다 (서버에서 다시 계산, 학생 정보 없음) */
export async function weekTodoAction(prev: WeekState, form: FormData): Promise<WeekState> {
  const v = await requireCan("program.manage");
  const all = form.get("all") === "1" && isAdmin(v);
  const summary = await programSummaries(await repo.listPrograms(all ? undefined : { ownerId: v.accountId }));
  const todos = weekTodos(summary.map((s) => ({ id: s.p.id, title: s.p.title, status: s.status, endDate: s.p.endDate, targets: s.p.targetIds.length, submitted: s.submitted, review: s.review, failed: s.failed, drafts: s.drafts })), today());
  const r = await weekTodoSentence(todos.map((x) => x.text));
  await repo.audit(v.accountId, "program.ai.week", `${todos.length}건 ${r.label}`);
  return { text: r.text, label: r.label, error: r.error, n: (prev.n ?? 0) + 1 };
}
