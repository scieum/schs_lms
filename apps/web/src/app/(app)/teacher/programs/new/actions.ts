"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveLength } from "@/lib/domain/length";
import { AREA_LABEL, buildQuestions, isArea, usesDocs, usesSurvey } from "@/lib/domain/program";
import { suggestQuestions } from "@/lib/server/ai/program-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

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
  intent: z.enum(["draft", "open"]),
});

/** 프로그램 등록 (임시 저장 또는 발행). 발행하면 대상 학생 화면에 설문·서류 제출이 열린다 */
export async function createProgramAction(_: CreateState, form: FormData): Promise<CreateState> {
  const v = await requireCan("program.manage");
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const d = p.data;
  if (d.endDate < d.startDate) return { error: "마감일이 시작일보다 빨라요" };
  if (!isArea(d.area)) return { error: "기록 영역을 골라 주세요" };

  const questions = usesSurvey(d.source) ? buildQuestions(form.getAll("extra").map(String)) : [];
  if (typeof questions === "string") return { error: questions };
  const docKinds = [...new Set(form.getAll("docKind").map((x) => String(x).trim()).filter(Boolean))].slice(0, 8);
  const requestDocs = usesDocs(d.source) && form.get("requestDocs") === "on";

  const students = await repo.listStudents();
  const known = new Set(students.map((s) => s.id));
  const targetIds = [...new Set(form.getAll("target").map(String))].filter((id) => known.has(id));
  if (d.intent === "open" && targetIds.length === 0) return { error: "대상 학생을 골라 주세요" };
  if (d.area === "세특" && !d.subject) return { error: "교과세특은 담당 교과를 써 주세요" };

  const range = resolveLength(d.area, { unit: d.lengthUnit, max: d.lengthMax });
  const program = await repo.createProgram({
    ownerId: v.accountId, title: d.title, subject: d.subject || null, area: d.area, unit: range.unit, max: range.max,
    startDate: d.startDate, endDate: d.endDate, source: d.source, requestDocs, docKinds, questions, targetIds,
    overview: d.overview, status: d.intent,
  });
  await repo.audit(v.accountId, d.intent === "open" ? "program.publish" : "program.save", `${program.id} ${AREA_LABEL[d.area]} ${targetIds.length}명`);
  redirect(`/teacher/programs/${program.id}`);
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
