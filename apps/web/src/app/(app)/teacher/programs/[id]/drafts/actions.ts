"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { measure, resolveLength, UNIT_LABEL, type DraftCategory } from "@/lib/domain/length";
import { fixRecord } from "@/lib/server/ai/merge-record";
import type { WriteKind } from "@/lib/server/ai/write-record";
import type { AiFixResult } from "@/lib/domain/variants";
import { buildEvidence, checkDraft, maskIdentity } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resetDraftJob, runDraftJobs } from "@/lib/server/ai/draft";
import { rephraseSentence, reviewDraft, type ReviewItem } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { canOwn } from "../../_lib/data";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { latestVersion } from "@/lib/domain/program";
import type { ClassCheckView } from "@/lib/domain/class-check";
import { buildClassView, classAudit } from "@/lib/server/class-check";
import { classProv, confirmAudit, provForSave } from "@/lib/server/provenance";
import { programMemo } from "@/lib/server/program-memo";

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
  revalidatePath("/teacher/programs/[id]/drafts", "page");
  revalidatePath(`/teacher/programs/${programId}`);
};

/** needReason (N38): 적게 고친 채 확정 — 까닭을 받아 다시 확정 */
export type SaveState = { error?: string; saved?: "draft" | "finalized" | "rejected"; n?: number; needReason?: { ratio: number; nosource: number; n: number } };

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

  // N38: 이 초안의 AI 원안은 서버가 앞 버전에서 이어 받는다 (화면 값을 믿지 않음). 적게 고친 채 확정이면 까닭을 받는다
  const prevVersion = latestVersion(await repo.listDraftVersions({ jobIds: [job.id] }), job.id);
  const pv = intent === "rejected"
    ? null
    : await provForSave({ aiOriginalId: prevVersion?.aiOriginalId, pins: form.get("pins"), content, studentId: student.id, confirm: intent === "finalized", reason: String(form.get("lowEditReason") ?? "") });
  if (pv?.needReason) return { needReason: { ratio: pv.ratio ?? 0, nosource: pv.nosource, n: Date.now() }, n };

  const added = await repo.addDraftVersion({
    jobId: job.id, programId: program.id, studentId: student.id, content, status: intent,
    reason: intent === "rejected" ? reason : null, source: "manual", authorId: v.accountId,
    ...(pv?.prov ?? (prevVersion?.aiOriginalId ? { aiOriginalId: prevVersion.aiOriginalId } : {})),
  });
  if (intent === "finalized" && pv?.ratio != null) await repo.audit(v.accountId, "record.confirm", confirmAudit("program", added.id, pv));
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
  if (ctx.program.source === "external") return { error: "외부 글 프로그램은 AI로 다시 만들지 않아요 · 직접 고치거나 다시 넣어 주세요", n };
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
  const [response, materials, memo] = await Promise.all([repo.getResponse(program.id, student.id), repo.listMaterials(program.id), programMemo(program.id, student.id)]);
  const evidence = buildEvidence(program, response, materials.filter((m) => m.studentId === student.id), memo?.content)
    .map((e) => ({ label: maskIdentity(e.label, people), text: maskIdentity(e.text, people) }));
  // 초안에 이름이 있으면 가려서 보낸다. 제안의 phrase 는 가린 글 기준이라, 이름이 섞인 문장은 반영되지 않을 수 있다
  const r = await reviewDraft(maskIdentity(draft, people), evidence);
  await repo.audit(ctx.v.accountId, "draft.ai.review", `${program.id} ${student.pseudonymId} ${r.label}`);
  return { items: r.items, label: r.label, error: r.error, n };
}

const KIND: Record<DraftCategory, WriteKind> = { 세특: "세특", "창체-자율": "자율·자치", "창체-동아리": "동아리", "창체-진로": "진로" };

