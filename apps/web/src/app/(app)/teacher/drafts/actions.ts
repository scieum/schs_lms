"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { resolveLength, UNIT_LABEL } from "@/lib/domain/length";
import { buildEvidence, checkDraft, maskIdentity } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
import { rephraseSentence, reviewDraft, type ReviewItem } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { canOwn } from "../programs/_lib/data";
import { forbiddenBlock } from "@/lib/domain/forbidden";

/** 이 초안 작업을 다룰 수 있는 교사인지 (자기 프로그램 · 관리자) */
async function loadJob(jobId: string) {
  const v = await requireCan("draft.review");
  const job = await repo.getDraftJob(jobId);
  if (!job) return null;
  const [program, student] = await Promise.all([repo.getProgram(job.programId), repo.getStudent(job.studentId)]);
  if (!program || !student || !canOwn(v, program)) return null;
  return { v, job, program, student };
}

const refresh = (programId: string) => {
  revalidatePath("/teacher/drafts");
  revalidatePath(`/teacher/programs/${programId}`);
};

export type SaveState = { error?: string; saved?: "draft" | "finalized" | "rejected"; n?: number };

const Save = z.object({
  jobId: z.string().min(1),
  content: z.string().max(5000, "너무 길어요"),
  intent: z.enum(["draft", "finalized", "rejected"]),
  reason: z.string().max(300).optional().default(""),
});

/**
 * 직접 수정(draft) · 확정(finalized) · 반려(rejected, 사유 필수).
 * 언제나 새 버전을 추가한다 (C4). 확정은 교사만 (C10), NEIS 한도를 넘거나 실명·학번이 있으면 확정할 수 없다 (C7).
 */
export async function saveDraft(prev: SaveState, form: FormData): Promise<SaveState> {
  const n = (prev.n ?? 0) + 1;
  const p = Save.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요", n };
  const ctx = await loadJob(p.data.jobId);
  if (!ctx) return { error: "내 프로그램 초안만 다룰 수 있어요", n };
  const { v, job, program, student } = ctx;
  const content = p.data.content.replace(/\r\n/g, "\n").trim();
  const intent = p.data.intent;
  const reason = p.data.reason.trim();

  if (intent === "rejected" && !reason) return { error: "반려 사유를 써 주세요", n };
  if (intent !== "rejected" && !content) return { error: "빈 초안은 저장할 수 없어요", n };
  if (intent === "finalized") {
    const range = resolveLength(program.area, { unit: job.unit, max: job.max });
    const c = checkDraft(content, { range, people: [{ name: student.name, studentNo: student.studentNo }], evidence: [] });
    // 분량 초과는 교사가 확인(allowOver)하면 확정한다
    if (c.length.reason === "too_long" && form.get("allowOver") !== "on") return { error: `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}를 넘었어요. 이대로 확정하려면 분량 초과 확인에 체크해 주세요`, n };
    if (c.length.reason === "too_long") await repo.audit(v.accountId, "draft.over_length", `${program.id} ${student.pseudonymId} ${c.length.value}/${range.max}`);
    if (!c.identity.ok) return { error: `${c.identity.found.join("·")}이 들어 있어 확정할 수 없어요`, n };
    const banned = forbiddenBlock(content);
    if (banned) return { error: banned, n };
  }

  await repo.addDraftVersion({
    jobId: job.id, programId: program.id, studentId: student.id, content, status: intent,
    reason: intent === "rejected" ? reason : null, source: "manual", authorId: v.accountId,
  });
  // 실패 건을 교사가 직접 쓰면 파이프라인에서도 처리된 것으로 본다
  if (job.state !== "DONE" && intent !== "rejected") await repo.updateDraftJob(job.id, { state: "DONE", error: null });
  await repo.audit(v.accountId, `draft.${intent === "finalized" ? "finalize" : intent === "rejected" ? "reject" : "edit"}`, `${program.id} ${student.pseudonymId}`);
  refresh(program.id);
  return { saved: intent, n };
}

export type RegenState = { error?: string; done?: string; n?: number };

