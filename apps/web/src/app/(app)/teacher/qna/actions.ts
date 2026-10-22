"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/domain/policy";
import { canEditQuestion, checkAnswer, checkQuestion, type QnaCategory } from "@/lib/domain/qna";
import { identityProblem } from "@/lib/server/identity-check";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 문의 게시판 (도구, 2026-10-22): 묻기 · 고치기 · 지우기는 물은 교사 본인(답 전) · 관리자, 답하기는 관리자만.
// 학생 이름 · 학번이 들어가면 막는다 (학교 선생님 모두가 본다).

export type QnaResult = { ok: true; id: string } | { ok: false; error: string };
const fail = (e: unknown, msg: string): QnaResult => ({ ok: false, error: e instanceof Error ? e.message : msg });

export async function saveQuestion(input: { id?: string; category: string; title: string; question: string }): Promise<QnaResult> {
  const v = await requireCan("record.write");
  if (v.kind !== "teacher") return { ok: false, error: "선생님만 물을 수 있어요" };
  const data = { category: String(input.category) as QnaCategory, title: String(input.title ?? "").trim(), question: String(input.question ?? "").trim() };
  const bad = checkQuestion(data) ?? (await identityProblem(`${data.title}\n${data.question}`));
  if (bad) return { ok: false, error: bad };
  try {
    if (input.id) {
      const post = (await repo.listQna()).find((p) => p.id === input.id);
      if (!post || !canEditQuestion(post, { id: v.accountId, admin: isAdmin(v) })) return { ok: false, error: "답이 달리기 전, 물은 선생님만 고칠 수 있어요" };
      await repo.updateQuestion(post.id, data);
      await repo.audit(v.accountId, "qna.update", post.id);
      revalidatePath("/teacher/qna");
      return { ok: true, id: post.id };
    }
    const post = await repo.createQuestion({ id: v.accountId, name: `${v.teacher.name} 선생님` }, data);
    await repo.audit(v.accountId, "qna.create", post.id);
    revalidatePath("/teacher/qna");
    return { ok: true, id: post.id };
  } catch (e) {
    return fail(e, "저장하지 못했어요");
  }
}

export async function answerQuestionAction(id: string, answer: string): Promise<QnaResult> {
  const v = await requireCan("record.write");
  if (!isAdmin(v)) return { ok: false, error: "답은 관리자만 달 수 있어요" };
  const text = String(answer ?? "").trim();
  const bad = checkAnswer(text) ?? (await identityProblem(text));
  if (bad) return { ok: false, error: bad };
  const post = (await repo.listQna()).find((p) => p.id === String(id));
  if (!post) return { ok: false, error: "글을 찾지 못했어요" };
  try {
    await repo.answerQuestion(post.id, text, "교육과정부");
  } catch (e) {
    return fail(e, "답을 저장하지 못했어요");
  }
  await repo.audit(v.accountId, "qna.answer", post.id);
  revalidatePath("/teacher/qna");
  return { ok: true, id: post.id };
}

export async function deleteQuestionAction(id: string): Promise<QnaResult> {
  const v = await requireCan("record.write");
  const post = (await repo.listQna()).find((p) => p.id === String(id));
  if (!post || !canEditQuestion(post, { id: v.accountId, admin: isAdmin(v) })) return { ok: false, error: "답이 달리기 전, 물은 선생님만 지울 수 있어요" };
  try {
    await repo.deleteQuestion(post.id);
  } catch (e) {
    return fail(e, "지우지 못했어요");
  }
  await repo.audit(v.accountId, "qna.delete", post.id);
  revalidatePath("/teacher/qna");
  return { ok: true, id: post.id };
}
