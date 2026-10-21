import "server-only";
import type { TaggedSentence } from "@/lib/domain/competency";
import { check, db, isUuid } from "../supabase";

// 역량 보기 결과 저장 (Figma N56): 학생 · 글(한 문단으로 붙인 글의 해시)이 같으면 저장된 AI 결과를 다시 쓴다 — AI를 여러 번 부르지 않게.
// 표 0029_n56_competency_cache.sql. 적용 전 DB면 읽기는 없음, 저장은 조용히 건너뛴다(다음에 다시 AI).

export type CachedTags = { tags: TaggedSentence[]; savedAt: string };

export interface CompetencyCacheRepo {
  getCompetencyTags(studentId: string, hash: string): Promise<CachedTags | null>;
  saveCompetencyTags(studentId: string, hash: string, tags: TaggedSentence[]): Promise<string>;
}

const g = globalThis as unknown as { __schscomp?: Map<string, CachedTags> };
const mem = () => (g.__schscomp ??= new Map());

export const demoCompetencyCache: CompetencyCacheRepo = {
  async getCompetencyTags(id, hash) { return mem().get(`${id}:${hash}`) ?? null; },
  async saveCompetencyTags(id, hash, tags) { const savedAt = new Date().toISOString(); mem().set(`${id}:${hash}`, { tags, savedAt }); return savedAt; },
};

const missing = (e: { message: string } | null) => !!e && /competency_tags/.test(e.message);

export const supabaseCompetencyCache: CompetencyCacheRepo = {
  async getCompetencyTags(id, hash) {
    if (!isUuid(id)) return null;
    const res = await db().from("competency_tags").select("tags, saved_at").eq("student_id", id).eq("text_hash", hash).maybeSingle();
    if (missing(res.error)) return null;
    const r = check(res) as { tags: TaggedSentence[]; saved_at: string } | null;
    return r ? { tags: r.tags, savedAt: r.saved_at } : null;
  },
  async saveCompetencyTags(id, hash, tags) {
    const savedAt = new Date().toISOString();
    if (!isUuid(id)) return savedAt;
    const res = await db().from("competency_tags").upsert({ student_id: id, text_hash: hash, tags, saved_at: savedAt }, { onConflict: "student_id,text_hash" });
    if (!missing(res.error)) check(res);
    return savedAt;
  },
};
