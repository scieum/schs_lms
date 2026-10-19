import { can } from "@/lib/domain/policy";
import { templateResponse } from "@/lib/server/excel";
import { getViewer } from "@/lib/server/viewer";

// 수업 계획 양식 내려받기 (수업계획_양식.xlsx) — 차시별 활동 메뉴 (Figma N43 ②)
export async function GET() {
  const v = await getViewer();
  if (!v || !(can(v, "setuk.write") || can(v, "record.write"))) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return templateResponse("lesson");
}