/** AI로 고치기 (Figma N34): 자동 검사에 걸린 곳만 고친 글. 저장하지 않는다 (교사가 "본문에 넣기" → 직접 수정·확정) */
export async function aiFixDraft(input: { jobId: string; text: string; batch?: boolean }): Promise<AiFixResult> {
  const ctx = await loadJob(String(input?.jobId ?? ""));
  if (!ctx) return { ok: false, error: "내 프로그램 초안만 다룰 수 있어요" };
  const text = String(input.text ?? "").slice(0, 6000);
  if (!text.trim()) return { ok: false, error: "본문이 비어 있어요" };
  const range = resolveLength(ctx.program.area, { unit: ctx.job.unit, max: ctx.job.max });
  // N41: 화면 검사와 같은 "근거보다 높은 평가" 행도 고친다 (근거 글은 검사에만 — AI에는 걸린 말만)
  const [response, materials, memo] = await Promise.all([repo.getResponse(ctx.program.id, ctx.student.id), repo.listMaterials(ctx.program.id), programMemo(ctx.program.id, ctx.student.id)]);
  const evidence = buildEvidence(ctx.program, response, materials.filter((m) => m.studentId === ctx.student.id && m.status === "matched"), memo?.content).map((e) => e.text).join(" / ");
  const r = await fixRecord({ kind: KIND[ctx.program.area], student: ctx.student, text, range, praise: { level: null, evidence } });
  await repo.audit(ctx.v.accountId, "draft.ai_fix", `${ctx.program.id} ${ctx.student.pseudonymId}${input.batch ? " class" : ""}`);
  return { ok: true, text: r.text, changes: r.changes, label: r.label, bytes: measure(r.text, range.unit), notice: r.notice };
}

export type RephraseState ={ sentence?: string; options?: string[]; label?: "AI" | "자동"; error?: string; n?: number };

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
  const [response, materials, memo] = await Promise.all([repo.getResponse(program.id, student.id), repo.listMaterials(program.id), programMemo(program.id, student.id)]);
  const evidence = buildEvidence(program, response, materials.filter((m) => m.studentId === student.id), memo?.content)
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

/** 반 전체 검사 (Figma N35 ①): 이 프로그램 학생들의 최신 초안을 규칙으로만 (AI 없음). 확정한 초안은 locked */
export async function classCheckDrafts(input: { programId: string }): Promise<ClassCheckView> {
  const v = await requireCan("draft.review");
  const program = await repo.getProgram(String(input?.programId ?? ""));
  if (!program || !canOwn(v, program)) return { ok: false, error: "내 프로그램 초안만 검사할 수 있어요" };
  const [jobs, versions, students] = await Promise.all([repo.listDraftJobs({ programIds: [program.id] }), repo.listDraftVersions({ programIds: [program.id] }), repo.listStudents()]);
  const byId = new Map(students.map((s) => [s.id, s]));
  // N38: 근거 없는 문장 · 수정 비율 (AI 원안이 있는 초안만)
  const lasts = jobs.map((j) => latestVersion(versions, j.id));
  const [originals, settings] = await Promise.all([repo.listAiOriginals(lasts.map((x) => x?.aiOriginalId ?? "").filter(Boolean)), repo.getProvenanceSettings()]);
  const origOf = new Map(originals.map((o) => [o.id, o]));
  const view = buildClassView(jobs.flatMap((j) => {
    const s = byId.get(j.studentId);
    if (!s) return [];
    const last = latestVersion(versions, j.id);
    const text = last && last.status !== "rejected" ? last.content : "";
    return [{
      id: j.id, student: s, text, locked: last?.status === "finalized",
      ...classProv(last?.aiOriginalId && text ? origOf.get(last.aiOriginalId) : undefined, last, text, settings),
      range: resolveLength(program.area, { unit: j.unit, max: j.max }),
      href: `/teacher/programs/${program.id}/drafts?d=${j.id}&check=1`,
    }];
  }).sort((a, b) => a.student.classNo - b.student.classNo || a.student.number - b.student.number));
  await repo.audit(v.accountId, "draft.class_check", classAudit(program.id, view));
  return view;
}
