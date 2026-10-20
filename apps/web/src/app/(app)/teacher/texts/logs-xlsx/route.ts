import { isAreaOf } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { neisBytes } from "@/lib/domain/length";
import { can } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { buildTable, xlsxResponse } from "@/lib/server/scores-excel";
import { logsRows } from "@/lib/server/texts-view";
import { getViewer } from "@/lib/server/viewer";

// 글 모아 보기 · 누가기록 엑셀로 받기 (N49 (d)): 기록 한 줄씩 — 번호 · 이름 · 날짜 · 기록 · 바이트.
// ?area=&club= (내부 id 만). 권한은 누가기록 화면과 같음(내 동아리 · 담임 반). 감사에는 영역 · 숫자만.
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || v.mustChangePassword || !can(v, "logs.write")) return text("권한이 없어요", 403);
  const q = new URL(req.url).searchParams;
  const area = q.get("area") ?? "";
  if (!isAreaOf(area)) return text("영역을 골라 주세요", 400);
  const out = await logsRows(v, { area, clubId: area === "동아리" ? q.get("club") || null : null });
  if (!out) return text("내 담당 학생만 받을 수 있어요", 404);
  const rows = out.rows.flatMap((r) => r.lines.map((l) => [r.no, r.name, l.date, l.content, neisBytes(l.content)] as (string | number)[]));
  const data = await buildTable("누가기록", ["번호", "이름", "날짜", "기록", "바이트"], rows, [8, 10, 12, 80, 8]);
  await repo.audit(v.accountId, "texts.logs_xlsx", `${area} n=${out.rows.length} lines=${rows.length}`);
  const safe = area.replace(/[\\/:*?"<>|\s·]+/g, "_");
  return xlsxResponse(data, "logs.xlsx", `누가기록_${safe}_${schoolYear()}.xlsx`);
}
