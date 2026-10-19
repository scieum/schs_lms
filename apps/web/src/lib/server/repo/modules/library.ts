import "server-only";
import { filterLibrary, type LibraryArea, type LibraryEntry, type LibrarySort, type LibrarySource } from "@/lib/domain/library";
import { check, db, isUuid } from "../supabase";

// 문장 보관함 (Figma N35 ②): 교사 개인. 표는 0020_n35_library_levels_keywords.sql (sentence_library).
// 학생 id·이름·학번은 저장하지 않는다 — 액션이 stripIdentity 한 글만 온다. 적용 전 DB면 읽기는 빈 목록, 저장은 안내 문구로 실패.

export type NewLibraryEntry = { ownerId: string; area: LibraryArea; subject: string | null; text: string; tags: string[]; source: LibrarySource };
export type LibraryFilter = { q?: string; area?: LibraryArea | null; tag?: string | null; sort?: LibrarySort };

export interface LibraryRepo {
  listSentences(ownerId: string, f?: LibraryFilter): Promise<LibraryEntry[]>;
  addSentence(e: NewLibraryEntry): Promise<LibraryEntry>;
  updateSentence(ownerId: string, id: string, patch: { text?: string; tags?: string[]; area?: LibraryArea }): Promise<LibraryEntry | null>;
  removeSentence(ownerId: string, id: string): Promise<boolean>;
  /** 본문에 넣기 · 조각으로 넣기 때마다 +1 (많이 넣은 순) */
  bumpSentence(ownerId: string, id: string): Promise<void>;
}

// ---------- 데모 ----------

type Row = LibraryEntry & { ownerId: string };
const g = globalThis as unknown as { __schslib?: Row[] };

function seed(): Row[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const r = (id: string, d: number, area: LibraryArea, subject: string | null, text: string, tags: string[], source: LibrarySource, useCount = 0): Row =>
    ({ id, ownerId: "t-subject", area, subject, text, tags, source, useCount, createdAt: ago(d) });
  return [
    r("lib-1", 1, "세특", "물리학", "실험 오차의 원인을 변인별로 나누어 따져 보고 측정 순서를 스스로 바꿔 다시 확인함.", ["실험", "오차"], "variant", 2),
    r("lib-2", 7, "세특", "통합사회", "토론에서 상대 의견의 근거를 먼저 정리한 뒤 자신의 주장을 덧붙이는 태도를 보임.", ["토론"], "body", 1),
    r("lib-3", 17, "행발", null, "학급 행사 준비 과정에서 역할을 나누고 마감까지 일정을 꼼꼼히 챙김.", ["협력", "책임감"], "soften", 3),
    r("lib-4", 20, "세특", "물리학", "가설을 세우고 측정 조건을 바꿔 가며 세 번에 걸쳐 검증하는 끈기를 보임.", ["실험", "진로"], "body"),
    r("lib-5", 25, "창체", null, "학급 자치회의에서 규칙 개정안을 내고 투표 결과를 정리해 게시함.", ["자치"], "draft"),
  ];
}
const rows = () => (g.__schslib ??= seed());
const pub = (r: Row): LibraryEntry => ({ id: r.id, area: r.area, subject: r.subject, text: r.text, tags: [...r.tags], source: r.source, useCount: r.useCount, createdAt: r.createdAt });

export const demoLibrary: LibraryRepo = {
  async listSentences(ownerId, f) {
    return filterLibrary(rows().filter((r) => r.ownerId === ownerId).map(pub), f);
  },
  async addSentence(e) {
    const row: Row = { id: crypto.randomUUID(), ownerId: e.ownerId, area: e.area, subject: e.subject, text: e.text, tags: [...e.tags], source: e.source, useCount: 0, createdAt: new Date().toISOString() };
    rows().push(row);
    return pub(row);
  },
  async updateSentence(ownerId, id, patch) {
    const r = rows().find((x) => x.id === id && x.ownerId === ownerId);
    if (!r) return null;
    if (patch.text !== undefined) r.text = patch.text;
    if (patch.tags !== undefined) r.tags = [...patch.tags];
    if (patch.area !== undefined) r.area = patch.area;
    return pub(r);
  },
  async removeSentence(ownerId, id) {
    const list = rows();
    const i = list.findIndex((x) => x.id === id && x.ownerId === ownerId);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  },
  async bumpSentence(ownerId, id) {
    const r = rows().find((x) => x.id === id && x.ownerId === ownerId);
    if (r) r.useCount++;
  },
};

// ---------- Supabase ----------

const NEED20 = "보관하려면 DB 업데이트(0020)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /sentence_library/.test(e.message);
type DbRow = { id: string; owner_id: string; area: LibraryArea; subject: string | null; text: string; tags: string[] | null; source: LibrarySource; use_count: number; created_at: string };
const toEntry = (r: DbRow): LibraryEntry => ({ id: r.id, area: r.area, subject: r.subject, text: r.text, tags: r.tags ?? [], source: r.source, useCount: r.use_count, createdAt: r.created_at });

export const supabaseLibrary: LibraryRepo = {
  async listSentences(ownerId, f) {
    if (!isUuid(ownerId)) return [];
    const res = await db().from("sentence_library").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(1000);
    if (missing(res.error)) return [];
    return filterLibrary(((check(res) as DbRow[]) ?? []).map(toEntry), f);
  },
  async addSentence(e) {
    const res = await db().from("sentence_library").insert({ owner_id: e.ownerId, area: e.area, subject: e.subject, text: e.text, tags: e.tags, source: e.source }).select("*").single();
    if (missing(res.error)) throw new Error(NEED20);
    return toEntry(check(res) as DbRow);
  },
  async updateSentence(ownerId, id, patch) {
    if (!isUuid(id)) return null;
    const res = await db().from("sentence_library").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", ownerId).select("*").maybeSingle();
    if (missing(res.error)) throw new Error(NEED20);
    const r = check(res) as DbRow | null;
    return r ? toEntry(r) : null;
  },
  async removeSentence(ownerId, id) {
    if (!isUuid(id)) return false;
    const res = await db().from("sentence_library").delete().eq("id", id).eq("owner_id", ownerId).select("id");
    if (missing(res.error)) throw new Error(NEED20);
    return ((check(res) as { id: string }[]) ?? []).length > 0;
  },
  async bumpSentence(ownerId, id) {
    if (!isUuid(id)) return;
    const cur = await db().from("sentence_library").select("use_count").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (cur.error || !cur.data) return;
    await db().from("sentence_library").update({ use_count: (cur.data as { use_count: number }).use_count + 1 }).eq("id", id).eq("owner_id", ownerId);
  },
};
