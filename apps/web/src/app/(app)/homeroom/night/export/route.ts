import type { NextRequest } from "next/server";
import { classScope } from "@/components/scores/scope";
import { can } from "@/lib/domain/policy";
import { cellStatus, dayLabel, seoulNow, SESSION_LABEL, weekDays } from "@/lib/domain/night";
import { repo } from "@/lib/server/repo";
import { buildTable, xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer } from "@/lib/server/viewer";

const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// 이번 주 야자 출석 엑셀
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v || !can(v, "night.manage")) return text("권한이 없어요", 403);
  const scope = await classScope(v, req.nextUrl.searchParams.get("class") ?? undefined);
  if (!scope) return text("담임 반이 없어요", 404);
  const days = weekDays(seoulNow().date);
  const ids = scope.students.map((s) => s.id);
  const [signups, att] = await Promise.all([repo.listNightSignups(days[0], days[4], ids), repo.listNightAttendance(days[0], days[4], ids)]);
  const rows: (string | number | null)[][] = [];
  for (const s of scope.students) {
    for (const d of days) {
      const su = signups.find((x) => x.studentId === s.id && x.date === d);
      if (!su || su.status !== "신청") continue;
      const st = (p: 1 | 2) => cellStatus(su, att.find((a) => a.studentId === s.id && a.date === d && a.period === p), p);
      rows.push([s.number, s.name, dayLabel(d), SESSION_LABEL[su.session], su.place, st(1), st(2)]);
    }
  }
  await repo.audit(v.accountId, "night.export", `${scope.key} ${days[0]}`);
  const data = await buildTable("야자 출석", ["번호", "이름", "날짜", "시간", "장소", "1교시", "2교시"], rows, [7, 10, 12, 14, 10, 8, 8]);
  return xlsxResponse(data, `night_${scope.key}_${days[0]}.xlsx`, `${scope.grade}학년${scope.classNo}반_야자출석_${days[0]}.xlsx`);
}
