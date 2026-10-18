import type { NextRequest } from "next/server";
import { classScope } from "@/components/scores/scope";
import { can } from "@/lib/domain/policy";
import { buildScoreTemplate, xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer, lockedAction } from "@/lib/server/viewer";

// 성적 양식 내려받기 (번호·이름은 우리 반 명단으로 미리 채움)
export async function GET(req: NextRequest) {
  if (lockedAction("scores.upload")) return new Response("잠긴 기능이에요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const v = await getViewer();
  if (!v || v.mustChangePassword || !can(v, "scores.upload")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const scope = await classScope(v, req.nextUrl.searchParams.get("class") ?? undefined);
  if (!scope) return new Response("담임 반이 없어요", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const data = await buildScoreTemplate(scope.students.map((s) => ({ number: s.number, name: s.name })));
  return xlsxResponse(data, `scores_${scope.key}.xlsx`, `${scope.grade}학년${scope.classNo}반_성적_양식.xlsx`);
}
