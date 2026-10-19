"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { parseScope } from "@/lib/domain/common-activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { lessonDate, lessonKindOf, lessonScope, lessonsFromTemplate, normalizeLessons, type LessonDraft } from "@/lib/domain/lesson-plan";
import { PIECE_MAX, PIECE_MIN } from "@/lib/domain/merge";
import { seoulNow } from "@/lib/domain/night";
import type { Viewer } from "@/lib/domain/types";
import { readLessonPlanDoc } from "@/lib/server/ai/lesson-plan";
import { resolveScope } from "@/lib/server/common-activity";
import { readTemplateFile } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import type { LessonMemoRef, NewLessonMemo } from "@/lib/server/repo/modules/lessons";
import { requireCan } from "@/lib/server/viewer";

// 차시별 활동 메뉴 (Figma N43 ②): 수업 계획 올리기(엑셀 양식 · 운영계획서) → 확인 → 저장, 메모 칸 차시 칩 · 여러 학생에게 (AI 없음).
// 범위(과목·분반 / 담임 반 / 동아리)는 공통 활동(N26)과 같은 글이고, 서버에서 이 교사가 쓸 수 있는지 다시 확인한다.

const NO = "내 과목·반·동아리 학생만 쓸 수 있어요";

async function scopeTarget(scope: string) {
  const ref = parseScope(scope);
  const kind = lessonKindOf(scope);
  if (!ref || !kind) return null;
  const v: Viewer = await requireCan(ref.kind === "세특" ? "setuk.write" : "record.write");
  const r = await resolveScope(v, scope);
  if (!r) return null;
  return { v, ref, kind, r };
}

const fileOf = (fd: FormData) => fd.get("file");

/** 엑셀 양식 → 확인 화면 행 (AI 없음 · 양식이 아니면 TEMPLATE_ERROR) */
export async function readLessonExcel(fd: FormData): Promise<{ items: LessonDraft[]; fileName: string; skipped: number } | { error: string }> {
  const t = await scopeTarget(String(fd.get("scope") ?? ""));
  if (!t) return { error: NO };
  const f = fileOf(fd);
  const r = await readTemplateFile(f, "lesson");
  if ("error" in r) return { error: r.error };
  const { items, skipped } = lessonsFromTemplate(r.body, schoolYear());
  if (!items.length) return { error: "양식에 차시가 없어요 · 활동명을 적은 줄만 읽어요" };
  return { items, fileName: (f as File).name, skipped: skipped.length };
}

/** 운영계획서(HWPX · PDF) → 확인 화면 행. 글만 뽑아 학생 이름 · 학번을 가린 뒤 AI가 읽는다. 감사 기록은 수만 */
export async function readLessonDoc(fd: FormData): Promise<{ items: LessonDraft[]; fileName: string; label: "AI" | "자동" } | { error: string }> {
  const t = await scopeTarget(String(fd.get("scope") ?? ""));
  if (!t) return { error: NO };
  const f = fileOf(fd);
  if (!(f instanceof File)) return { error: "파일을 골라 주세요" };
  const all = await repo.listStudents();
  const r = await readLessonPlanDoc(f, { year: schoolYear(), people: all.map((s) => ({ name: s.name, studentNo: s.studentNo })), label: t.r.label });
  if (!r.ok) return { error: r.error };
  await repo.audit(t.v.accountId, "lesson.read_doc", `${t.ref.kind} ${t.r.label} · 차시 ${r.items.length}개 · 가린 말 ${r.removed}개 · ${r.label}`);
  return { items: r.items, fileName: f.name, label: r.label };
}

const ItemSchema = z.object({ id: z.string().max(60).optional(), no: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), title: z.string().max(80), detail: z.string().max(400) });
const SaveSchema = z.object({
  scope: z.string().min(1).max(200),
  source: z.enum(["excel", "doc"]),
  fileName: z.string().max(200).nullable(),
  items: z.array(ItemSchema).min(1, "차시를 하나 이상 남겨 주세요").max(120),
});

