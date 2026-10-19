import { kstToday } from "@/lib/domain/retention";
import { runRetentionSweep } from "@/lib/server/retention-sweep";

// 자료 보존 · 자동 파기 (Figma N39): 매일 새벽 3시(KST, vercel.json "0 18 * * *" UTC) Vercel Cron 이 부른다.
// CRON_SECRET 이 맞아야만 돈다. 지울 날이 지난 원본 파일·읽은 글만 지우고, 건수만 남긴다.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("권한이 없어요", { status: 401 });
  try {
    const r = await runRetentionSweep("cron", null, kstToday());
    return Response.json({ ok: true, programs: r.programs, files: r.files, texts: r.texts });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "실패" }, { status: 500 });
  }
}
