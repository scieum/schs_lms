import { syncNotionSchedule } from "@/lib/server/notion-sync";

// 매일 아침 Vercel Cron 이 부른다 (vercel.json). CRON_SECRET 이 맞아야만 돈다.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("권한이 없어요", { status: 401 });
  const r = await syncNotionSchedule();
  return Response.json(r, { status: r.ok ? 200 : 500 });
}
