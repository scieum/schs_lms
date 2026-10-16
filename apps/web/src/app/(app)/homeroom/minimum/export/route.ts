import type { NextRequest } from "next/server";
import { classScope } from "@/components/scores/scope";
import { can } from "@/lib/domain/policy";
import { judgeMinimum, shortRule, SUBJECT_LABEL, SUBJECTS } from "@/lib/domain/scores";
import { repo } from "@/lib/server/repo";
import { buildTable, xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer } from "@/lib/server/viewer";

const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// 판정 결과 내려받기 (반 학생 × 목표 대학 전부)
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v || !can(v, "minimum.view")) return text("권한이 없어요", 403);
  const sp = req.nextUrl.searchParams;
  const scope = await classScope(v, sp.get("class") ?? undefined);
  if (!scope) return text("담임 반이 없어요", 404);
  const exam = (await repo.listExams()).find((e) => e.id === sp.get("exam"));
  if (!exam) return text("시험을 찾지 못했어요", 404);
  const ids = scope.students.map((s) => s.id);
  const [scores, rules, targets] = await Promise.all([repo.listMockScores(ids), repo.listMinRules(), repo.listStudentTargets(ids)]);
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const rows: (string | number | null)[][] = [];
  for (const s of scope.students) {
    const g = scores.find((x) => x.studentId === s.id && x.examId === exam.id)?.grades ?? null;
    const mine = targets.filter((t) => t.studentId === s.id).sort((a, b) => a.rank - b.rank);
    const base = [s.number, s.name, ...SUBJECTS.map((k) => g?.[k] ?? null)];
    if (!mine.length) rows.push([...base, "", "", "", "판정 불가", "목표 대학이 없어요"]);
    for (const t of mine) {
      const rule = t.ruleId ? ruleMap.get(t.ruleId) : null;
      const j = judgeMinimum(rule, g);
      rows.push([...base, t.rank, `${t.university} ${t.major}`, rule ? shortRule(rule) : "기준 없음", j.status, j.reason]);
    }
  }
  await repo.audit(v.accountId, "minimum.export", `${scope.key} ${exam.name}`);
  const data = await buildTable(
    `${exam.name} 최저 판정`,
    ["번호", "이름", ...SUBJECTS.map((k) => SUBJECT_LABEL[k]), "순위", "목표 대학·학과", "기준", "판정", "설명"],
    rows,
    [7, 10, 7, 7, 7, 8, 8, 8, 6, 20, 16, 10, 30],
  );
  return xlsxResponse(data, `minimum_${scope.key}.xlsx`, `${scope.grade}학년${scope.classNo}반_${exam.name}_최저판정.xlsx`);
}
