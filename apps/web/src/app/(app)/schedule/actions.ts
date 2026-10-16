"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin } from "@/lib/domain/policy";
import { getMealDay } from "@/lib/server/school-info";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 학사일정 직접 추가·수정·삭제 (교사·학생 누구나 추가, 올린 사람·관리자만 수정·삭제) + 급식 날짜 옮기기

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요");
const EventSchema = z.object({
  title: z.string().trim().min(1, "일정 이름을 써 주세요").max(60, "이름은 60자까지예요"),
  startDate: date,
  endDate: date,
  memo: z.string().trim().max(200, "메모는 200자까지예요").optional().default(""),
});

export type EventState = { error?: string; done?: string; n?: number };

function parse(form: FormData) {
  const p = EventSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" } as const;
  if (p.data.endDate < p.data.startDate) return { error: "마감일이 시작일보다 빨라요" } as const;
  const grades = [...new Set(form.getAll("grade").map(Number))].filter((g) => g >= 1 && g <= 3).sort();
  return { data: { title: p.data.title, startDate: p.data.startDate, endDate: p.data.endDate, memo: p.data.memo || null, grades: grades.length === 3 ? [] : grades } } as const;
}

export async function addEvent(prev: EventState, form: FormData): Promise<EventState> {
  const v = await requireViewer();
  const n = (prev.n ?? 0) + 1;
  const r = parse(form);
  if ("error" in r) return { error: r.error, n };
  try {
    await repo.addCustomEvent({ ...r.data, authorId: v.accountId });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요", n };
  }
  await repo.audit(v.accountId, "event.add", `${r.data.startDate}~${r.data.endDate}`);
  revalidatePath("/schedule");
  return { done: "일정을 추가했어요", n };
}

async function mine(id: string) {
  const v = await requireViewer();
  const e = await repo.getCustomEvent(id);
  if (!e || (e.authorId !== v.accountId && !isAdmin(v))) return null;
  return { v, e };
}

export async function updateEvent(prev: EventState, form: FormData): Promise<EventState> {
  const n = (prev.n ?? 0) + 1;
  const ctx = await mine(String(form.get("id") ?? ""));
  if (!ctx) return { error: "올린 사람만 고칠 수 있어요", n };
  const r = parse(form);
  if ("error" in r) return { error: r.error, n };
  try {
    await repo.updateCustomEvent(ctx.e.id, r.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요", n };
  }
  await repo.audit(ctx.v.accountId, "event.edit", ctx.e.id);
  revalidatePath("/schedule");
  return { done: "일정을 고쳤어요", n };
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const ctx = await mine(id);
  if (!ctx) return { error: "올린 사람만 지울 수 있어요" };
  try {
    await repo.deleteCustomEvent(id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "지우지 못했어요" };
  }
  await repo.audit(ctx.v.accountId, "event.delete", id);
  revalidatePath("/schedule");
  return {};
}

/** 급식 날짜 옮기기 (앞·뒤 급식일) */
export async function mealDayAction(date: string, dir: -1 | 0 | 1) {
  await requireViewer();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "error" as const;
  return getMealDay(date, dir);
}
