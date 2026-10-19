import { can } from "@/lib/domain/policy";
import { parseCols, parseWho } from "@/lib/domain/records-export";
import { mySetukScopes, scopeFileName, type ClassScopeInput } from "@/lib/server/class-scope";
import { recordsWorkbook } from "@/lib/server/class-write";
import { repo } from "@/lib/server/repo";
import { xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer } from "@/lib/server/viewer";

// 엑셀로 받기 (Figma N42 ②): 세특 분반 하나(scope=one) 또는 내 분반 모두(scope=all, 분반마다 시트) + 요약 시트.
// ?course=&section=&scope=one|all&who=all|confirmed|draft&cols=학번,이름,… — 권한은 JSON 내보내기와 같은 담당 확인. 감사에는 범위 · 학생 수 · 열 수만.
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.mustChangePassword || !can(v, "setuk.write")) return text("권한이 없어요", 403);
  const q = new URL(req.url).searchParams;
  const one: ClassScopeInput = { kind: "setuk", courseId: q.get("course") ?? "", section: q.get("section") || null };
  const inputs = q.get("scope") === "all" ? await mySetukScopes(v) : [one];
  const cols = parseCols(q.get("cols"), true);
  const who = parseWho(q.get("who"));
  const t = v.kind === "teacher" ? v.teacher.name : "";
  const out = await recordsWorkbook(v, inputs, who, cols, t);
  if (!out) return text("내 담당 과목이 아니에요", 404);
  const n = out.sheets.reduce((a, s) => a + s.rows.length, 0);
  const first = out.sheets[0].scope;
  await repo.audit(v.accountId, "records.export_xlsx", `${inputs.length > 1 ? `세특 ${out.sheets.length}분반` : first.title} n=${n} cols=${cols.length}`);
  return xlsxResponse(out.data, "setuk_records.xlsx", scopeFileName(first, inputs.length > 1));
}
