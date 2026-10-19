"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkLength, resolveLength, UNIT_LABEL } from "@/lib/domain/length";
import { studentsInCourse } from "@/lib/domain/setuk";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { writeRecord } from "@/lib/server/ai/write-record";
import { findIdentity, latestMemoByStudent, scrubIdentity, type AiDraftResult } from "@/lib/domain/writing";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { readEvidence, type EvidenceResult } from "@/lib/server/ai/read-evidence";
import { fitRecord, fixRecord, mergeRecord, tagCompetency, variantsRecord } from "@/lib/server/ai/merge-record";
import { measure } from "@/lib/domain/length";
import type { AiFixResult, VariantsActionResult } from "@/lib/domain/variants";
import { listMemosWithPieces, memoPieces } from "@/lib/server/merge-pieces";
import { cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { fitRange, PIECE_MAX, PIECE_MIN, PIECE_SOURCES, pieceScopeOf, type MergePiece, type PieceKind } from "@/lib/domain/merge";
import type { TaggedSentence } from "@/lib/domain/competency";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";
import { latestByStudent } from "@/lib/domain/setuk";
import { setukScope } from "@/lib/domain/common-activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { levelIn, levelPrompt, type Level } from "@/lib/domain/achievement";
import type { ClassCheckView } from "@/lib/domain/class-check";
import { buildClassView, classAudit } from "@/lib/server/class-check";

export type SetukState = { error?: string; saved?: "draft" | "confirmed"; at?: string };

const Schema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  content: z.string().max(5000, "너무 길어요"),
  lengthUnit: z.enum(["bytes", "chars"]),
  lengthMax: z.coerce.number().int().min(1, "최대 분량을 넣어 주세요"),
  intent: z.enum(["draft", "confirmed"]),
});

/** 세특 저장: 임시 저장(draft) 또는 확정. 언제나 새 버전으로 추가한다 (C4) */
export async function saveSetuk(_: SetukState, form: FormData): Promise<SetukState> {
  const v = await requireCan("setuk.write");
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { courseId, studentId, intent } = p.data;
  const content = p.data.content.replace(/\r\n/g, "\n").trim();

  // 내게 배정된 과목이고, 내가 맡은 반 학생인지 서버에서 다시 확인한다
  const [course, mine, student, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId), repo.getCourseRosters(v.accountId, courseId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment, roster).length) {
    return { error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  }

  const range = resolveLength("세특", { unit: p.data.lengthUnit, max: p.data.lengthMax });
  if (intent === "confirmed") {
    if (!content) return { error: "빈 내용은 확정할 수 없어요" };
    const c = checkLength(content, range);
    // 분량 초과는 교사가 확인(allowOver)하면 확정한다
    if (c.reason === "too_long" && form.get("allowOver") !== "on") return { error: `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}를 넘었어요 (지금 ${c.value.toLocaleString()}). 이대로 확정하려면 분량 초과 확인에 체크해 주세요` };
    if (c.reason === "too_long") await repo.audit(v.accountId, "setuk.over_length", `${c.value}/${range.max}`);
    if (findIdentity(content, student).length) return { error: "이름·학번이 들어 있어 확정할 수 없어요" };
    const banned = forbiddenBlock(content);
    if (banned) return { error: banned };
  }

  const r = await repo.addSetuk({ courseId, studentId, authorId: v.accountId, content, unit: range.unit, max: range.max, status: intent });
  // 감사 로그에는 이름 대신 가명ID
  await repo.audit(v.accountId, intent === "confirmed" ? "setuk.confirm" : "setuk.save", `${course.subject} ${student.pseudonymId}`);
  revalidatePath("/teacher/setuk");
  return { saved: intent, at: r.createdAt };
}

const AiSchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  memo: z.string().max(6000, "메모·자료는 6000자까지예요"),
  /** 활동명 (N27): 초안을 "활동명에서 …"로 */
  activity: z.string().max(60).optional().default(""),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
  /** 성취수준 (N35 ③): 말투만 바꾼다 */
  level: z.string().nullish(),
});

/**
 * "AI 초안": 관찰 메모(+ 이 과목에서 전에 남긴 메모) + 희망 진로 → NEIS 어미 세특 초안.
 * 결과는 편집기에 채우기만 한다. 저장·확정은 교사가 기존 버튼으로 한다.
 */
