import "server-only";
import type { PromptDoc } from "@/lib/domain/prompt-library";
import type { StyleArea } from "@/lib/domain/writing-style";
import { check, db, isUuid } from "../supabase";

// 프롬프트 보관함 (도구, 2026-10-22). 표 0036_prompt_library.sql (prompt_docs · prompt_stars). 지우기는 deleted_at 만 채운다 (C4).
// 적용 전 DB면 읽기는 빈 목록(앱 기본 프롬프트만 보임), 쓰기는 안내 문구로 실패한다.

export type PromptSave = { official: boolean; public: boolean; area: StyleArea; subject: string | null; title: string; body: string };

export interface PromptsRepo {
  /** 지우지 않은 글 모두 + 별 수 · 내가 별을 줬나 (비공개 남의 글은 액션에서 거른다) */
  listPrompts(viewerId: string): Promise<PromptDoc[]>;
  createPrompt(author: { id: string; name: string }, input: PromptSave): Promise<string>;
  updatePrompt(id: string, input: PromptSave): Promise<void>;
  deletePrompt(id: string): Promise<void>;
  setPromptStar(promptId: string, accountId: string, on: boolean): Promise<void>;
}

type Stored = Omit<PromptDoc, "stars" | "starred"> & { starBy: Set<string> };
const g = globalThis as unknown as { __schsprompts?: Stored[] };
const mem = () => (g.__schsprompts ??= []);
const view = (p: Stored, me: string): PromptDoc => {
  const { starBy, ...rest } = p;
  return { ...rest, stars: starBy.size, starred: starBy.has(me) };
};

export const demoPrompts: PromptsRepo = {
  async listPrompts(me) { return mem().map((p) => view(p, me)); },
  async createPrompt(author, input) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    mem().push({ id, ...input, authorId: author.id, authorName: author.name, createdAt: now, updatedAt: now, starBy: new Set() });
    return id;
  },
  async updatePrompt(id, input) { const p = mem().find((x) => x.id === id); if (p) Object.assign(p, input, { updatedAt: new Date().toISOString() }); },
  async deletePrompt(id) { g.__schsprompts = mem().filter((x) => x.id !== id); },
  async setPromptStar(id, who, on) { const p = mem().find((x) => x.id === id); if (p) { if (on) p.starBy.add(who); else p.starBy.delete(who); } },
};

const NEED36 = "프롬프트 보관함을 쓰려면 DB 업데이트(0036)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /prompt_(docs|stars)/.test(e.message);
type Row = { id: string; official: boolean; public: boolean; area: StyleArea; subject: string | null; title: string; body: string; author_id: string | null; author_name: string; created_at: string; updated_at: string };

export const supabasePrompts: PromptsRepo = {
  async listPrompts(me) {
    const res = await db().from("prompt_docs").select("*").is("deleted_at", null);
    if (missing(res.error)) return [];
    const rows = check(res) as Row[];
    const stars = await db().from("prompt_stars").select("prompt_id, account_id");
    const all = missing(stars.error) ? [] : (check(stars) as { prompt_id: string; account_id: string }[]);
    return rows.map((r) => {
      const mine = all.filter((s) => s.prompt_id === r.id);
      return { id: r.id, official: r.official, public: r.public, area: r.area, subject: r.subject, title: r.title, body: r.body, authorId: r.author_id, authorName: r.author_name, createdAt: r.created_at, updatedAt: r.updated_at, stars: mine.length, starred: mine.some((s) => s.account_id === me) };
    });
  },
  async createPrompt(author, input) {
    const id = crypto.randomUUID();
    const res = await db().from("prompt_docs").insert({ id, ...input, author_id: isUuid(author.id) ? author.id : null, author_name: author.name });
    if (missing(res.error)) throw new Error(NEED36);
    check(res);
    return id;
  },
  async updatePrompt(id, input) {
    const res = await db().from("prompt_docs").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
    if (missing(res.error)) throw new Error(NEED36);
    check(res);
  },
  async deletePrompt(id) {
    const res = await db().from("prompt_docs").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (missing(res.error)) throw new Error(NEED36);
    check(res);
  },
  async setPromptStar(id, who, on) {
    if (!isUuid(who)) throw new Error("이 계정은 별을 줄 수 없어요");
    const res = on
      ? await db().from("prompt_stars").upsert({ prompt_id: id, account_id: who }, { onConflict: "prompt_id,account_id" })
      : await db().from("prompt_stars").delete().eq("prompt_id", id).eq("account_id", who);
    if (missing(res.error)) throw new Error(NEED36);
    check(res);
  },
};
