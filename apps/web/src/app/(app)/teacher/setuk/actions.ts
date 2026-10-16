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
  const [course, mine, student] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment).length) {
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
  memo: z.string().max(2000, "메모는 2000자까지예요"),
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
  const [course, mine, student] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getStudent(studentId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment || !student || !studentsInCourse([student], course, assignment).length) {
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
