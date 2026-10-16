"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveLength } from "@/lib/domain/length";
import { today } from "@/lib/domain/activity";
import { AREA_LABEL, buildQuestions, isArea, usesDocs, usesSurvey } from "@/lib/domain/program";
import { checkPlanFile, extractPlanHints, mergePlan, PLAN_MAX_FILES, type PlanRead } from "@/lib/domain/program-plan";
import { aiEnabled } from "@/lib/server/ai/claude";
import { readPlan, suggestQuestions } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import type { NewProgram } from "@/lib/server/repo/modules/programs";
import { requireCan } from "@/lib/server/viewer";
import { requireProgram } from "../_lib/data";
import { pdfInfo } from "../_lib/pdf";
import { readUpload } from "@/lib/server/hwpx";

export type CreateState = { error?: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "기간을 골라 주세요");
const Schema = z.object({
  title: z.string().trim().min(2, "프로그램 이름을 써 주세요").max(60, "이름은 60자까지예요"),
  subject: z.string().trim().max(30).optional().default(""),
  area: z.string().refine(isArea, "기록 영역을 골라 주세요"),
  lengthUnit: z.enum(["bytes", "chars"]),
  lengthMax: z.coerce.number().int().min(1, "초안 분량을 넣어 주세요"),
  startDate: date,
  endDate: date,
  overview: z.string().trim().max(1000, "활동 개요는 1000자까지예요").optional().default(""),
  source: z.enum(["survey", "docs", "both"]),
  intent: z.enum(["draft", "open", "save"]),
});

type Fields = Omit<NewProgram, "ownerId" | "status"> & { intent: "draft" | "open" | "save" };

/** 등록·수정 폼 읽기. 담당 교사는 실제 교사만, 나(등록한 교사)는 빼고 저장한다 */
async function readProgramForm(form: FormData, ownerId: string): Promise<{ error: string } | { f: Fields }> {
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const d = p.data;
  if (d.endDate < d.startDate) return { error: "마감일이 시작일보다 빨라요" };
  if (!isArea(d.area)) return { error: "기록 영역을 골라 주세요" };

  const questions = usesSurvey(d.source) ? buildQuestions(form.getAll("extra").map(String)) : [];
  if (typeof questions === "string") return { error: questions };
  const docKinds = [...new Set(form.getAll("docKind").map((x) => String(x).trim()).filter(Boolean))].slice(0, 8);
  const requestDocs = usesDocs(d.source) && form.get("requestDocs") === "on";

  const [students, teachers] = await Promise.all([repo.listStudents(), repo.listTeachers()]);
  const known = new Set(students.map((s) => s.id));
  const targetIds = [...new Set(form.getAll("target").map(String))].filter((id) => known.has(id));
  if (d.intent !== "draft" && targetIds.length === 0) return { error: "대상 학생을 골라 주세요" };
  if (d.area === "세특" && !d.subject) return { error: "교과세특은 담당 교과를 써 주세요" };
  const teacherIds = new Set(teachers.map((t) => t.id));
  const coOwnerIds = [...new Set(form.getAll("coOwner").map(String))].filter((id) => id !== ownerId && teacherIds.has(id)).slice(0, 10);

  const range = resolveLength(d.area, { unit: d.lengthUnit, max: d.lengthMax });
  return {
    f: {
      coOwnerIds, title: d.title, subject: d.subject || null, area: d.area, unit: range.unit, max: range.max,
      startDate: d.startDate, endDate: d.endDate, source: d.source, requestDocs, docKinds, questions, targetIds, overview: d.overview, intent: d.intent,
    },
  };
}

/** 프로그램 등록 (임시 저장 또는 발행). 발행하면 대상 학생 화면에 설문·서류 제출이 열린다 */
export async function createProgramAction(_: CreateState, form: FormData): Promise<CreateState> {
  const v = await requireCan("program.manage");
  const r = await readProgramForm(form, v.accountId);
  if ("error" in r) return r;
  const { intent, ...f } = r.f;
  const status = intent === "open" ? "open" : "draft";
  const program = await repo.createProgram({ ...f, ownerId: v.accountId, status });
  await repo.audit(v.accountId, status === "open" ? "program.publish" : "program.save", `${program.id} ${AREA_LABEL[f.area]} ${f.targetIds.length}명 담당 ${1 + f.coOwnerIds.length}명`);
  redirect(`/teacher/programs/${program.id}`);
}

/**
 * 프로그램 수정 (담당 교사·관리자). 임시 저장본은 그대로 저장하거나 발행할 수 있고,
 * 발행된 프로그램은 상태를 그대로 둔 채 내용만 고친다. 이미 받은 응답은 지우지 않는다.
 */
