"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { classScope } from "@/components/scores/scope";
import { AREAS, judgeMinimum, parseMinRuleText, ruleProblems, shortRule, SUBJECT_LABEL, SUBJECTS, type Area, type InquiryMode } from "@/lib/domain/scores";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
import { extractMinRule, type ExtractedRule } from "@/lib/server/ai/homeroom-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type RuleState = { error?: string; ok?: boolean };

const areaList = (form: FormData, name: string) => form.getAll(name).map(String).filter((a): a is Area => (AREAS as string[]).includes(a));

/** 대학별 기준 추가 */
export async function addRule(_: RuleState, form: FormData): Promise<RuleState> {
  const v = await requireCan("minimum.view");
  const p = z
    .object({
      university: z.string().trim().min(1, "대학을 써 주세요").max(40),
      major: z.string().trim().min(1, "학과를 써 주세요").max(40),
      pick: z.coerce.number().int(),
      maxSum: z.coerce.number(),
      historyMax: z.string().optional(),
      inquiry: z.enum(["best", "avg", "avgFloor"]),
      note: z.string().trim().max(100).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const rule = {
    university: p.data.university,
    major: p.data.major,
    pool: areaList(form, "pool"),
    pick: p.data.pick,
    maxSum: p.data.maxSum,
    required: areaList(form, "required"),
    historyMax: p.data.historyMax ? Number(p.data.historyMax) : null,
    inquiry: p.data.inquiry as InquiryMode,
    note: p.data.note || null,
  };
  const problems = ruleProblems(rule);
  if (problems.length) return { error: problems[0] };
  await repo.addMinRule(rule, v.accountId);
  await repo.audit(v.accountId, "minimum.rule.add", `${rule.university} ${rule.major}`);
  revalidatePath("/homeroom/minimum");
  revalidatePath("/student/scores");
  return { ok: true };
}

export async function archiveRule(form: FormData): Promise<void> {
  const v = await requireCan("minimum.view");
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await repo.archiveMinRule(id);
  await repo.audit(v.accountId, "minimum.rule.archive", id);
  revalidatePath("/homeroom/minimum");
}

// ---------------------------------------------------------------- AI 최저 분석

export type CounselItem = { studentId: string; reason: string; priority: number };
export type AnalyzeResult = { ok: true; summary: string; items: CounselItem[]; source: "AI" | "자동" } | { ok: false; error: string };

const AiOut = z.object({
  summary: z.string(),
  students: z.array(z.object({ id: z.string(), priority: z.number().int().min(1).max(3), reason: z.string() })),
});

async function analysisInput(classKey: string, examId: string) {
  const v = await requireCan("minimum.view");
  const scope = await classScope(v, classKey);
  if (!scope) return null;
  const ids = scope.students.map((s) => s.id);
  const [scores, rules, targets] = await Promise.all([repo.listMockScores(ids), repo.listMinRules(), repo.listStudentTargets(ids)]);
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const rows = scope.students.flatMap((s) => {
    const t = targets.filter((x) => x.studentId === s.id).sort((a, b) => a.rank - b.rank)[0];
    if (!t) return [];
    const rule = t.ruleId ? ruleMap.get(t.ruleId) : null;
    const grades = scores.find((x) => x.studentId === s.id && x.examId === examId)?.grades ?? null;
    const j = judgeMinimum(rule, grades);
    return [{ student: s, rule, grades, j }];
  });
  return { v, scope, rows };
}

/** 상담 우선 대상 고르기. AI 가 켜져 있으면 가명ID·등급·기준만 보내고, 꺼져 있으면 규칙(한 과목만 올리면 충족)으로 고른다 */
export async function analyzeMinimum(classKey: string, examId: string): Promise<AnalyzeResult> {
  const input = await analysisInput(classKey, examId);
  if (!input) return { ok: false, error: "담임 반이 없어요" };
  const focus = input.rows.filter((r) => r.j.status === "근접" || r.j.status === "미충족" || r.j.status === "자료 부족");
  const fallback: CounselItem[] = focus
    .filter((r) => r.j.status === "근접")
    .map((r) => ({ studentId: r.student.id, reason: r.j.reason, priority: 1 }));
  if (!focus.length) return { ok: true, summary: "상담이 급한 학생이 없어요", items: [], source: "자동" };

  const ruleSummary = `한 과목만 1등급 올리면 충족되는 학생 ${fallback.length}명 — 우선 상담 대상`;
  if (!aiEnabled()) return { ok: true, summary: ruleSummary, items: fallback, source: "자동" };
  const byPid = new Map(focus.map((r) => [r.student.pseudonymId, r.student.id]));
  const lines = focus.map((r) => {
    const g = r.grades ? SUBJECTS.map((k) => `${SUBJECT_LABEL[k]} ${r.grades![k] ?? "빈칸"}`).join(", ") : "성적 없음";
    return `${r.student.pseudonymId} | 기준: ${r.rule ? shortRule(r.rule) + (r.rule.historyMax ? `, 한국사 ${r.rule.historyMax} 이내` : "") : "없음"} | ${g} | 판정: ${r.j.status} (${r.j.reason})`;
  });
  const res = await aiJson(AiOut, {
    model: "fast",
    system:
      "고등학교 담임교사를 돕는다. 모의고사 등급과 수능 최저 기준 판정 목록을 보고 상담 우선순위를 정한다. priority 1 = 한 과목만 조금 올리면 충족되는 학생(가장 먼저), 2 = 자료가 부족해 확인이 필요한 학생, 3 = 여러 과목을 올려야 하는 학생. reason 은 40자 이내 한 문장으로, 어떤 과목을 몇 등급 올리면 되는지처럼 구체적으로 쓴다. summary 는 50자 이내 한 줄. 목록에 없는 학생은 만들지 않는다.",
    content: `학생 목록 (가명ID | 기준 | 등급 | 판정):\n${lines.join("\n")}`,
  });
  await repo.audit(input.v.accountId, "minimum.ai.analyze", `${input.scope.key} ${focus.length}명`);
  if (!res.ok) {
    return { ok: true, summary: `${ruleSummary} (${res.error})`, items: fallback, source: "자동" };
  }
  const items = res.data.students
    .filter((x) => byPid.has(x.id))
    .map((x) => ({ studentId: byPid.get(x.id)!, priority: x.priority, reason: x.reason.slice(0, 80) }))
    .sort((a, b) => a.priority - b.priority);
  return { ok: true, summary: res.data.summary.slice(0, 80), items, source: "AI" };
}

export type SaveState = { error?: string; saved?: number };

/** 확인 후 상담 명단으로 저장 (추가만) */
export async function saveCounselList(_: SaveState, form: FormData): Promise<SaveState> {
  const v = await requireCan("minimum.view");
  const scope = await classScope(v, String(form.get("class") ?? ""));
  if (!scope) return { error: "담임 반이 없어요" };
  let items: { studentId: string; reason: string }[];
  try {
    const raw = JSON.parse(String(form.get("items") ?? "[]"));
    items = z.array(z.object({ studentId: z.string(), reason: z.string().trim().max(100) })).max(60).parse(raw);
  } catch {
    return { error: "명단을 읽지 못했어요" };
  }
  const mine = new Set(scope.students.map((s) => s.id));
  if (!items.length) return { error: "학생을 한 명 이상 골라 주세요" };
  if (items.some((i) => !mine.has(i.studentId))) return { error: "우리 반 학생만 넣을 수 있어요" };
  const examId = String(form.get("examId") ?? "") || null;
  await repo.addMinCounselList({ grade: scope.grade, classNo: scope.classNo, examId, items, createdBy: v.accountId });
  const pids = scope.students.filter((s) => items.some((i) => i.studentId === s.id)).map((s) => s.pseudonymId);
  await repo.audit(v.accountId, "minimum.counsel.save", `${scope.key} ${pids.join(",")}`);
  revalidatePath("/homeroom/minimum");
  return { saved: items.length };
}

// ---------------------------------------------------------------- 모집요강 → 기준 채우기

export type ExtractState = { ok: true; rule: ExtractedRule; source: "AI" | "자동"; note?: string } | { ok: false; error: string };
const RULE_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

/** 모집요강 문구·캡처 → "기준 추가" 폼 채우기. 저장하지 않는다 (교사가 확인 후 "기준 저장"). 공개 문서라 그대로 보낸다 */
export async function extractRule(form: FormData): Promise<ExtractState> {
  const v = await requireCan("minimum.view");
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!text && !hasFile) return { ok: false, error: "모집요강 문구를 붙여 넣거나 캡처를 올려 주세요" };
  if (hasFile && !RULE_FILE_TYPES.includes(file.type)) return { ok: false, error: "캡처는 png·jpg·PDF만 올릴 수 있어요" };
  if (hasFile && file.size > 8 * 1024 * 1024) return { ok: false, error: "캡처는 8MB까지 올릴 수 있어요" };

  const byRule = (): ExtractState => {
    const p = parseMinRuleText(text);
    if (!p.found) return { ok: false, error: hasFile && !text ? "AI가 꺼져 있어 캡처는 읽을 수 없어요. 문구를 붙여 넣어 주세요" : "문구에서 '2개 합 5' 같은 기준을 찾지 못했어요. 직접 입력해 주세요" };
    const rule = { pool: p.pool, pick: p.pick, maxSum: p.maxSum, required: p.required, historyMax: p.historyMax, inquiry: p.inquiry, university: "", major: "", note: "" };
    return { ok: true, rule, source: "자동", note: "대학·학과는 직접 써 주세요" };
  };
  if (!aiEnabled()) return byRule();
  const r = await extractMinRule({ text: text || undefined, file: hasFile ? { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type } : undefined });
  await repo.audit(v.accountId, "minimum.ai.rule", hasFile ? "캡처" : "문구");
  if (!r.ok) {
    const fb = text ? byRule() : null;
    return fb?.ok ? { ...fb, note: `AI 대신 규칙으로 채웠어요 (${r.error})` } : { ok: false, error: r.error };
  }
  return { ok: true, rule: r.data, source: "AI" };
}
