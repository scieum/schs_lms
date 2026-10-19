import "server-only";
import { DEFAULT_RETENTION, DEFAULT_TERM_ENDS, sanitizeSetting, type RetentionKey, type RetentionSetting, type RetentionSettings, type TermEnds } from "@/lib/domain/retention";
import { check, db, isUuid } from "../supabase";

// 자료 보존 기간 · 자동 파기 (Figma N39 ③): 설정 · 한 번 미루기 · 파기 실행 기록 · 학기 마감 날짜.
// 표는 0021_retention.sql. 적용 전 DB면 읽기는 기본값·빈 목록, 저장은 안내 문구로 실패한다.
// 실제로 지우는 일(파일·글)은 programs.purgeMaterial* · repo.purgeServiceFiles, 묶어서 부르는 곳은 lib/server/retention-sweep.ts

export type RetentionTrigger = "cron" | "visit" | "admin";
export interface RetentionItem { label: string; files: number; texts: number }
export interface RetentionRun { id: string; ranAt: string; trigger: RetentionTrigger; programs: number; files: number; texts: number; items: RetentionItem[]; actorId: string | null }
export interface RetentionHold { target: string; until: string; heldBy: string | null; heldAt: string }

export interface RetentionRepo {
  getRetentionSettings(): Promise<RetentionSettings>;
  setRetentionSetting(s: RetentionSetting, by: string): Promise<void>;
  listRetentionHolds(): Promise<RetentionHold[]>;
  /** 이미 미룬 묶음이면 false (프로그램당 1번) */
  addRetentionHold(target: string, until: string, by: string): Promise<boolean>;
  listRetentionRuns(limit: number): Promise<RetentionRun[]>;
  addRetentionRun(r: Omit<RetentionRun, "id" | "ranAt">): Promise<RetentionRun>;
  getTermEnds(): Promise<TermEnds>;
}

export const NEED21 = "자료 보존을 쓰려면 DB 업데이트(0021)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /retention_/.test(e.message);

// ---------- 데모 ----------

interface RetentionStore { settings: RetentionSettings; holds: RetentionHold[]; runs: RetentionRun[] }
const g = globalThis as unknown as { __schsretention?: RetentionStore };
function rs(): RetentionStore {
  if (!g.__schsretention) g.__schsretention = { settings: structuredClone(DEFAULT_RETENTION), holds: [], runs: [] };
  return g.__schsretention;
}

export const demoRetention: RetentionRepo = {
  async getRetentionSettings() {
    return structuredClone(rs().settings);
  },
  async setRetentionSetting(s) {
    rs().settings[s.key] = { ...s };
  },
  async listRetentionHolds() {
    return rs().holds.map((h) => ({ ...h }));
  },
  async addRetentionHold(target, until, by) {
    if (rs().holds.some((h) => h.target === target)) return false;
    rs().holds.push({ target, until, heldBy: by, heldAt: new Date().toISOString() });
    return true;
  },
  async listRetentionRuns(limit) {
    return rs().runs.slice(0, limit).map((r) => structuredClone(r));
  },
  async addRetentionRun(r) {
    const row: RetentionRun = { ...structuredClone(r), id: crypto.randomUUID(), ranAt: new Date().toISOString() };
    rs().runs.unshift(row);
    return row;
  },
  async getTermEnds() {
    return { ...DEFAULT_TERM_ENDS };
  },
};

// ---------- Supabase ----------

type RunRow = { id: string; ran_at: string; trigger: RetentionTrigger; programs: number; files: number; texts: number; items: RetentionItem[] | null; actor_id: string | null };
const toRun = (r: RunRow): RetentionRun => ({ id: r.id, ranAt: r.ran_at, trigger: r.trigger, programs: r.programs, files: r.files, texts: r.texts, items: r.items ?? [], actorId: r.actor_id });

export const supabaseRetention: RetentionRepo = {
  async getRetentionSettings() {
    const r = await db().from("retention_settings").select("key, days, base");
    if (r.error) return structuredClone(DEFAULT_RETENTION);
    const out = structuredClone(DEFAULT_RETENTION);
    for (const row of r.data as { key: RetentionKey; days: number; base: RetentionSetting["base"] }[]) {
      if (row.key === "raw_files" || row.key === "extracted_text") out[row.key] = sanitizeSetting(row.key, row);
    }
    return out;
  },
  async setRetentionSetting(s, by) {
    const res = await db().from("retention_settings").upsert({ key: s.key, days: s.days, base: s.base, updated_by: isUuid(by) ? by : null, updated_at: new Date().toISOString() });
    if (missing(res.error)) throw new Error(NEED21);
    check(res);
  },
  async listRetentionHolds() {
    const r = await db().from("retention_holds").select("*");
    if (r.error) return [];
    return (r.data as { target: string; until: string; held_by: string | null; held_at: string }[]).map((x) => ({ target: x.target, until: x.until, heldBy: x.held_by, heldAt: x.held_at }));
  },
  async addRetentionHold(target, until, by) {
    const res = await db().from("retention_holds").insert({ target, until, held_by: isUuid(by) ? by : null });
    if (missing(res.error)) throw new Error(NEED21);
    if (res.error && /duplicate|unique/i.test(res.error.message)) return false;
    check(res);
    return true;
  },
  async listRetentionRuns(limit) {
    const r = await db().from("retention_runs").select("*").order("ran_at", { ascending: false }).limit(limit);
    if (r.error) return [];
    return (r.data as RunRow[]).map(toRun);
  },
  async addRetentionRun(x) {
    const res = await db().from("retention_runs").insert({ trigger: x.trigger, programs: x.programs, files: x.files, texts: x.texts, items: x.items, actor_id: x.actorId && isUuid(x.actorId) ? x.actorId : null }).select("*").single();
    if (missing(res.error)) throw new Error(NEED21);
    return toRun(check(res) as RunRow);
  },
  async getTermEnds() {
    const r = await db().from("app_state").select("key, value").in("key", ["term_end_1", "term_end_2"]);
    if (r.error) return { ...DEFAULT_TERM_ENDS };
    const v = Object.fromEntries((r.data as { key: string; value: unknown }[]).map((x) => [x.key, typeof x.value === "string" ? x.value : null]));
    return { t1: v.term_end_1 ?? DEFAULT_TERM_ENDS.t1, t2: v.term_end_2 ?? DEFAULT_TERM_ENDS.t2 };
  },
};