export async function updateProgramAction(id: string, _: CreateState, form: FormData): Promise<CreateState> {
  const { v, program } = await requireProgram(id);
  const r = await readProgramForm(form, program.ownerId);
  if ("error" in r) return r;
  const { intent, ...f } = r.f;
  const status = program.status === "draft" ? (intent === "open" ? "open" : "draft") : program.status;
  await repo.updateProgram(id, { ...f, status });
  await repo.audit(v.accountId, status !== program.status ? "program.publish" : "program.edit", `${id} ${f.targetIds.length}명 담당 ${1 + f.coOwnerIds.length}명`);
  redirect(`/teacher/programs/${id}`);
}

export type SuggestState = { questions?: string[]; error?: string; n?: number };

/** AI 문항 추천: 저장하지 않는다. 교사가 "확인 후 문항에 추가"를 눌러야 들어간다 */
export async function suggestQuestionsAction(prev: SuggestState, form: FormData): Promise<SuggestState> {
  const v = await requireCan("program.manage");
  const title = String(form.get("title") ?? "").trim();
  const overview = String(form.get("overview") ?? "").trim().slice(0, 1000);
  const area = String(form.get("area") ?? "");
  if (!title && !overview) return { error: "프로그램 이름이나 활동 개요를 먼저 써 주세요", n: (prev.n ?? 0) + 1 };
  const r = await suggestQuestions({ title, overview, area: isArea(area) ? AREA_LABEL[area] : area });
  await repo.audit(v.accountId, "program.ai.questions", r.ok ? "추천" : "실패");
  return r.ok ? { questions: r.data, n: (prev.n ?? 0) + 1 } : { error: r.error, n: (prev.n ?? 0) + 1 };
}

export type PlanState = { read?: PlanRead; label?: "AI" | "자동"; error?: string; note?: string; files?: string[]; n?: number };

/**
 * 계획서·기안문으로 채우기: 읽은 결과만 돌려준다. 교사가 "확인 후 채우기"를 눌러야 폼에 들어가고, 등록은 교사가 한다.
 * AI 가 꺼져 있으면 파일 이름·PDF 문서 정보·글 파일에서 규칙으로 뽑는다 (label 자동).
 */
export async function readPlanAction(prev: PlanState, form: FormData): Promise<PlanState> {
  const v = await requireCan("program.manage");
  const n = (prev.n ?? 0) + 1;
  const files = form.getAll("plan").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "계획서나 기안문 파일을 골라 주세요", n };
  if (files.length > PLAN_MAX_FILES) return { error: `한 번에 ${PLAN_MAX_FILES}개까지 올릴 수 있어요`, n };
  for (const f of files) {
    const bad = checkPlanFile(f);
    if (bad) return { error: bad, n };
  }
  const year = Number(today().slice(0, 4));
  const classes = [...new Set((await repo.listStudents()).map((s) => `${s.grade}-${s.classNo}`))];
  // HWPX 는 글을 뽑아 글 파일처럼 다룬다 (hwpx 스킬의 text_extract 방식)
  const read = await Promise.all(files.map(readUpload));
  const bad = read.find((r): r is string => typeof r === "string");
  if (bad) return { error: bad, n };
  const loaded = (read as Exclude<(typeof read)[number], string>[]).map((r) =>
    r.mime === "application/hwp+zip" && r.text
      ? { name: r.name.slice(0, 120), mime: "text/plain", bytes: new TextEncoder().encode(r.text) }
      : { name: r.name.slice(0, 120), mime: r.mime, bytes: r.bytes });

  // 규칙 대체: 파일 이름 → PDF 문서 정보 → 글 파일
  const segments: { label: string; text: string }[] = [];
  for (const f of loaded) {
    segments.push({ label: "파일 이름", text: f.name });
    if (f.mime === "application/pdf") {
      const info = await pdfInfo(f.bytes);
      if (info) segments.push({ label: "PDF 정보", text: info });
    } else if (f.mime === "text/plain") {
      segments.push({ label: "본문", text: new TextDecoder().decode(f.bytes).slice(0, 20000) });
    }
  }
  const rule = extractPlanHints(segments, { year, classes });
  const names = loaded.map((f) => f.name);

  if (!aiEnabled()) {
    await repo.audit(v.accountId, "program.ai.autofill", `자동 ${files.length}개`);
    return { read: rule, label: "자동", note: "AI가 꺼져 있어 파일 이름·문서 정보로만 채웠어요. 나머지는 직접 써 주세요", files: names, n };
  }
  const r = await readPlan(loaded, { year, classes });
  await repo.audit(v.accountId, "program.ai.autofill", `${r.ok ? "AI" : "실패"} ${files.length}개`);
  if (!r.ok) return { read: rule, label: "자동", error: r.error, note: "AI가 읽지 못해 파일 이름으로만 채웠어요", files: names, n };
  return { read: mergePlan(r.data, rule), label: "AI", files: names, n };
}
