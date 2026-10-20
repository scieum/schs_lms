"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canLog, homeroomStudents, isAreaOf } from "@/lib/domain/activity";
import { maskIdentity } from "@/lib/domain/program";
import { cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { polishLog, polishStudentLog, reviseLog, softenMemo } from "@/lib/server/ai/teacher-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { readEvidence } from "@/lib/server/ai/read-evidence";
import { takeEvidenceFile } from "@/lib/server/evidence-upload";

export type LogState = { error?: string; added?: number };

const Schema = z.object({
  area: z.string(),
  clubId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  /** 활동명 (Figma N32): 기록 맨 앞에 "[활동명] "으로 붙인다 */
  activity: z.string().max(60).optional().default(""),
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
  const { area, date, studentIds } = p.data;
  if (!isAreaOf(area)) return { error: "영역을 골라 주세요" };
  if (!cleanActivity(p.data.activity)) return { error: "활동명을 적어 주세요" };
  const content = withActivity(p.data.activity, p.data.content);
  if (content.length > 1000) return { error: "1000자까지 쓸 수 있어요" };

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

const EachSchema = z.object({
  area: z.string(),
  clubId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  items: z
    .array(z.object({ studentId: z.string().min(1), content: z.string().trim().min(5, "글이 너무 짧은 학생이 있어요 (5자 이상)").max(1000, "1000자까지 쓸 수 있어요") }))
    .min(1, "추가할 학생을 한 명 이상 포함해 주세요")
    .max(60, "한 번에 60명까지 추가할 수 있어요"),
});

/** 누가기록 한꺼번에 쓰기 (Figma N28): 학생마다 다른 글로 누가기록을 하나씩 추가한다 (추가만, C4) */
export async function addLogsEach(input: { area: string; clubId?: string; date: string; items: { studentId: string; content: string }[] }): Promise<LogState> {
  const v = await requireCan("logs.write");
  const p = EachSchema.safeParse({ ...input, clubId: input?.clubId || undefined });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { area, date, items } = p.data;
  if (!isAreaOf(area)) return { error: "영역을 골라 주세요" };
  if (new Set(items.map((i) => i.studentId)).size !== items.length) return { error: "같은 학생이 두 번 들어 있어요" };

  let club: { advisorId: string; memberIds: Set<string> } | undefined;
  let clubId: string | null = null;
  if (area === "동아리") {
    const c = p.data.clubId ? await repo.getClub(p.data.clubId) : null;
    if (!c) return { error: "동아리를 골라 주세요" };
    club = { advisorId: c.advisorId, memberIds: new Set(await repo.listClubMembers(c.id)) };
    clubId = c.id;
  }
  const all = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const ok = items.every((i) => {
    const s = all.get(i.studentId);
    return s && canLog(v, area, s, club);
  });
  if (!ok) return { error: "쓸 수 없는 학생이 섞여 있어요 (우리 반·내 동아리만)" };

  const n = await repo.addActivityLogs(items.map((i) => ({ area, studentId: i.studentId, authorId: v.accountId, clubId, date, content: i.content })));
  await repo.audit(v.accountId, "logs.add_each", `${area} ${n}명`);
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
 * 수정 요청 (Figma N49 ⑤): 다듬은 누가기록을 교사 요청대로 고친 제안 (저장 안 함 — 교사가 "이걸로 바꾸기").
 * 글과 요청 모두 이 화면 학생들의 이름·학번을 가린 뒤 보낸다. [활동명] 머리말은 떼고 보낸 뒤 다시 붙인다.
 */
export async function reviseLogMemo(input: { area: string; clubId?: string; text: string; request: string }): Promise<PolishResult> {
  const v = await requireCan("logs.write");
  if (!isAreaOf(input.area)) return { ok: false, error: "영역을 골라 주세요" };
  const raw = String(input.text ?? "").trim();
  const head = raw.match(/^\[[^\]]*\]\s*/)?.[0] ?? "";
  const text = raw.slice(head.length);
  const request = String(input.request ?? "").trim();
  if (text.length < 2) return { ok: false, error: "고칠 글이 없어요" };
  if (!request) return { ok: false, error: "고칠 점을 적어 주세요" };
  if (text.length > 1000 || request.length > 300) return { ok: false, error: "글은 1000자, 요청은 300자까지예요" };
  const people = await boardPeople(v, input.area, input.clubId);
  const r = await reviseLog(maskIdentity(text, people), maskIdentity(request, people), input.area);
  if (!r) return { ok: false, error: "AI가 꺼져 있어 요청을 보낼 수 없어요. 직접 고쳐 주세요" };
  if (r.error || !r.data) return { ok: false, error: r.error ?? "고치지 못했어요. 다시 보내 주세요" };
  await repo.audit(v.accountId, "logs.ai.revise", input.area);
  return { ok: true, text: head + r.data, label: "AI" };
}

/**
 * 순화하기 (Figma N34 ③): 퉁명스러운 메모 → 생기부 말투. 저장하지 않고 돌려주기만 한다 ("조각으로 넣기"는 addLogs).
 * polishLogMemo 처럼 이 화면 학생들의 이름·학번을 가린 뒤 보낸다. AI가 꺼져 있으면 순화하지 않는다.
 */
export async function softenLogMemo(input: { area: string; clubId?: string; text: string }): Promise<PolishResult> {
  const v = await requireCan("logs.write");
  const text = String(input.text ?? "").trim();
  if (text.length < 2) return { ok: false, error: "메모를 먼저 적어 주세요" };
  if (text.length > 1000) return { ok: false, error: "1000자까지 순화할 수 있어요" };
  if (!isAreaOf(input.area)) return { ok: false, error: "영역을 골라 주세요" };
  const people = await boardPeople(v, input.area, input.clubId);
  const r = await softenMemo(maskIdentity(text, people), input.area);
  if (!r) return { ok: false, error: "AI가 꺼져 있어 순화할 수 없어요. 직접 고쳐 주세요" };
  if (r.error || !r.data) return { ok: false, error: r.error ?? "순화하지 못했어요. 직접 고쳐 주세요" };
  await repo.audit(v.accountId, "logs.ai.soften", input.area);
  return { ok: true, text: r.data, label: "AI" };
}

/**
 * 한꺼번에 쓰기 미리보기 카드 "다듬기" (N28): 학생 한 명의 글을 다듬어 돌려준다(저장 안 함, 확인 후 교사가 바꿈).
 * 학생 정보는 보내지 않는다. 글 속 이름·학번은 가리고, [활동명] 머리말은 떼고 보낸 뒤 다시 붙인다.
 */
export async function polishTraitLog(input: { area: string; clubId?: string; activity: string; text: string }): Promise<PolishResult> {
  const v = await requireCan("logs.write");
  if (!isAreaOf(input.area)) return { ok: false, error: "영역을 골라 주세요" };
  const body = String(input.text ?? "").trim().replace(/^\[[^\]]*\]\s*/, "");
  if (body.length < 2) return { ok: false, error: "글을 먼저 써 주세요" };
  if (body.length > 1000) return { ok: false, error: "1000자까지 다듬을 수 있어요" };

  const people = await boardPeople(v, input.area, input.clubId);
  const masked = maskIdentity(body, people);
  const r = await polishStudentLog(masked, input.area);
  if (r.label === "AI") await repo.audit(v.accountId, "logs.ai.polish_each", input.area);
  if (!r.data) return { ok: false, error: "다듬을 내용을 찾지 못했어요" };
  return {
    ok: true,
    text: withActivity(input.activity, r.data),
    label: r.label,
    notice: r.error ? `AI 대신 규칙으로 다듬었어요 (${r.error})` : masked !== body ? "이름·학번은 가린 뒤 다듬었어요" : undefined,
  };
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
