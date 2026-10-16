import "server-only";
import { auditFlags, type AuditFlag, type AuditPeriod } from "@/lib/domain/accounts";
import { repo } from "@/lib/server/repo";
import { actionLabel, periodStart } from "./labels";

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  label: string;
  target: string | null;
  flag: AuditFlag | null;
}

export const AUDIT_LIMIT = 2000;

/** 기간 안의 감사 로그 + 행위자 이름 + 이상 표시. q 는 사람·행동·대상에서 찾는다 */
export async function loadAudit(period: AuditPeriod, q: string, onlyFlagged = false): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const since = periodStart(period, new Date()).toISOString();
  const [entries, teachers, students] = await Promise.all([repo.adminListAuditSince(since, AUDIT_LIMIT), repo.listTeachers(), repo.listStudents()]);
  const names = new Map<string, string>([
    ...teachers.map((t) => [t.id, t.name] as const),
    ...students.map((s) => [s.id, `학생 ${s.pseudonymId}`] as const),
  ]);
  const flags = auditFlags(entries);
  const rows = entries
    .map((e) => ({
      id: e.id, at: e.at, actor: e.actorId ? names.get(e.actorId) ?? "알 수 없음" : "시스템",
      action: e.action, label: actionLabel(e.action), target: e.target, flag: flags.get(e.id) ?? null,
    }))
    .filter((r) => !onlyFlagged || r.flag)
    .filter((r) => !q || r.actor.includes(q) || r.label.includes(q) || r.action.includes(q) || (r.target ?? "").includes(q));
  return { rows, truncated: entries.length >= AUDIT_LIMIT };
}