export async function aiSetukDraft(input: z.input<typeof AiSchema>): Promise<AiDraftResult> {
  const v = await requireCan("setuk.write");
  const p = AiSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { courseId, studentId, unit, max } = p.data;
  const [course, mine, student, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId), repo.getCourseRosters(v.accountId, courseId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment, roster).length) {
    return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  }

  // 이 과목 관찰 메모는 추가만 한다. 전에 남긴 메모는 누가기록처럼 근거로 같이 보낸다
  const scope = `세특:${courseId}`;
  const memos = await repo.listRecordMemos(scope, [studentId]);
  const memo = p.data.memo.trim();
  const prev = latestMemoByStudent(memos).get(studentId);
  if (memo && memo !== prev?.content) await repo.addRecordMemo({ scope, studentId, authorId: v.accountId, content: memo });
  const notes = memos.filter((m) => m.content !== memo).map((m) => ({ date: m.createdAt.slice(0, 10), content: m.content }));

  const range = resolveLength("세특", { unit, max });
  const r = await writeRecord({ kind: "세특", student, context: course.subject, memo, logs: notes, range, activity: p.data.activity, tone: await toneFor(p.data.level) });
  await repo.audit(v.accountId, "setuk.ai_draft", `${course.subject} ${student.pseudonymId}`);
  if (!r.text) return { ok: false, error: r.notice ?? "초안을 만들지 못했어요. 직접 써 주세요" };
  return { ok: true, text: r.text, sample: r.sample, notice: r.notice };
}

// ---------- 조각 모으기 · 자료 (Figma N22 → N32) ----------

/** ① 활동 자료 → 활동 요약 1~2문장 (조각 후보, 저장하지 않음). 큰 PDF는 화면이 쪽을 나눠 여러 번 부른다 */
export async function summarizeSetukFile(form: FormData): Promise<EvidenceResult> {
  const t = await setukTarget(String(form.get("courseId") ?? ""), String(form.get("studentId") ?? ""));
  if (!t) return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, { mode: "log", kind: `${t.course.subject} 교과 세특`, people: peopleAround(t.student, await repo.listStudents()) });
  await repo.audit(t.v.accountId, "setuk.ai_piece_file", `${t.course.subject} ${t.student.pseudonymId}`);
  return r;
}

// ---------- 합치기 · 맞추기 · 역량 보기 (Figma N11) ----------

const MergeSchema = z.object({
  pieces: z.array(z.object({ id: z.string(), source: z.enum(PIECE_SOURCES), date: z.string().nullable(), text: z.string().max(6000), weight: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() })).min(1, "합칠 조각을 골라 주세요").max(80),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
  level: z.string().nullish(),
});
const FitSchema = z.object({ text: z.string().min(1, "본문이 비어 있어요").max(6000), unit: z.enum(["bytes", "chars"]), max: z.number().int().min(1) });
const toDraft = (r: { text: string; sample: boolean; notice?: string }): AiDraftResult =>
  r.text ? { ok: true, text: r.text, sample: r.sample, notice: r.notice } : { ok: false, error: r.notice ?? "만들지 못했어요. 직접 고쳐 주세요" };

/** 내 담당 과목·반 학생인지 서버에서 다시 확인 */
async function setukTarget(courseId: string, studentId: string) {
  const v = await requireCan("setuk.write");
  const [course, mine, student, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId), repo.getCourseRosters(v.accountId, courseId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment, roster).length) return null;
  return { v, course, student };
}

/** 합칠 조각: 이 과목에 남긴 관찰 메모 + 조각 칸 메모 (새 것부터) */
export async function listSetukPieces(input: { courseId: string; studentId: string }): Promise<MergePiece[]> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return [];
  return memoPieces(await listMemosWithPieces(`세특:${input.courseId}`, [input.studentId]));
}

