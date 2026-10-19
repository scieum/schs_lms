import "server-only";
import { PROVENANCE_DEFAULTS, type OriginalSentence, type ProvenanceSettings, type RecordProv, type SentenceSource } from "@/lib/domain/provenance";
import { db, isUuid } from "../supabase";

// AI 원안 (Figma N38, 0022 ai_originals): 추가만 · 고치거나 지우지 않는다. 서버 전용(RLS · service role).
// 기록 버전(setuk_records · record_drafts · draft_versions)의 N38 칸 읽기·쓰기 도우미도 여기 둔다 — 0022 전 DB면 칸 없이 저장한다.

export type AiOriginalKind = "program" | "setuk_merge" | "setuk_memo" | "setuk_keyword" | "behavior_keyword" | "record";
export type AiOriginal = {
  id: string;
  kind: AiOriginalKind;
  studentId: string;
  scope: string | null;
  content: string;
  sentences: OriginalSentence[];
  model: string | null;
  createdAt: string;
};

export interface ProvenanceRepo {
  addAiOriginal(o: Omit<AiOriginal, "id" | "createdAt">): Promise<AiOriginal | null>;
  getAiOriginal(id: string): Promise<AiOriginal | null>;
  listAiOriginals(ids: string[]): Promise<AiOriginal[]>;
  /** 학교 설정 (app_state edit_ratio_min · source_match_min) — 없으면 기본값 */
  getProvenanceSettings(): Promise<ProvenanceSettings>;
}

// ---------- 데모 ----------

const g = globalThis as unknown as { __schsoriginals?: Map<string, AiOriginal> };
const mem = () => (g.__schsoriginals ??= new Map());
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const demoProvenance: ProvenanceRepo = {
  async addAiOriginal(o) {
    const row: AiOriginal = { ...copy(o), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    mem().set(row.id, row);
    return copy(row);
  },
  async getAiOriginal(id) {
    const r = mem().get(id);
    return r ? copy(r) : null;
  },
  async listAiOriginals(ids) {
    return ids.flatMap((id) => (mem().has(id) ? [copy(mem().get(id)!)] : []));
  },
  async getProvenanceSettings() {
    return { ...PROVENANCE_DEFAULTS };
  },
};

// ---------- Supabase ----------

type OriginalRow = { id: string; kind: AiOriginalKind; student_id: string; scope: string | null; content: string; sentences: OriginalSentence[] | null; model: string | null; created_at: string };
const toOriginal = (r: OriginalRow): AiOriginal => ({
  id: r.id, kind: r.kind, studentId: r.student_id, scope: r.scope, content: r.content, sentences: Array.isArray(r.sentences) ? r.sentences : [], model: r.model, createdAt: r.created_at,
});
/** 0022 전 DB: 표·칸이 없다는 오류 */
export const missingProv = (e: { message: string } | null | undefined) => !!e && /ai_original|sentence_sources|edit_ratio|low_edit_reason/.test(e.message);

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
};

export const supabaseProvenance: ProvenanceRepo = {
  async addAiOriginal(o) {
    if (!isUuid(o.studentId)) return null;
    const res = await db().from("ai_originals").insert({ kind: o.kind, student_id: o.studentId, scope: o.scope, content: o.content, sentences: o.sentences, model: o.model }).select("*").single();
    // 0022 전 DB면 원안 없이 이어간다 (근거·원안 비교·수정 칩이 숨는다)
    if (res.error) return null;
    return toOriginal(res.data as OriginalRow);
  },
  async getAiOriginal(id) {
    if (!isUuid(id)) return null;
    const res = await db().from("ai_originals").select("*").eq("id", id).maybeSingle();
    return res.error || !res.data ? null : toOriginal(res.data as OriginalRow);
  },
  async listAiOriginals(ids) {
    const list = [...new Set(ids.filter(isUuid))];
    if (!list.length) return [];
    const res = await db().from("ai_originals").select("*").in("id", list);
    return res.error ? [] : (res.data as OriginalRow[]).map(toOriginal);
  },
  async getProvenanceSettings() {
    const res = await db().from("app_state").select("key, value").in("key", ["edit_ratio_min", "source_match_min"]);
    const rows = res.error ? [] : (res.data as { key: string; value: unknown }[]);
    const v = (k: string) => rows.find((r) => r.key === k)?.value;
    return {
      editRatioMin: num(v("edit_ratio_min"), PROVENANCE_DEFAULTS.editRatioMin, 0, 100),
      sourceMatchMin: num(v("source_match_min"), PROVENANCE_DEFAULTS.sourceMatchMin, 0.1, 1),
    };
  },
};

// ---------- 기록 버전 칸 도우미 ----------

export type ProvRow = { ai_original_id?: string | null; sentence_sources?: SentenceSource[] | null; edit_ratio?: number | null; low_edit_reason?: string | null };

/** 행 → RecordProv (칸이 없으면 비움) */
export const provFrom = (r: ProvRow): RecordProv => ({
  aiOriginalId: r.ai_original_id ?? null, sentenceSources: r.sentence_sources ?? null, editRatio: r.edit_ratio ?? null, lowEditReason: r.low_edit_reason ?? null,
});

/** RecordProv → 넣을 칸 (값이 있는 것만 — 0022 전 DB에서도 N38 없는 저장은 그대로 된다) */
export function provColumns(x: RecordProv): ProvRow {
  const out: ProvRow = {};
  if (x.aiOriginalId && isUuid(x.aiOriginalId)) out.ai_original_id = x.aiOriginalId;
  if (x.sentenceSources) out.sentence_sources = x.sentenceSources;
  if (x.editRatio != null) out.edit_ratio = x.editRatio;
  if (x.lowEditReason) out.low_edit_reason = x.lowEditReason.slice(0, 60);
  return out;
}

/** N38 칸을 붙여 넣고, 0022 전 DB라 칸이 없으면 칸 없이 한 번 더 */
export async function insertWithProv<R>(table: string, base: Record<string, unknown>, prov: RecordProv): Promise<R> {
  const extra = provColumns(prov);
  const first = await db().from(table).insert({ ...base, ...extra }).select("*").single();
  if (first.error && Object.keys(extra).length && missingProv(first.error)) {
    const again = await db().from(table).insert(base).select("*").single();
    if (again.error) throw new Error(again.error.message);
    return again.data as R;
  }
  if (first.error) throw new Error(first.error.message);
  return first.data as R;
}
