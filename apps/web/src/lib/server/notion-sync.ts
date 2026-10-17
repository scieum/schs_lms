import "server-only";
import { fromNotionPage, type NotionEvent, type NotionPage } from "@/lib/domain/notion-events";
import { isDemo } from "./env";
import { repo } from "./repo";
import { db } from "./repo/supabase";

// 노션 학사일정 DB → 앱 학사일정 자동 연결.
// - 노션 공식 API(통합 토큰)로 DB 전체를 읽어, 앱의 노션 일정과 맞춘다: 새 줄 추가 · 바뀐 줄 고침 · 노션에서 지운 줄 지움.
// - 언제: 매일 아침(Vercel Cron) + 누가 학사일정 화면을 열었는데 마지막 동기화가 10분 넘었을 때 + 관리자 "지금 가져오기".
// - 필요한 것: NOTION_TOKEN(노션 통합 토큰, 학사일정 DB에 연결) · NOTION_SCHEDULE_DS(데이터 소스 id, 기본은 2026 온라인 교무실).
// - 앱에서 직접 추가한 일정(source 없음)은 건드리지 않는다.

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const DATA_SOURCE = process.env.NOTION_SCHEDULE_DS || "31a137a3-05b8-8093-a4cf-000bf723df19";
const STATE_KEY = "notion-schedule-sync";
export const NOTION_SOURCE = "notion";
const OLD_SOURCE = "notion-2026"; // 처음 옮긴 124건 (0015) — 첫 동기화 때 노션 id 를 붙여 이어 받는다

export const notionEnabled = () => !!process.env.NOTION_TOKEN && !isDemo;

export type SyncResult = { ok: true; added: number; updated: number; removed: number; total: number; at: string } | { ok: false; error: string };

async function fetchAll(): Promise<NotionEvent[]> {
  const out: NotionEvent[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`${API}/data_sources/${DATA_SOURCE}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!r.ok) {
      const msg = r.status === 401 ? "노션 토큰이 맞지 않아요" : r.status === 404 ? "노션 학사일정 DB에 통합(연결)이 추가되지 않았어요" : `노션 응답 오류 (${r.status})`;
      throw new Error(msg);
    }
    const j = (await r.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    for (const p of j.results) {
      const e = fromNotionPage(p);
      if (e) out.push(e);
    }
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  return out;
}

type Row = { id: string; notion_id: string | null; title: string; start_date: string; end_date: string; grades: number[]; memo: string | null; holiday: boolean; dept: string | null; source: string | null };

/** 노션 → 앱 한 번 맞추기 */
export async function syncNotionSchedule(): Promise<SyncResult> {
  if (!notionEnabled()) return { ok: false, error: "노션 연결이 아직 없어요 (NOTION_TOKEN)" };
  try {
    const events = await fetchAll();
    const admin = (await repo.listTeachers()).find((t) => t.roles.includes("admin"));
    if (!admin) return { ok: false, error: "관리자 계정이 없어요" };
    const cur = (await db().from("school_events").select("id,notion_id,title,start_date,end_date,grades,memo,holiday,dept,source").in("source", [NOTION_SOURCE, OLD_SOURCE]));
    if (cur.error) throw new Error(/notion_id/.test(cur.error.message) ? "DB 업데이트(0017)가 필요해요" : cur.error.message);
    const rows = cur.data as Row[];
    const byNotion = new Map(rows.filter((r) => r.notion_id).map((r) => [r.notion_id!, r]));
    const legacy = rows.filter((r) => !r.notion_id);
    const kept = new Set<string>();
    let added = 0, updated = 0;
    for (const e of events) {
      let row = byNotion.get(e.notionId);
      if (!row) {
        const i = legacy.findIndex((r) => r.title === e.title && r.start_date === e.startDate);
        if (i >= 0) row = legacy.splice(i, 1)[0];
      }
      const data = { title: e.title, start_date: e.startDate, end_date: e.endDate, grades: e.grades, memo: e.memo, holiday: e.holiday, dept: e.dept, source: NOTION_SOURCE, notion_id: e.notionId };
      if (row) {
        kept.add(row.id);
        const same = row.title === e.title && row.start_date === e.startDate && row.end_date === e.endDate && row.memo === e.memo && row.holiday === e.holiday && row.dept === e.dept && row.notion_id === e.notionId && row.source === NOTION_SOURCE && JSON.stringify(row.grades ?? []) === JSON.stringify(e.grades);
        if (!same) {
          const u = await db().from("school_events").update(data).eq("id", row.id);
          if (u.error) throw new Error(u.error.message);
          updated++;
        }
      } else {
        const ins = await db().from("school_events").insert({ ...data, author_id: admin.id });
        if (ins.error) throw new Error(ins.error.message);
        added++;
      }
    }
    // 노션에서 지운(또는 날짜를 지운) 일정은 앱에서도 지운다 — 노션을 다 읽은 뒤에만
    const gone = rows.filter((r) => !kept.has(r.id)).map((r) => r.id);
    for (let i = 0; i < gone.length; i += 100) {
      const d = await db().from("school_events").delete().in("id", gone.slice(i, i + 100));
      if (d.error) throw new Error(d.error.message);
    }
    const at = new Date().toISOString();
    const result = { ok: true as const, added, updated, removed: gone.length, total: events.length, at };
    await db().from("app_state").upsert({ key: STATE_KEY, value: result, updated_at: at });
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "노션에서 가져오지 못했어요" };
  }
}

/** 마지막 동기화 결과 */
export async function lastNotionSync(): Promise<Extract<SyncResult, { ok: true }> | null> {
  if (isDemo) return null;
  const r = await db().from("app_state").select("value").eq("key", STATE_KEY).maybeSingle();
  return r.error || !r.data ? null : (r.data.value as Extract<SyncResult, { ok: true }>);
}

/** 학사일정 화면을 열 때: 마지막 동기화가 10분 넘었으면 뒤에서 한 번 (화면은 기다리지 않음) */
export async function syncIfStale(minutes = 10) {
  if (!notionEnabled()) return;
  const last = await lastNotionSync();
  if (last && Date.now() - Date.parse(last.at) < minutes * 60_000) return;
  await syncNotionSchedule();
}
