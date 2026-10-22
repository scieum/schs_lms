"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/domain/policy";
import { canEditPrompt, checkPrompt, fitsStyle } from "@/lib/domain/prompt-library";
import { isStyleArea, STYLE_LIMITS, type StyleArea } from "@/lib/domain/writing-style";
import { readUpload } from "@/lib/server/hwpx";
import { identityProblem } from "@/lib/server/identity-check";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 프롬프트 보관함 (도구, 2026-10-22): 올리기 · 고치기 · 지우기 · ★ 별 · 내 스타일에 넣기 · 파일에서 글 읽기.
// 공식 프롬프트는 관리자만 올리고 고친다. 학생 이름 · 학번이 들어가면 막는다.

export type PromptResult = { ok: true; id: string } | { ok: false; error: string };
const fail = (e: unknown, msg: string) => ({ ok: false as const, error: e instanceof Error ? e.message : msg });
const done = (id: string): PromptResult => { revalidatePath("/teacher/prompts"); return { ok: true, id }; };

export async function savePrompt(input: { id?: string; official: boolean; public: boolean; area: string; subject: string | null; title: string; body: string }): Promise<PromptResult> {
  const v = await requireCan("record.write");
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 올릴 수 있어요" };
  const admin = isAdmin(v);
  const official = !!input.official;
  if (official && !admin) return { ok: false, error: "공식 프롬프트는 관리자만 올릴 수 있어요" };
  const area = String(input.area);
  const data = {
    official, public: official || !!input.public, area: area as StyleArea,
    subject: area === "세특" ? String(input.subject ?? "").trim() || null : null,
    title: String(input.title ?? "").trim(), body: String(input.body ?? "").trim(),
  };
  const bad = checkPrompt(data) ?? (await identityProblem(`${data.title}\n${data.body}`));
  if (bad) return { ok: false, error: bad };
  try {
    if (input.id) {
      const p = (await repo.listPrompts(v.accountId)).find((x) => x.id === input.id);
      if (!p || !canEditPrompt(p, { id: v.accountId, admin })) return { ok: false, error: "쓴 선생님만 고칠 수 있어요" };
      await repo.updatePrompt(p.id, data);
      await repo.audit(v.accountId, "prompt.update", p.id);
      return done(p.id);
    }
    const id = await repo.createPrompt({ id: v.accountId, name: official ? "교육과정부" : `${v.teacher.name} 선생님` }, data);
    await repo.audit(v.accountId, "prompt.create", id);
    return done(id);
  } catch (e) {
    return fail(e, "저장하지 못했어요");
  }
}

export async function deletePromptAction(id: string): Promise<PromptResult> {
  const v = await requireCan("record.write");
  const p = (await repo.listPrompts(v.accountId)).find((x) => x.id === String(id));
  if (!p || !canEditPrompt(p, { id: v.accountId, admin: isAdmin(v) })) return { ok: false, error: "쓴 선생님만 지울 수 있어요" };
  try { await repo.deletePrompt(p.id); } catch (e) { return fail(e, "지우지 못했어요"); }
  await repo.audit(v.accountId, "prompt.delete", p.id);
  return done(p.id);
}

/** ★ 별 주기 / 빼기 — 공개된 남의 글 · 공식 글에만 */
export async function togglePromptStar(id: string, on: boolean): Promise<PromptResult> {
  const v = await requireCan("record.write");
  const p = (await repo.listPrompts(v.accountId)).find((x) => x.id === String(id));
  if (!p || !p.public) return { ok: false, error: "공개된 프롬프트에만 별을 줄 수 있어요" };
  try { await repo.setPromptStar(p.id, v.accountId, !!on); } catch (e) { return fail(e, "별을 저장하지 못했어요"); }
  return done(p.id);
}

/** 내 스타일에 넣기: 그 영역 내 스타일의 프롬프트를 이 글로 바꾼다 (레퍼런스는 그대로) */
export async function applyPromptAsStyle(id: string): Promise<{ ok: true; area: StyleArea } | { ok: false; error: string }> {
  const v = await requireCan("record.write");
  const p = (await repo.listPrompts(v.accountId)).find((x) => x.id === String(id));
  if (!p || (!p.public && p.authorId !== v.accountId)) return { ok: false, error: "프롬프트를 찾지 못했어요" };
  if (!isStyleArea(p.area)) return { ok: false, error: "영역이 맞지 않아요" };
  if (!fitsStyle(p.body)) return { ok: false, error: `내 스타일에는 ${STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자까지 들어가요. 복사해서 줄여 넣어 주세요` };
  try {
    const cur = await repo.getWritingStyle(v.accountId, p.area);
    await repo.saveWritingStyle(v.accountId, p.area, { prompt: p.body.trim(), refs: cur.refs });
  } catch (e) {
    return fail(e, "내 스타일에 넣지 못했어요");
  }
  await repo.audit(v.accountId, "prompt.use", `${p.id} → ${p.area} 내 스타일`);
  return { ok: true, area: p.area };
}

/** 프롬프트 문서(HWPX · PPTX · TXT)에서 글만 읽어 온다 (저장하지 않음) */
export async function readPromptFile(form: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireCan("record.write");
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) return { ok: false, error: "파일을 골라 주세요" };
  const r = await readUpload(f);
  if (typeof r === "string") return { ok: false, error: r };
  if (!r.text?.trim()) return { ok: false, error: "글을 읽지 못했어요. HWPX · PPTX · TXT 로 올리거나 내용을 붙여 넣어 주세요" };
  return { ok: true, text: r.text.trim() };
}
