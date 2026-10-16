"use server";
import { revalidatePath } from "next/cache";
import { today } from "@/lib/domain/activity";
import {
  answeredCount, daysLeft, effectiveStatus, maskIdentity, MATERIAL_TYPES, usesDocs, usesSurvey, validateAnswers, type Program,
} from "@/lib/domain/program";
import type { Student } from "@/lib/domain/types";
import type { DocCheck } from "@/lib/domain/student-assist";
import { docCheck, followUps } from "@/lib/server/ai/student-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { pdfPages } from "@/app/(app)/teacher/programs/_lib/pdf";
import { readUpload } from "@/lib/server/hwpx";

const STUDENT_MAX_BYTES = 20 * 1024 * 1024;

/** 내가 대상이고, 발행됐고, 마감 전인 프로그램만 */
async function myOpenProgram(programId: string): Promise<{ me: Student; program: Program } | string> {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return "학생만 낼 수 있어요";
  const program = await repo.getProgram(programId);
  if (!program || program.status === "draft" || !program.targetIds.includes(v.student.id)) return "내 프로그램이 아니에요";
  const t = today();
  if (effectiveStatus(program, t) !== "open" || daysLeft(program.endDate, t) < 0) return "마감된 프로그램이에요";
  return { me: v.student, program };
}

export type SurveyState = { error?: string; errors?: Record<string, string>; saved?: "draft" | "submit"; n?: number };

/** 설문 임시 저장 · 제출. 제출은 문항마다 최소 글자 이상 (PRD F2-5) */
export async function saveSurvey(prev: SurveyState, form: FormData): Promise<SurveyState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await myOpenProgram(String(form.get("programId") ?? ""));
  if (typeof ctx === "string") return { error: ctx, n };
  const { me, program } = ctx;
  if (!usesSurvey(program.source)) return { error: "설문이 없는 프로그램이에요", n };
  const submit = form.get("intent") === "submit";
  const answers = Object.fromEntries(program.questions.map((q) => [q.id, String(form.get(`q_${q.id}`) ?? "").replace(/\r\n/g, "\n").trim()]));
  const errors = validateAnswers(program.questions, answers, submit);
  if (Object.keys(errors).length) return { errors, error: submit ? "아직 짧은 답이 있어요" : "너무 긴 답이 있어요", n };
  const prevResp = await repo.getResponse(program.id, me.id);
  await repo.saveResponse(program.id, me.id, answers, submit);
  await repo.audit(me.id, submit ? "survey.submit" : "survey.save", `${program.id} ${me.pseudonymId} ${answeredCount(program.questions, answers)}/${program.questions.length}${prevResp?.submittedAt && submit ? " (다시 제출)" : ""}`);
  revalidatePath("/student/submit");
  revalidatePath("/student");
  return { saved: submit ? "submit" : "draft", n };
}

export type DocState = { error?: string; done?: string; n?: number };

/** 내 서류 올리기 (프로그램이 서류 제출을 요청한 경우) */
export async function uploadMyDoc(prev: DocState, form: FormData): Promise<DocState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await myOpenProgram(String(form.get("programId") ?? ""));
  if (typeof ctx === "string") return { error: ctx, n };
  const { me, program } = ctx;
  if (!usesDocs(program.source) || !program.requestDocs) return { error: "서류를 받지 않는 프로그램이에요", n };
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "파일을 골라 주세요", n };
  if (f.size > STUDENT_MAX_BYTES) return { error: "20MB까지 올릴 수 있어요", n };
  const up = await readUpload(f);
  if (typeof up === "string") return { error: up, n };
  if (!(MATERIAL_TYPES as readonly string[]).includes(up.mime)) return { error: "PDF, HWPX, JPG, PNG, TXT 파일만 올릴 수 있어요", n };
  const mine = (await repo.listMaterialsByStudent(me.id)).filter((m) => m.programId === program.id);
  if (mine.length >= 5) return { error: "한 프로그램에 5개까지 올릴 수 있어요", n };
  const { bytes, mime } = up;
  const people = [{ name: me.name, studentNo: me.studentNo }];
  await repo.addMaterial({
    programId: program.id, studentId: me.id, fileName: f.name.slice(0, 120), mime, size: f.size,
    pages: mime === "application/pdf" ? await pdfPages(bytes) : mime.startsWith("image/") ? 1 : null,
    status: "matched", matchedBy: "student", uploaderId: me.id,
    text: up.text ? maskIdentity(up.text.slice(0, 4000), people) : null,
  }, bytes);
  await repo.audit(me.id, "material.student", `${program.id} ${me.pseudonymId}`);
  revalidatePath("/student/submit");
  revalidatePath("/student");
  return { done: "올렸어요", n };
}

export type HintState = { asks?: Record<string, string[]>; label?: "AI" | "자동"; error?: string; n?: number };

/** 작성 도우미: 문항마다 "이 답에 더 쓸 수 있는 것" 질문 2개 (대신 쓰지 않음, 제출되지 않음). 이름·학번은 가려서 보낸다 */
export async function hintAction(prev: HintState, form: FormData): Promise<HintState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await myOpenProgram(String(form.get("programId") ?? ""));
  if (typeof ctx === "string") return { error: ctx, n };
  const { me, program } = ctx;
  const people = [{ name: me.name, studentNo: me.studentNo }];
  const answers = Object.fromEntries(program.questions.map((q) => [q.id, maskIdentity(String(form.get(`q_${q.id}`) ?? "").slice(0, 600), people)]));
  const r = await followUps(program.questions, answers);
  await repo.audit(me.id, "survey.ai.hint", `${program.id} ${me.pseudonymId} ${r.label}`);
  return { asks: Object.fromEntries(r.items.map((x) => [x.id, x.asks])), label: r.label, error: r.error ? "AI가 답하지 않아 기본 질문을 보여 줘요" : undefined, n };
}

export type DocCheckState = { checks?: DocCheck[]; label?: "AI" | "자동"; error?: string; n?: number };

/** 서류 빠진 항목 점검: 낸 서류 종류 대비. 본문은 TXT(가린 글)만 보내고, 파일 이름도 가린다 */
export async function docCheckAction(prev: DocCheckState, form: FormData): Promise<DocCheckState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await myOpenProgram(String(form.get("programId") ?? ""));
  if (typeof ctx === "string") return { error: ctx, n };
  const { me, program } = ctx;
  if (!usesDocs(program.source) || !program.requestDocs) return { error: "서류를 받지 않는 프로그램이에요", n };
  const people = [{ name: me.name, studentNo: me.studentNo }];
  const files = (await repo.listMaterialsByStudent(me.id))
    .filter((m) => m.programId === program.id)
    .map((m) => ({ name: maskIdentity(m.fileName, people), text: m.text ? maskIdentity(m.text, people) : null }));
  const r = await docCheck(program.docKinds, files);
  await repo.audit(me.id, "material.ai.check", `${program.id} ${me.pseudonymId} ${r.label}`);
  return { checks: r.checks, label: r.label, error: r.error ? "AI가 답하지 않아 기본 점검을 보여 줘요" : undefined, n };
}
