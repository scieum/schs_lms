"use server";
import type { DailyCheckItem } from "@/lib/domain/accounts";
import { dailyBrief, explainFlags } from "@/lib/server/ai/admin-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { readPeriod } from "./labels";
import { loadAudit, loadDailyCheck } from "./load";

export type BriefResult = { line: string; items: DailyCheckItem[]; label: "AI" | "자동"; note?: string };

/** A1 오늘 점검: 서버에서 다시 모아 요약한다. 학생은 가명ID만 */
export async function dailyBriefAction(): Promise<BriefResult> {
  const v = await requireCan("account.manage");
  const input = await loadDailyCheck();
  const r = await dailyBrief(input);
  await repo.audit(v.accountId, "admin.ai.daily", r.label);
  return { line: r.line, items: r.items, label: r.label, note: r.error ? "AI가 답하지 않아 규칙으로 정리했어요" : undefined };
}

export type FlagExplain = { lines: string[]; label: "AI" | "자동"; note?: string };

/** A5 이상 접근 설명: 규칙이 고른 기록만 보낸다. 사람 이름은 별칭으로 바꿔 보낸다 */
export async function explainFlagsAction(period: string): Promise<FlagExplain> {
  const v = await requireCan("audit.view");
  const p = readPeriod(period);
  const { rows } = await loadAudit(p, "", true);
  const flagged = rows.filter((r) => r.flag && r.flag !== "잠김").map((r) => ({ actor: r.actor, label: r.label, target: r.target, at: r.at, flag: r.flag! }));
  const r = await explainFlags(flagged);
  await repo.audit(v.accountId, "audit.ai.explain", `${p} ${flagged.length}건 ${r.label}`);
  return { lines: r.lines.length ? r.lines : ["이 기간에 대량·야간 열람이 없어요"], label: r.label, note: r.error ? "AI가 답하지 않아 규칙으로 정리했어요" : undefined };
}
