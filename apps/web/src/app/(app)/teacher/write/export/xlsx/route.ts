import { can } from "@/lib/domain/policy";
import { parseCols, parseWho } from "@/lib/domain/records-export";
import { isRecordArea } from "@/lib/domain/writing";
import { HOMEROOM_AREAS, scopeFileName, type ClassScopeInput } from "@/lib/server/class-scope";
import { recordsWorkbook } from "@/lib/server/class-write";
import { repo } from "@/lib/server/repo";
import { xlsxResponse } from "@/lib/server/scores-excel";
import { getViewer } from "@/lib/server/viewer";

// 엑셀로 받기 (Figma N42 ②): 담임 반 영역(scope=all 이면 자율 · 진로 · 행발 영역마다 시트) · 동아리 + 요약 시트.
// ?area=&club=&scope=one|all&who=&cols= — 권한은 JSON 내보내기와 같은 확인(담임 반 · 내 동아리). 감사에는 범위 · 학생 수 · 열 수만.
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.mustChangePassword || !can(v, "record.write")) return text("권한이 없어요", 403);
  const q = new URL(req.url).searchParams;
  const area = q.get("area");
  if (!isRecordArea(area)) return text("영역을 골라 주세요", 400);
  const club = q.get("club") || null;
  const all = q.get("scope") === "all" && area !== "동아리";
  const inputs: ClassScopeInput[] = all ? HOMEROOM_AREAS.map((a) => ({ kind: "record", area: a })) : [{ kind: "record", area, clubId: club }];
  const cols = parseCols(q.get("cols"), false);
  const out = await recordsWorkbook(v, inputs, parseWho(q.get("who")), cols, v.kind === "teacher" ? v.teacher.name : "");
  if (!out) return text("내보낼 학생이 없어요", 404);
  const first = out.sheets[0].scope;
  const n = out.sheets.reduce((a, s) => a + s.rows.length, 0);
  await repo.audit(v.accountId, "records.export_xlsx", `${all ? "담임 영역 3" : first.clubName ? `동아리 ${first.clubName}` : first.areaKey} n=${n} cols=${cols.length}`);
  return xlsxResponse(out.data, "records.xlsx", scopeFileName(first, all));
}