/** 조각 칸 (Figma N19 · N32): 수업 중 본 것(메모) 또는 자료 요약을 한 조각으로 남긴다 (추가만, C4) */
export async function addSetukPiece(input: { courseId: string; studentId: string; text: string; activity: string; kind?: PieceKind }): Promise<{ error?: string }> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  // 보관함에서 넣은 조각(N35)은 활동명 없이 문장 그대로
  const lib = input.kind === "library";
  if (!lib && !cleanActivity(input.activity)) return { error: "활동명을 적어 주세요" };
  const text = lib ? scrubIdentity(String(input.text ?? ""), t.student).text : withActivity(input.activity, String(input.text ?? ""));
  if (text.length < PIECE_MIN || text.length > PIECE_MAX) return { error: `조각은 ${PIECE_MIN}~${PIECE_MAX.toLocaleString()}자로 써 주세요` };
  await repo.addRecordMemo({ scope: pieceScopeOf(`세특:${input.courseId}`, input.kind === "file" ? "file" : lib ? "library" : "memo"), studentId: t.student.id, authorId: t.v.accountId, content: text });
  await repo.audit(t.v.accountId, "record.piece", `세특 ${t.course.subject} ${t.student.pseudonymId}`);
  revalidatePath("/teacher/pieces");
  return {};
}

export async function mergeSetuk(input: { courseId: string; studentId: string } & z.input<typeof MergeSchema>): Promise<AiDraftResult> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const p = MergeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveLength("세특", { unit: p.data.unit, max: p.data.max }));
  const r = await mergeRecord({ kind: "세특", context: t.course.subject, student: t.student, pieces: p.data.pieces, range, tone: await toneFor(p.data.level) });
  await repo.audit(t.v.accountId, "setuk.ai_merge", `${t.course.subject} ${t.student.pseudonymId} ${p.data.pieces.length}조각`);
  return toDraft(r);
}

export async function fitSetuk(input: { courseId: string; studentId: string } & z.input<typeof FitSchema>): Promise<AiDraftResult> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const p = FitSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveLength("세특", { unit: p.data.unit, max: p.data.max }));
  const r = await fitRecord({ kind: "세특", context: t.course.subject, student: t.student, text: p.data.text, range });
  await repo.audit(t.v.accountId, "setuk.ai_fit", `${t.course.subject} ${t.student.pseudonymId}`);
  return toDraft(r);
}

// ---------- AI로 고치기 · 다른 버전 (Figma N34) ----------

const LenSchema = z.object({ text: z.string().min(1, "본문이 비어 있어요").max(6000), unit: z.enum(["bytes", "chars"]), max: z.number().int().min(1) });
const VarSchema = LenSchema.extend({ mode: z.enum(["keep", "fresh"]) });

/** AI로 고치기: 자동 검사에 걸린 곳만 고친 글 (저장하지 않음 — 교사가 "본문에 넣기") */
export async function aiFixSetuk(input: { courseId: string; studentId: string; batch?: boolean } & z.input<typeof LenSchema>): Promise<AiFixResult> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const p = LenSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = resolveLength("세특", { unit: p.data.unit, max: p.data.max });
  const r = await fixRecord({ kind: "세특", context: t.course.subject, student: t.student, text: p.data.text, range });
  await repo.audit(t.v.accountId, "setuk.ai_fix", `${t.course.subject} ${t.student.pseudonymId}${input.batch ? " class" : ""}`);
  return { ok: true, text: r.text, changes: r.changes, label: r.label, bytes: measure(r.text, range.unit), notice: r.notice };
}

/** 다른 버전 3개 (저장하지 않음 — 교사가 "이걸로 바꾸기") */
export async function variantsSetuk(input: { courseId: string; studentId: string } & z.input<typeof VarSchema>): Promise<VariantsActionResult> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const p = VarSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveLength("세특", { unit: p.data.unit, max: p.data.max }));
  const r = await variantsRecord({ kind: "세특", context: t.course.subject, student: t.student, text: p.data.text, mode: p.data.mode, range });
  await repo.audit(t.v.accountId, "setuk.ai_variants", `${t.course.subject} ${t.student.pseudonymId} ${p.data.mode}`);
  if (!r.versions.length) return { ok: false, error: r.notice ?? "버전을 만들지 못했어요. 다시 만들어 주세요" };
  return { ok: true, ...r };
}

export async function tagSetuk(input: { courseId: string; studentId: string; text: string }): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동" } | { error: string }> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { error: "내 담당 과목·반 학생만 볼 수 있어요" };
  return tagCompetency(String(input.text ?? "").slice(0, 6000), t.student);
}

