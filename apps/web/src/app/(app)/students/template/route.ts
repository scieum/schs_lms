import { can } from "@/lib/domain/policy";
import { buildTemplate } from "@/lib/server/excel";
import { getViewer } from "@/lib/server/viewer";

// 학생 등록 양식 내려받기
export async function GET() {
  const v = await getViewer();
  if (!v || !can(v, "student.register")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const buf = await buildTemplate();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="student_template.xlsx"; filename*=UTF-8''${encodeURIComponent("학생등록_양식.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
