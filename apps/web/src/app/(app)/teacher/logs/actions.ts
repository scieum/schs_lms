"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canLog, homeroomStudents, isAreaOf } from "@/lib/domain/activity";
import { maskIdentity } from "@/lib/domain/program";
import { polishLog } from "@/lib/server/ai/teacher-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { readEvidence } from "@/lib/server/ai/read-evidence";
import { takeEvidenceFile } from "@/lib/server/evidence-upload";

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

/** 이 화면에 나오는 학생(우리 반·내 동아리) — AI에 보내기 전에 이름·학번을 가린다 */
async function boardPeople(v: Awaited<ReturnType<typeof requireCan>>, area: string, clubId?: string) {
  const all = await repo.listStudents();
  let people = homeroomStudents(v, all);
  if (area === "동아리" && clubId) {
    const c = await repo.getClub(clubId);
    if (c && c.advisorId === v.accountId) {
      const ids = new Set(await repo.listClubMembers(c.id));
      people = all.filter((s) => ids.has(s.id));
    }
  }
  return people;
}

export type PolishResult = { ok: true; text: string; label: "AI" | "자동"; notice?: string } | { ok: false; error: string };

/**
 * "AI로 다듬기": 메모·받아쓰기 → 누가기록 문체 1~2문장. 저장하지 않고 돌려주기만 한다.
 * 고른 학생 모두에게 같은 글이 들어가므로 학생 정보는 보내지 않고, 메모 속 이름·학번은 가린 뒤 보낸다.
 */
export async function polishLogMemo(input: { area: string; clubId?: string; text: string }): Promise<PolishResult> {
  const v = await requireCan("logs.write");
  const text = String(input.text ?? "").trim();
  if (text.length < 2) return { ok: false, error: "메모를 먼저 적어 주세요" };
  if (text.length > 1000) return { ok: false, error: "1000자까지 다듬을 수 있어요" };
  if (!isAreaOf(input.area)) return { ok: false, error: "영역을 골라 주세요" };

  const people = await boardPeople(v, input.area, input.clubId);
  const masked = maskIdentity(text, people);
  const r = await polishLog(masked, input.area);
  if (r.label === "AI") await repo.audit(v.accountId, "logs.ai.polish", input.area);
  if (!r.data) return { ok: false, error: "다듬을 내용을 찾지 못했어요. 직접 써 주세요" };
  return { ok: true, text: r.data, label: r.label, notice: r.error ? `AI 대신 규칙으로 다듬었어요 (${r.error})` : masked !== text ? "이름·학번은 가린 뒤 다듬었어요" : undefined };
}

/**
 * "파일로 쓰기" (Figma N10): 활동지·보고서·사진 → 누가기록 한두 문장. 저장하지 않고 돌려주기만 한다.
 * 고른 학생 모두에게 같은 글이 들어가므로 이름·학번은 가린다.
 */
export async function readLogFile(form: FormData): Promise<PolishResult> {
  const v = await requireCan("logs.write");
  const area = String(form.get("area") ?? "");
  if (!isAreaOf(area)) return { ok: false, error: "영역을 골라 주세요" };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const people = (await boardPeople(v, area, String(form.get("clubId") ?? "") || undefined)).map((s) => ({ name: s.name, studentNo: s.studentNo }));
  const r = await readEvidence(file, { mode: "log", kind: area, people });
  if (!r.ok) return r;
  await repo.audit(v.accountId, "logs.ai.read_file", area);
  return { ok: true, text: r.text.slice(0, 1000), label: r.label, notice: `${file.name}에서` };
}
