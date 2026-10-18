"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkLength, resolveLength, UNIT_LABEL } from "@/lib/domain/length";
import { studentsInCourse } from "@/lib/domain/setuk";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { writeRecord } from "@/lib/server/ai/write-record";
import { findIdentity, latestMemoByStudent, type AiDraftResult } from "@/lib/domain/writing";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { readEvidence, type EvidenceResult } from "@/lib/server/ai/read-evidence";
import { fitRecord, mergeRecord, tagCompetency } from "@/lib/server/ai/merge-record";
import { listMemosWithPieces, memoPieces } from "@/lib/server/merge-pieces";
import { fitRange, PIECE_MAX, PIECE_MIN, pieceScope, type MergePiece } from "@/lib/domain/merge";
import type { TaggedSentence } from "@/lib/domain/competency";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";

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
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
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
  const r = await writeRecord({ kind: "세특", student, context: course.subject, memo, logs: notes, range });
  await repo.audit(v.accountId, "setuk.ai_draft", `${course.subject} ${student.pseudonymId}`);
  if (!r.text) return { ok: false, error: r.notice ?? "초안을 만들지 못했어요. 직접 써 주세요" };
  return { ok: true, text: r.text, sample: r.sample, notice: r.notice };
}

/**
 * 자료로 쓰기 (Figma N10): 학생 자료 파일 하나 → (주제)(활동)(키워드) 근거. 저장하지 않고 돌려주기만 한다.
 * 패널이 이 근거를 메모와 함께 AI 초안에 넣는다.
 */
export async function readSetukFile(form: FormData): Promise<EvidenceResult> {
  const v = await requireCan("setuk.write");
  const courseId = String(form.get("courseId") ?? "");
  const studentId = String(form.get("studentId") ?? "");
  const [course, mine, student, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId), repo.getCourseRosters(v.accountId, courseId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment, roster).length) {
    return { ok: false, error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  }
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, { mode: "record", kind: "교과 세특", context: course.subject, people: peopleAround(student, await repo.listStudents()) });
  await repo.audit(v.accountId, "setuk.ai_read_file", `${course.subject} ${student.pseudonymId}`);
  return r;
}

// ---------- 합치기 · 맞추기 · 역량 보기 (Figma N11) ----------

const MergeSchema = z.object({
  pieces: z.array(z.object({ id: z.string(), source: z.enum(["누가기록", "메모", "본문", "특색 활동"]), date: z.string().nullable(), text: z.string().max(6000) })).min(1, "합칠 조각을 골라 주세요").max(80),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
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

/** 조각 칸 (Figma N19): 수업 중 본 것을 바로 한 조각으로 남긴다 (추가만, C4) */
export async function addSetukPiece(input: { courseId: string; studentId: string; text: string }): Promise<{ error?: string }> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { error: "내 담당 과목·반 학생만 쓸 수 있어요" };
  const text = String(input.text ?? "").trim();
  if (text.length < PIECE_MIN || text.length > PIECE_MAX) return { error: `조각은 ${PIECE_MIN}~${PIECE_MAX.toLocaleString()}자로 써 주세요` };
  await repo.addRecordMemo({ scope: pieceScope(`세특:${input.courseId}`), studentId: t.student.id, authorId: t.v.accountId, content: text });
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
  const r = await mergeRecord({ kind: "세특", context: t.course.subject, student: t.student, pieces: p.data.pieces, range });
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

export async function tagSetuk(input: { courseId: string; studentId: string; text: string }): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동" } | { error: string }> {
  const t = await setukTarget(input.courseId, input.studentId);
  if (!t) return { error: "내 담당 과목·반 학생만 볼 수 있어요" };
  return tagCompetency(String(input.text ?? "").slice(0, 6000), t.student);
}
