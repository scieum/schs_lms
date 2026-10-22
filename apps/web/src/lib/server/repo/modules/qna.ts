import "server-only";
import { SEED_QNA, type QnaCategory, type QnaPost } from "@/lib/domain/qna";
import { check, db, isUuid } from "../supabase";

// 문의 게시판 (2026-10-22). 표 0035_qna.sql (처음 문답 함께). 지우기는 deleted_at 만 채운다 (C4).
// 적용 전 DB면 읽기는 처음 문답(코드에 있는 것)만, 쓰기는 안내 문구로 실패한다.

export type QuestionInput = { category: QnaCategory; title: string; question: string };

export interface QnaRepo {
  listQna(): Promise<QnaPost[]>;
  createQuestion(author: { id: string; name: string }, input: QuestionInput): Promise<QnaPost>;
  updateQuestion(id: string, input: QuestionInput): Promise<void>;
  answerQuestion(id: string, answer: string, by: string): Promise<void>;
  deleteQuestion(id: string): Promise<void>;
  /** AI 답 초안 적기 (0037 전 DB면 조용히 건너뜀) */
  setQnaDraft(id: string, draft: string): Promise<void>;
}

const g = globalThis as unknown as { __schsqna?: QnaPost[] };
const mem = () => (g.__schsqna ??= SEED_QNA.map((p) => ({ ...p })));

export const demoQna: QnaRepo = {
  async listQna() { return mem().map((p) => ({ ...p })); },
  async createQuestion(author, input) {
    const p: QnaPost = { id: crypto.randomUUID(), ...input, answer: null, authorId: author.id, authorName: author.name, answeredBy: null, createdAt: new Date().toISOString(), answeredAt: null };
    mem().push(p);
    return { ...p };
  },
  async updateQuestion(id, input) { const p = mem().find((x) => x.id === id); if (p) Object.assign(p, input); },
  async answerQuestion(id, answer, by) { const p = mem().find((x) => x.id === id); if (p) Object.assign(p, { answer, answeredBy: by, answeredAt: new Date().toISOString() }); },
  async deleteQuestion(id) { g.__schsqna = mem().filter((x) => x.id !== id); },
  async setQnaDraft(id, draft) { const p = mem().find((x) => x.id === id); if (p) p.draftAnswer = draft; },
};

const NEED35 = "문의 게시판을 쓰려면 DB 업데이트(0035)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /qna_posts/.test(e.message);
type Row = { id: string; category: QnaCategory; title: string; question: string; answer: string | null; author_id: string | null; author_name: string; answered_by: string | null; created_at: string; answered_at: string | null; draft_answer?: string | null };
const toPost = (r: Row): QnaPost => ({ id: r.id, category: r.category, title: r.title, question: r.question, answer: r.answer, authorId: r.author_id, authorName: r.author_name, answeredBy: r.answered_by, createdAt: r.created_at, answeredAt: r.answered_at, draftAnswer: r.draft_answer ?? null });

export const supabaseQna: QnaRepo = {
  async listQna() {
    const res = await db().from("qna_posts").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    if (missing(res.error)) return SEED_QNA.map((p) => ({ ...p }));
    return (check(res) as Row[]).map(toPost);
  },
  async createQuestion(author, input) {
    const res = await db().from("qna_posts").insert({ id: crypto.randomUUID(), ...input, author_id: isUuid(author.id) ? author.id : null, author_name: author.name }).select("*").single();
    if (missing(res.error)) throw new Error(NEED35);
    return toPost(check(res) as Row);
  },
  async updateQuestion(id, input) {
    const res = await db().from("qna_posts").update(input).eq("id", id).is("deleted_at", null);
    if (missing(res.error)) throw new Error(NEED35);
    check(res);
  },
  async answerQuestion(id, answer, by) {
    const res = await db().from("qna_posts").update({ answer, answered_by: by, answered_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
    if (missing(res.error)) throw new Error(NEED35);
    check(res);
  },
  async deleteQuestion(id) {
    const res = await db().from("qna_posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (missing(res.error)) throw new Error(NEED35);
    check(res);
  },
  async setQnaDraft(id, draft) {
    const res = await db().from("qna_posts").update({ draft_answer: draft }).eq("id", id);
    if (res.error && /draft_answer|qna_posts/.test(res.error.message)) return;
    check(res);
  },
};