export async function saveLessonPlan(input: z.input<typeof SaveSchema>): Promise<{ error?: string; count?: number }> {
  const p = SaveSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const t = await scopeTarget(p.data.scope);
  if (!t) return { error: NO };
  const items = normalizeLessons(p.data.items);
  if (!items.length) return { error: "활동명을 적은 차시가 없어요" };
  try {
    const saved = await repo.saveLessonPlan({ scope: p.data.scope, kind: t.kind, year: schoolYear(), title: t.r.label, source: p.data.source, fileName: p.data.fileName, authorId: t.v.accountId, items });
    await repo.audit(t.v.accountId, "lesson.save", `${t.ref.kind} ${t.r.label} · 차시 ${saved.items.length}개`);
    revalidatePath(t.r.backHref.split("?")[0]);
    return { count: saved.items.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

/** 차시 + 학생들 → 남길 메모 행 (세특 = 메모, 창체 = 누가기록) */
async function memoRows(scope: string, itemId: string, studentIds: string[], activity: string, text: string, date?: string | null) {
  const t = await scopeTarget(scope);
  if (!t) return { error: NO } as const;
  const plan = await repo.getLessonPlan(scope, schoolYear());
  const item = plan?.items.find((i) => i.id === itemId);
  if (!item) return { error: "차시를 찾지 못했어요 · 새로고침해 주세요" } as const;
  const name = cleanActivity(activity) || item.title;
  const content = withActivity(name, text.replace(/\s+/g, " "));
  if (text.trim().length < PIECE_MIN || content.length > PIECE_MAX) return { error: `메모는 ${PIECE_MIN}~${PIECE_MAX.toLocaleString()}자로 써 주세요` } as const;
  const ids = new Set(t.r.students.map((s) => s.id));
  if (!studentIds.length || studentIds.some((id) => !ids.has(id))) return { error: NO } as const;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : lessonDate(item, seoulNow().date);
  const rows: NewLessonMemo[] = studentIds.map((studentId) =>
    t.ref.kind === "세특"
      ? { kind: "memo", scope: lessonScope(`세특:${t.ref.courseId}`), studentId, authorId: t.v.accountId, content, date: day, itemId }
      : { kind: "log", area: t.ref.kind as "동아리" | "자율·자치" | "진로", clubId: t.ref.kind === "동아리" ? t.ref.clubId : null, studentId, authorId: t.v.accountId, content, date: day, itemId });
  return { t, rows } as const;
}

const OneSchema = z.object({ scope: z.string().min(1).max(200), itemId: z.string().min(1).max(60), studentId: z.string().min(1).max(60), activity: z.string().max(80), text: z.string().max(PIECE_MAX) });

/** 메모 칸에서 차시를 고르고 남기기 (한 학생) */
export async function addLessonMemo(input: z.input<typeof OneSchema>): Promise<{ error?: string }> {
  const p = OneSchema.safeParse(input);
  if (!p.success) return { error: "입력을 확인해 주세요" };
  const m = await memoRows(p.data.scope, p.data.itemId, [p.data.studentId], p.data.activity, p.data.text);
  if ("error" in m) return { error: m.error };
  try {
    await repo.addLessonMemos(m.rows);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "남기지 못했어요" };
  }
  await repo.audit(m.t.v.accountId, "lesson.memo", `${m.t.ref.kind} ${m.t.r.label} · 1명`);
  revalidatePath("/teacher/pieces");
  if (m.t.ref.kind !== "세특") revalidatePath("/teacher/logs");
  return {};
}

const BulkSchema = z.object({
  scope: z.string().min(1).max(200), itemId: z.string().min(1).max(60), studentIds: z.array(z.string().max(60)).min(1, "학생을 골라 주세요").max(60),
  activity: z.string().max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), text: z.string().max(PIECE_MAX),
});

/** 같은 메모를 여러 학생에게 (Figma N43 (g)) — 만든 메모 id 를 돌려줘 되돌리기에 쓴다. AI 없음 */
export async function addLessonMemosBulk(input: z.input<typeof BulkSchema>): Promise<{ error?: string; refs?: LessonMemoRef[] }> {
  const p = BulkSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const m = await memoRows(p.data.scope, p.data.itemId, [...new Set(p.data.studentIds)], p.data.activity, p.data.text, p.data.date);
  if ("error" in m) return { error: m.error };
  let refs: LessonMemoRef[];
  try {
    refs = await repo.addLessonMemos(m.rows);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "남기지 못했어요" };
  }
  await repo.audit(m.t.v.accountId, "lesson.bulk", `${m.t.ref.kind} ${m.t.r.label} · ${refs.length}명`);
  revalidatePath(m.t.r.backHref.split("?")[0]);
  revalidatePath("/teacher/pieces");
  return { refs };
}

const UndoSchema = z.object({ scope: z.string().min(1).max(200), refs: z.array(z.object({ kind: z.enum(["memo", "log"]), id: z.string().max(60) })).min(1).max(60) });

/** 되돌리기: 방금 만든 차시 메모만 지운다 (이 교사 · 10분 안 · 차시 메모) */
export async function undoLessonMemos(input: z.input<typeof UndoSchema>): Promise<{ error?: string; count?: number }> {
  const p = UndoSchema.safeParse(input);
  if (!p.success) return { error: "입력을 확인해 주세요" };
  const t = await scopeTarget(p.data.scope);
  if (!t) return { error: NO };
  const count = await repo.deleteLessonMemos(p.data.refs, t.v.accountId);
  await repo.audit(t.v.accountId, "lesson.undo", `${t.ref.kind} ${t.r.label} · ${count}개`);
  revalidatePath(t.r.backHref.split("?")[0]);
  revalidatePath("/teacher/pieces");
  return { count };
}

/** 차시 칩 ⋯ "공통 활동으로 만들기" (N26 연결): 활동명 · 날짜 · 설명(=활동 내용)이 채워진 공통 활동 */
export async function commonFromLesson(input: { scope: string; itemId: string }): Promise<{ error?: string; id?: string }> {
  const t = await scopeTarget(String(input.scope ?? ""));
  if (!t) return { error: NO };
  const plan = await repo.getLessonPlan(input.scope, schoolYear());
  const item = plan?.items.find((i) => i.id === input.itemId);
  if (!item) return { error: "차시를 찾지 못했어요" };
  try {
    const a = await repo.addCommonActivity({ scope: input.scope, name: item.title, date: item.date, description: item.detail.slice(0, 300), authorId: t.v.accountId, lessonItemId: item.id });
    await repo.audit(t.v.accountId, "common.create", `${t.ref.kind} ${t.r.label} · ${item.title} (차시 ${item.no})`);
    revalidatePath(t.r.backHref.split("?")[0]);
    return { id: a.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "만들지 못했어요" };
  }
}
