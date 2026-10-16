import { isAdmin } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";

const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// 봉사 확인서 파일 보기: 올린 교사 · 그 학생의 담임 · 관리자만
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v || v.kind !== "teacher" || v.mustChangePassword) return text("권한이 없어요", 403);
  const { id } = await ctx.params;
  const r = await repo.getServiceRecord(id);
  if (!r) return text("파일을 찾지 못했어요", 404);
  const s = await repo.getStudent(r.studentId);
  const h = v.teacher.homeroom;
  const homeroom = !!s && !!h && h.grade === s.grade && h.classNo === s.classNo;
  if (r.uploaderId !== v.accountId && !homeroom && !isAdmin(v)) return text("권한이 없어요", 403);

  const bytes = await repo.getServiceFile(r);
  if (!bytes) return text("파일을 찾지 못했어요", 404);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": r.mime,
      "Content-Disposition": `inline; filename="service"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
