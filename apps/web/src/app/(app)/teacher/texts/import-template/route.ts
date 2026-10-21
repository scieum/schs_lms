import { templateResponse } from "@/lib/server/excel";
import { resolveScope, scopeFileName, type ClassScopeInput } from "@/lib/server/class-scope";
import { getViewer } from "@/lib/server/viewer";

// 갖고 있던 생기부 글 올리기 (N66): 그 반 학생(학번 · 이름)이 채워진 생기부글_양식.xlsx. 지금 글이 있으면 글 칸에도 채워 둔다.
// 주소에는 내부 id 만 (?course=&section= | ?area=&club=).
export async function GET(req: Request) {
  const v = await getViewer();
  const q = new URL(req.url).searchParams;
  const input: ClassScopeInput = q.get("course")
    ? { kind: "setuk", courseId: q.get("course")!, section: q.get("section") }
    : { kind: "record", area: q.get("area") ?? "", clubId: q.get("club") };
  const r = v ? await resolveScope(v, input) : null;
  if (!r) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const rows = r.students.map((s) => [s.studentNo, s.name, r.latest.get(s.id)?.content ?? ""]);
  return templateResponse("records", { rows, file: `생기부글_${scopeFileName(r).replace(/\.xlsx$/, "")}.xlsx` });
}
