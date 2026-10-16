"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canLog, isAreaOf } from "@/lib/domain/activity";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type LogState = { error?: string; added?: number };

const Schema = z.object({
  area: z.string(),
  clubId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  content: z.string().trim().min(5, "5자 이상 써 주세요").max(1000, "1000자까지 쓸 수 있어요"),
  studentIds: z.array(z.string()).min(1, "학생을 한 명 이상 골라 주세요").max(60),
});

/** 고른 학생 모두에게 같은 누가기록을 추가한다 (추가만, C4) */
export async function addLogs(_: LogState, form: FormData): Promise<LogState> {
  const v = await requireCan("logs.write");
  let ids: string[];
  try {
    ids = JSON.parse(String(form.get("studentIds") ?? "[]"));
  } catch {
    return { error: "학생 목록을 읽지 못했어요" };
  }
  const p = Schema.safeParse({ ...Object.fromEntries(form), studentIds: ids, clubId: form.get("clubId") || undefined });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { area, date, content, studentIds } = p.data;
  if (!isAreaOf(area)) return { error: "영역을 골라 주세요" };

  let club: { advisorId: string; memberIds: Set<string> } | undefined;
  let clubId: string | null = null;
  if (area === "동아리") {
    const c = p.data.clubId ? await repo.getClub(p.data.clubId) : null;
    if (!c) return { error: "동아리를 골라 주세요" };
    club = { advisorId: c.advisorId, memberIds: new Set(await repo.listClubMembers(c.id)) };
    clubId = c.id;
  }
  const all = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const targets = studentIds.map((id) => all.get(id)).filter((s) => s && canLog(v, area, s, club));
  if (targets.length !== studentIds.length) return { error: "쓸 수 없는 학생이 섞여 있어요 (우리 반·내 동아리만)" };

  const n = await repo.addActivityLogs(targets.map((s) => ({ area, studentId: s!.id, authorId: v.accountId, clubId, date, content })));
  await repo.audit(v.accountId, "logs.add", `${area} ${n}명`);
  revalidatePath("/teacher/logs");
  return { added: n };
}