// ---------- 반 전체 검사 · 성취수준 (Figma N35 ①·③) ----------

/** 반 전체 검사: 이 분반 학생들의 최신 세특을 규칙으로만 (AI 없음). 확정 학생은 locked — AI 고치기에서 뺀다 */
export async function classCheckSetuk(input: { courseId: string; section?: string | null }): Promise<ClassCheckView> {
  const v = await requireCan("setuk.write");
  const courseId = String(input?.courseId ?? "");
  const section = input?.section ? String(input.section) : null;
  const [course, mine, roster, all] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, courseId), repo.listStudents()]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment) return { ok: false, error: "내 담당 과목만 검사할 수 있어요" };
  const students = studentsInCourse(all, course, assignment, roster, section);
  const latest = latestByStudent(await repo.listSetuk(courseId));
  // 공통 활동(N26) 글은 모두에게 같은 문장이 들어가는 게 정상 — 비슷한 문장에서 뺀다
  const scope = setukScope(courseId, section);
  const common = await repo.listCommonActivities(scope);
  const commonPieces = common.length ? await repo.listCommonActivityPieces(common.map((a) => a.id)) : [];
  const ignore = [...common.map((a) => a.description), ...commonPieces.map((p) => p.content)].filter((t) => t.trim());
  const sec = section ? `&section=${encodeURIComponent(section)}` : "";
  const view = buildClassView(students.map((s) => {
    const r = latest.get(s.id);
    return {
      id: s.id, student: s, text: r?.content ?? "", context: course.subject, locked: r?.status === "confirmed",
      range: resolveLength("세특", { unit: r?.unit ?? "bytes", max: r?.max }),
      href: `/teacher/setuk?course=${course.id}${sec}&student=${s.id}&check=1`,
    };
  }), ignore);
  await repo.audit(v.accountId, "setuk.class_check", classAudit(`${course.subject}${section ? ` ${section}` : ""}`, view));
  return view;
}

const LevelSchema = z.object({
  courseId: z.string().min(1),
  items: z.array(z.object({ studentId: z.string().min(1), level: z.string().nullable() })).min(1).max(200),
});

/** 성취수준 정하기 (한 명 · 여러 명 · 되돌리기). 내 담당 과목·반 학생만. 감사 로그에는 학생 식별자 없이 명수·수준만 */
export async function setLevels(input: z.input<typeof LevelSchema>): Promise<{ ok: true; levels: Record<string, Level | null> } | { ok: false; error: string }> {
  const v = await requireCan("setuk.write");
  const p = LevelSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "학생과 수준을 골라 주세요" };
  const [course, mine, roster, all, scale] = await Promise.all([repo.getCourse(p.data.courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, p.data.courseId), repo.listStudents(), repo.getAchievementScale()]);
  const assignment = mine.find((a) => a.courseId === p.data.courseId);
  if (!course || !assignment) return { ok: false, error: "내 담당 과목만 정할 수 있어요" };
  const allowed = new Set(studentsInCourse(all, course, assignment, roster).map((s) => s.id));
  if (p.data.items.some((x) => !allowed.has(x.studentId))) return { ok: false, error: "내 담당 과목·반 학생만 정할 수 있어요" };
  if (p.data.items.some((x) => x.level !== null && !levelIn(scale, x.level))) return { ok: false, error: "학교 설정에 없는 수준이에요" };
  const items = p.data.items.map((x) => ({ studentId: x.studentId, level: x.level as Level | null }));
  try {
    await repo.setLevels({ courseId: course.id, year: schoolYear(), semester: course.semester }, items, v.accountId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  const lv = [...new Set(items.map((x) => x.level ?? "—"))].join("·");
  await repo.audit(v.accountId, "setuk.level", `${course.subject} ${items.length}명 ${lv}`);
  revalidatePath("/teacher/setuk");
  return { ok: true, levels: Object.fromEntries(items.map((x) => [x.studentId, x.level])) };
}

/** 성취수준 말투 한 줄 (학교 설정 단계에 있는 수준만) */
async function toneFor(level: unknown): Promise<string> {
  if (!level) return "";
  const scale = await repo.getAchievementScale();
  return levelIn(scale, level) ? levelPrompt(level) : "";
}
