import "server-only";
import type { KeywordMenu } from "@/lib/domain/behavior-keywords";
import { check, db, isUuid, selectIn } from "../supabase";

// 행발 키워드 메뉴판 (Figma N35 ④): 교사 메뉴판(behavior_keywords) + 학생별 고른 키워드·에피소드 메모(behavior_picks). 0020.
// 고른 키워드는 라벨 그대로. 학생 정보는 내부 student_id 만. 적용 전 DB면 읽기는 빈 값, 저장은 안내 문구로 실패.

export type BehaviorPick = { studentId: string; year: number; keywords: string[]; memo: string; useLogs: boolean; updatedAt: string };

export interface KeywordsRepo {
  /** 저장한 메뉴판 (없으면 null → 기본 메뉴판) */
  getKeywordMenu(ownerId: string): Promise<KeywordMenu | null>;
  saveKeywordMenu(ownerId: string, menu: KeywordMenu): Promise<void>;
  listBehaviorPicks(studentIds: string[], year: number): Promise<BehaviorPick[]>;
  saveBehaviorPick(p: Omit<BehaviorPick, "updatedAt">, ownerId: string): Promise<void>;
}

// ---------- 데모 ----------

const g = globalThis as unknown as { __schskw?: { menus: Map<string, KeywordMenu>; picks: Map<string, BehaviorPick> } };
function st() {
  if (!g.__schskw) {
    // 공유용 깨끗한 데모 (2026-10-22): 기본 키워드판만, 학생 고른 키워드 없음
    g.__schskw = { menus: new Map(), picks: new Map() };
  }
  return g.__schskw;
}

export const demoKeywords: KeywordsRepo = {
  async getKeywordMenu(ownerId) {
    const m = st().menus.get(ownerId);
    return m ? structuredClone(m) : null;
  },
  async saveKeywordMenu(ownerId, menu) {
    st().menus.set(ownerId, structuredClone(menu));
  },
  async listBehaviorPicks(ids, year) {
    const set = new Set(ids);
    return [...st().picks.values()].filter((p) => p.year === year && set.has(p.studentId)).map((p) => ({ ...p, keywords: [...p.keywords] }));
  },
  async saveBehaviorPick(p) {
    st().picks.set(`${p.studentId}|${p.year}`, { ...p, keywords: [...p.keywords], updatedAt: new Date().toISOString() });
  },
};

// ---------- Supabase ----------

const NEED20 = "키워드를 저장하려면 DB 업데이트(0020)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /behavior_(keywords|picks)/.test(e.message);
type PickRow = { student_id: string; school_year: number; keywords: string[] | null; memo: string; use_logs: boolean; updated_at: string };

export const supabaseKeywords: KeywordsRepo = {
  async getKeywordMenu(ownerId) {
    if (!isUuid(ownerId)) return null;
    const r = await db().from("behavior_keywords").select("menu").eq("owner_id", ownerId).maybeSingle();
    if (missing(r.error)) return null;
    const row = check(r) as { menu: KeywordMenu } | null;
    return row?.menu ?? null;
  },
  async saveKeywordMenu(ownerId, menu) {
    const r = await db().from("behavior_keywords").upsert({ owner_id: ownerId, menu, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    if (missing(r.error)) throw new Error(NEED20);
    check(r);
  },
  async listBehaviorPicks(studentIds, year) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    try {
      const rows = await selectIn<PickRow>(ids, (part) => db().from("behavior_picks").select("*").eq("school_year", year).in("student_id", part));
      return rows.map((r) => ({ studentId: r.student_id, year: r.school_year, keywords: r.keywords ?? [], memo: r.memo, useLogs: r.use_logs, updatedAt: r.updated_at }));
    } catch (e) {
      if (e instanceof Error && /behavior_picks/.test(e.message)) return [];
      throw e;
    }
  },
  async saveBehaviorPick(p, ownerId) {
    const r = await db().from("behavior_picks").upsert({
      student_id: p.studentId, school_year: p.year, owner_id: isUuid(ownerId) ? ownerId : null, keywords: p.keywords, memo: p.memo, use_logs: p.useLogs, updated_at: new Date().toISOString(),
    }, { onConflict: "student_id,school_year" });
    if (missing(r.error)) throw new Error(NEED20);
    check(r);
  },
};
