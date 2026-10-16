"use server";
import { homeroomStudents } from "@/lib/domain/activity";
import { serviceCheck, serviceTotals } from "@/lib/domain/homeroom";
import { seoulNow } from "@/lib/domain/night";
import { serviceLine } from "@/lib/server/ai/homeroom-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type ServiceLineResult = { ok: true; line: string; source: "AI" | "자동"; error?: string } | { ok: false; error: string };

/** 봉사 누적 한 줄: 규칙(평균·0시간·오래 기다린 확인서) + AI 한 줄. 가명ID·시간만 보낸다. 저장하지 않는다 */
export async function serviceSummary(): Promise<ServiceLineResult> {
  const v = await requireCan("service.receive");
  const mine = homeroomStudents(v, await repo.listStudents());
  if (!mine.length) return { ok: false, error: "담임 반 학생이 없어요" };
  const records = await repo.listServiceRecords({ studentIds: mine.map((s) => s.id) });
  const totals = serviceTotals(mine.map((s) => s.id), records);
  const check = serviceCheck(totals, records, seoulNow().date);
  const pid = new Map(mine.map((s) => [s.id, s.pseudonymId]));
  const r = await serviceLine(totals.map((t) => ({ pid: pid.get(t.studentId)!, confirmed: t.confirmed, waiting: t.waiting })), check.text);
  if (r.label === "AI") await repo.audit(v.accountId, "service.ai.summary", `${mine.length}명`);
  return { ok: true, line: r.line, source: r.label, error: r.error };
}
