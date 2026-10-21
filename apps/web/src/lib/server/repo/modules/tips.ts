import "server-only";
import { SEED_TIPS, type Tip, type TipCategory } from "@/lib/domain/tips";
import { check, db, isUuid } from "../supabase";

// 생기부 팁 게시판 (Figma N57). 표 0030_n57_tips.sql (처음 글 11개 함께). 지우기는 deleted_at 만 채운다 (C4 — 추가만).
// 적용 전 DB면 읽기는 처음 글(코드에 있는 것)만, 쓰기는 안내 문구로 실패한다.

export type TipInput = { category: TipCategory; title: string; body: string; source: string | null };

export interface TipsRepo {
  listTips(): Promise<Tip[]>;
  createTip(author: { id: string; name: string }, input: TipInput): Promise<Tip>;
  updateTip(id: string, input: TipInput): Promise<void>;
  deleteTip(id: string): Promise<void>;
}

const seeded = (): Tip[] => SEED_TIPS.map((t, i) => {
  const at = new Date(Date.UTC(2026, 9, 21, 0, 59 - i)).toISOString();
  return { ...t, createdAt: at, updatedAt: at };
});

const g = globalThis as unknown as { __schstips?: Tip[] };
const mem = () => (g.__schstips ??= seeded());

export const demoTips: TipsRepo = {
  async listTips() { return mem().map((t) => ({ ...t })); },
  async createTip(author, input) {
    const now = new Date().toISOString();
    const t: Tip = { id: crypto.randomUUID(), ...input, authorId: author.id, authorName: author.name, createdAt: now, updatedAt: now };
    mem().push(t);
    return { ...t };
  },
  async updateTip(id, input) { const t = mem().find((x) => x.id === id); if (t) Object.assign(t, input, { updatedAt: new Date().toISOString() }); },
  async deleteTip(id) { g.__schstips = mem().filter((x) => x.id !== id); },
};

const NEED30 = "생기부 팁을 저장하려면 DB 업데이트(0030)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /tips_posts/.test(e.message);
type Row = { id: string; category: TipCategory; title: string; body: string; source: string | null; author_id: string | null; author_name: string; created_at: string; updated_at: string };
const toTip = (r: Row): Tip => ({ id: r.id, category: r.category, title: r.title, body: r.body, source: r.source, authorId: r.author_id, authorName: r.author_name, createdAt: r.created_at, updatedAt: r.updated_at });

export const supabaseTips: TipsRepo = {
  async listTips() {
    const res = await db().from("tips_posts").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    if (missing(res.error)) return seeded();
    return (check(res) as Row[]).map(toTip);
  },
  async createTip(author, input) {
    const res = await db().from("tips_posts").insert({
      id: crypto.randomUUID(), category: input.category, title: input.title, body: input.body, source: input.source,
      author_id: isUuid(author.id) ? author.id : null, author_name: author.name,
    }).select("*").single();
    if (missing(res.error)) throw new Error(NEED30);
    return toTip(check(res) as Row);
  },
  async updateTip(id, input) {
    const res = await db().from("tips_posts").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
    if (missing(res.error)) throw new Error(NEED30);
    check(res);
  },
  async deleteTip(id) {
    const res = await db().from("tips_posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (missing(res.error)) throw new Error(NEED30);
    check(res);
  },
};
