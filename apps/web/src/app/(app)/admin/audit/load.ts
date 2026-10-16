import "server-only";
import { accountStatus, auditFlags, type AuditFlag, type AuditPeriod, type DailyCheckInput } from "@/lib/domain/accounts";
import { schoolYear } from "@/lib/domain/curriculum";
import { seats } from "@/lib/domain/offering";
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

/** 관리 홈 "오늘 점검" 재료: 초안 오류 · 계정 대기·잠김 · 최근 7일 이상 접근 · 정원 넘은 과목 */
export async function loadDailyCheck(): Promise<DailyCheckInput & { errorReasons: string[] }> {
  const now = new Date();
  const [jobs, accounts, students, week] = await Promise.all([
    repo.listDraftJobs({}), repo.adminListAccounts(), repo.listStudents(), loadAudit("week", "", true),
  ]);
  const pseudo = new Map(students.map((s) => [s.id, s.pseudonymId]));
  const errors = jobs.filter((j) => j.state === "ERROR");
  const overSubjects: string[] = [];
  for (const grade of [1, 2, 3]) {
    const round = await repo.offeringRound(schoolYear(), grade);
    if (!round) continue;
    const [offerings, counts] = await Promise.all([repo.offeringList(round.id), repo.offeringCounts(round.id)]);
    overSubjects.push(...offerings.filter((o) => (counts[o.id] ?? 0) > seats(o)).map((o) => `${grade}학년 ${o.subject}`));
  }
  return {
    errors: errors.length,
    waiting: accounts.filter((a) => accountStatus(a, now) === "대기").length,
    locked: accounts.filter((a) => accountStatus(a, now) === "잠김").length,
    flagged: week.rows.filter((r) => r.flag && r.flag !== "잠김").length,
    overSubjects,
    errorReasons: errors.map((j) => `${pseudo.get(j.studentId) ?? "학생"} ${j.error ?? `${j.attempts}회 실패`}`.slice(0, 120)),
  };
}
