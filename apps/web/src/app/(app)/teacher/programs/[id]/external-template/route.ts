import { templateResponse } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import { requireProgram } from "../../_lib/data";

// 외부글 양식 내려받기 (Figma N46): 대상 학생의 학번·학년·반·번호·이름을 채운 외부글_양식.xlsx.
// 담당 교사·관리자만 (requireProgram). 이름은 교사가 받는 이 파일에만 들어가고, URL·파일 이름에는 넣지 않는다 (C3).
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { v, program } = await requireProgram(id);
  const set = new Set(program.targetIds);
  const rows = (await repo.listStudents())
    .filter((s) => set.has(s.id))
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number)
    .map((s) => [s.studentNo, s.name, ""]);
  await repo.audit(v.accountId, "program.external_template", `${program.id} n=${rows.length}`);
  return templateResponse("external", { rows });
}
