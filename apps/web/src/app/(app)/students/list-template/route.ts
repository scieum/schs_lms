import { can } from "@/lib/domain/policy";
import { buildListTemplate } from "@/lib/server/roster-file";
import { getViewer } from "@/lib/server/viewer";

// 학생 명단 양식 내려받기 (엑셀로 학생 넣기)
export async function GET() {
  const v = await getViewer();
  if (!v || !can(v, "student.list")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const buf = await buildListTemplate();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="student_list.xlsx"; filename*=UTF-8''${encodeURIComponent("학생명단_양식.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