/** 분량 바꿔 다시 만들기. 앞 버전은 그대로 남는다 */
export async function regenerateDraft(prev: RegenState, form: FormData): Promise<RegenState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await loadJob(String(form.get("jobId") ?? ""));
  if (!ctx) return { error: "내 프로그램 초안만 다룰 수 있어요", n };
  const unit = form.get("lengthUnit") === "chars" ? "chars" : "bytes";
  const range = resolveLength(ctx.program.area, { unit, max: Number(form.get("lengthMax")) || undefined });
  await resetDraftJob(ctx.job.id, { unit: range.unit, max: range.max });
  await repo.audit(ctx.v.accountId, "draft.regenerate", `${ctx.program.id} ${ctx.student.pseudonymId} ${range.max}${range.unit}`);
  if (aiEnabled()) {
    after(() => runDraftJobs([ctx.job.id]));
    refresh(ctx.program.id);
    return { done: "다시 만드는 중이에요. 잠시 뒤 새로고침해 주세요", n };
  }
  const r = await runDraftJobs([ctx.job.id]);
  refresh(ctx.program.id);
  return r.done ? { done: `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}로 예시 초안을 다시 만들었어요`, n } : { error: "다시 만들지 못했어요 (근거 자료를 확인해 주세요)", n };
}

export type ReviewState = { items?: ReviewItem[]; label?: "AI" | "자동"; error?: string; n?: number };

/** AI 검토 도우미: 제안만 돌려준다. "제안 반영"은 화면에서 본문만 바꾸고, 저장은 교사가 한다 */
export async function reviewDraftAction(prev: ReviewState, form: FormData): Promise<ReviewState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await loadJob(String(form.get("jobId") ?? ""));
  if (!ctx) return { error: "내 프로그램 초안만 다룰 수 있어요", n };
  const { program, student } = ctx;
  const set = new Set(program.targetIds);
  const people = (await repo.listStudents()).filter((s) => set.has(s.id) || s.id === student.id).map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const draft = String(form.get("content") ?? "").slice(0, 5000);
  if (!draft.trim()) return { error: "검토할 초안이 없어요", n };
  const [response, materials] = await Promise.all([repo.getResponse(program.id, student.id), repo.listMaterials(program.id)]);
  const evidence = buildEvidence(program, response, materials.filter((m) => m.studentId === student.id))
    .map((e) => ({ label: maskIdentity(e.label, people), text: maskIdentity(e.text, people) }));
  // 초안에 이름이 있으면 가려서 보낸다. 제안의 phrase 는 가린 글 기준이라, 이름이 섞인 문장은 반영되지 않을 수 있다
  const r = await reviewDraft(maskIdentity(draft, people), evidence);
  await repo.audit(ctx.v.accountId, "draft.ai.review", `${program.id} ${student.pseudonymId} ${r.label}`);
  return { items: r.items, label: r.label, error: r.error, n };
}

export type RephraseState = { sentence?: string; options?: string[]; label?: "AI" | "자동"; error?: string; n?: number };

/**
 * 선택 문장 다르게 쓰기: 문장 하나 → 문체 규칙(record-prompts)에 맞춘 2~3안. 저장하지 않는다.
 * 교사가 고른 안만 화면 본문에 들어가고, 저장·확정은 교사가 한다. 이름·학번은 가린 뒤 보낸다.
 */
export async function rephraseAction(prev: RephraseState, form: FormData): Promise<RephraseState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await loadJob(String(form.get("jobId") ?? ""));
  if (!ctx) return { error: "내 프로그램 초안만 다룰 수 있어요", n };
  const { program, student } = ctx;
  const sentence = String(form.get("sentence") ?? "").trim().slice(0, 600);
  if (sentence.replace(/\s/g, "").length < 4) return { error: "바꿀 문장을 본문에서 골라 주세요", n };
  const set = new Set(program.targetIds);
  const people = (await repo.listStudents()).filter((s) => set.has(s.id) || s.id === student.id).map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const [response, materials] = await Promise.all([repo.getResponse(program.id, student.id), repo.listMaterials(program.id)]);
  const evidence = buildEvidence(program, response, materials.filter((m) => m.studentId === student.id))
    .map((e) => ({ label: maskIdentity(e.label, people), text: maskIdentity(e.text, people).slice(0, 1500) }));
  const avoid = String(form.get("avoid") ?? "").trim().slice(0, 600);
  const r = await rephraseSentence(program, maskIdentity(sentence, people), {
    draft: maskIdentity(String(form.get("content") ?? "").slice(0, 5000), people),
    evidence,
    avoid: avoid ? maskIdentity(avoid, people) : undefined,
  });
  await repo.audit(ctx.v.accountId, "draft.ai.rephrase", `${program.id} ${student.pseudonymId} ${r.label}${avoid ? " 유사" : ""}`);
  if (r.options.length === 0) return { sentence, options: [], label: r.label, error: r.error ?? "AI가 꺼져 있어 바꿀 안이 없어요. 직접 고쳐 주세요", n };
  return { sentence, options: r.options, label: r.label, error: r.error, n };
}
