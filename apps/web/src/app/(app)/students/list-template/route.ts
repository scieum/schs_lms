import { can } from "@/lib/domain/policy";
import { templateResponse } from "@/lib/server/excel";
import { getViewer } from "@/lib/server/viewer";

// 명단 양식 내려받기 (명단_양식.xlsx) — 엑셀로 학생 넣기 · 이동반 명단
export async function GET() {
  const v = await getViewer();
  if (!v || !can(v, "student.list")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return templateResponse("list");
}
