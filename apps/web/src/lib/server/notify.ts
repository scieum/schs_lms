import "server-only";
import { isDemo } from "./env";
import { db } from "./repo/supabase";

// 관리자 알림 (2026-10-22 "문의글이 올라오면 카카오 · 슬랙으로 문의 내용과 AI 답 초안을 나에게"):
// - 슬랙: SLACK_WEBHOOK_URL (Incoming Webhook) 하나면 된다.
// - 카카오톡 나에게 보내기: KAKAO_REST_KEY + KAKAO_REFRESH_TOKEN (+ 앱에 Client Secret 을 켰으면 KAKAO_CLIENT_SECRET).
//   접근 토큰은 6시간마다 바뀌어서 보낼 때마다 새로 받는다. 새 refresh 토큰이 오면 app_state(kakao_refresh) 에 적어 두고 다음에 쓴다.
// 둘 다 없으면 조용히 건너뛴다. 실패해도 문의 올리기는 막지 않는다. 보내는 글은 학생 이름 · 학번 검사를 거친 문의 · 답 초안뿐.

export const notifyTargets = () => ({ slack: !!process.env.SLACK_WEBHOOK_URL, kakao: !!(process.env.KAKAO_REST_KEY && process.env.KAKAO_REFRESH_TOKEN) });

export type Notice = { title: string; lines: string[]; url: string; short: string };

async function slack(n: Notice): Promise<string | null> {
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return null;
  const res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `*${n.title}*\n${n.lines.join("\n")}\n<${n.url}|답하러 가기>` }) });
  return res.ok ? null : `슬랙 ${res.status}`;
}

const KAKAO_KEY = "kakao_refresh";
async function savedRefresh(): Promise<string | null> {
  if (isDemo) return null;
  const r = await db().from("app_state").select("value").eq("key", KAKAO_KEY).maybeSingle();
  return r.error || !r.data ? null : ((r.data.value as { token?: string })?.token ?? null);
}

async function kakao(n: Notice): Promise<string | null> {
  const key = process.env.KAKAO_REST_KEY;
  const refresh = (await savedRefresh().catch(() => null)) ?? process.env.KAKAO_REFRESH_TOKEN;
  if (!key || !refresh) return null;
  const form = new URLSearchParams({ grant_type: "refresh_token", client_id: key, refresh_token: refresh });
  if (process.env.KAKAO_CLIENT_SECRET) form.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const tok = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form });
  if (!tok.ok) return `카카오 토큰 ${tok.status}`;
  const t = (await tok.json()) as { access_token: string; refresh_token?: string };
  if (t.refresh_token && !isDemo) await db().from("app_state").upsert({ key: KAKAO_KEY, value: { token: t.refresh_token }, updated_at: new Date().toISOString() });
  // 텍스트 템플릿은 200자까지
  const template = { object_type: "text", text: n.short.slice(0, 200), link: { web_url: n.url, mobile_web_url: n.url }, button_title: "답하러 가기" };
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: { authorization: `Bearer ${t.access_token}`, "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });
  return res.ok ? null : `카카오 보내기 ${res.status}`;
}

/** 슬랙 · 카카오 중 켜진 곳에 보낸다. 실패한 곳 이유만 돌려준다 */
export async function notifyAdmin(n: Notice): Promise<string[]> {
  const out = await Promise.all([slack(n), kakao(n)].map((p) => p.catch((e) => (e instanceof Error ? e.message : "알림 실패"))));
  return out.filter((x): x is string => !!x);
}
