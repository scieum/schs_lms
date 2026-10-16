import { repo } from "@/lib/server/repo";
import { canOwn } from "../../../../_lib/data";
import { getViewer } from "@/lib/server/viewer";

const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// 제출 서류 파일 보기: 프로그램 담당 교사 · 관리자만
export async function GET(_: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const v = await getViewer();
  if (!v || v.kind !== "teacher" || v.mustChangePassword) return text("권한이 없어요", 403);
  const { id, mid } = await ctx.params;
  const [program, m] = await Promise.all([repo.getProgram(id), repo.getMaterial(mid)]);
  if (!program || !m || m.programId !== program.id) return text("파일을 찾지 못했어요", 404);
  if (!canOwn(v, program)) return text("권한이 없어요", 403);
  const bytes = await repo.getMaterialFile(m);
  if (!bytes) return text("파일을 찾지 못했어요", 404);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": m.mime,
      "Content-Disposition": `inline; filename="material"; filename*=UTF-8''${encodeURIComponent(m.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
