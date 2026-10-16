"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { matchSubject, normalizeSubjectName, schoolYear } from "@/lib/domain/curriculum";
import { fieldOf, sectionSuggestions } from "@/lib/domain/offering";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type OfferingFormState = { error?: string; done?: string };

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "마감일을 골라 주세요");

const RoundSchema = z.object({
  grade: z.coerce.number().int().min(1).max(3),
  semester: z.coerce.number().int().min(1).max(2),
  deadline: DATE,
  maxCredits: z.coerce.number().int().min(1, "최대 학점은 1~40").max(40, "최대 학점은 1~40"),
});

/** 한 학년의 과목 신청 열기 */
export async function openRound(_: OfferingFormState, form: FormData): Promise<OfferingFormState> {
  const v = await requireCan("offering.manage");
  const p = RoundSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { grade, semester, deadline, maxCredits } = p.data;
  try {
    await repo.offeringCreateRound({ year: schoolYear(), grade, semester: semester as 1 | 2, deadline, maxCredits });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "열지 못했어요" };
  }
  await repo.audit(v.accountId, "offering.round", `${grade}학년 ${semester}학기`);
  revalidatePath("/admin/offerings");
  return { done: "신청을 열었어요" };
}

const SettingsSchema = z.object({ id: z.string().min(1), deadline: DATE, maxCredits: RoundSchema.shape.maxCredits });

/** 마감일·최대 학점 바꾸기 */
export async function updateRound(_: OfferingFormState, form: FormData): Promise<OfferingFormState> {
  const v = await requireCan("offering.manage");
  const p = SettingsSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const round = await repo.offeringGetRound(p.data.id);
  if (!round) return { error: "신청을 찾지 못했어요" };
  await repo.offeringUpdateRound(round.id, { deadline: p.data.deadline, maxCredits: p.data.maxCredits });
  await repo.audit(v.accountId, "offering.settings", `${round.grade}학년 ${round.semester}학기 ~${p.data.deadline} ${p.data.maxCredits}학점`);
  revalidatePath("/admin/offerings");
  return { done: "저장했어요" };
}

const OfferingSchema = z.object({
  roundId: z.string().min(1),
  subject: z.string().trim().min(2, "과목 이름을 2자 이상 써 주세요").max(30, "과목 이름은 30자까지"),
  credits: z.coerce.number().int().min(1).max(10),
  capacity: z.coerce.number({ message: "정원을 숫자로 써 주세요" }).int().min(1, "정원은 1~200").max(200, "정원은 1~200"),
  field: z.string().max(10),
});

/** 새 과목 열기: 편제표 과목이면 분야·연결을 자동으로 맞춘다 */
export async function createOffering(_: OfferingFormState, form: FormData): Promise<OfferingFormState> {
  const v = await requireCan("offering.manage");
  const p = OfferingSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const round = await repo.offeringGetRound(p.data.roundId);
  if (!round) return { error: "신청을 찾지 못했어요" };

  const key = normalizeSubjectName(p.data.subject);
  const course = (await repo.listCourses(round.year)).find((c) => c.grade === round.grade && normalizeSubjectName(c.subject) === key);
  const known = matchSubject(p.data.subject);
  const subject = course?.subject ?? known?.name ?? p.data.subject;
  const field = course ? fieldOf(course.group) : known ? fieldOf(known.group) : p.data.field || "기타";

  try {
    await repo.offeringCreate({ roundId: round.id, subject, field, credits: p.data.credits, capacity: p.data.capacity, courseId: course?.id ?? null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "열지 못했어요" };
  }
  await repo.audit(v.accountId, "offering.create", `${round.grade}-${round.semester} ${subject}`);
  revalidatePath("/admin/offerings");
  return { done: `${subject}을(를) 열었어요` };
}

export async function archiveOffering(form: FormData) {
  const v = await requireCan("offering.manage");
  const id = String(form.get("id") ?? "");
  const roundId = String(form.get("roundId") ?? "");
  const o = (await repo.offeringList(roundId)).find((x) => x.id === id);
  if (!o) return;
  await repo.offeringArchive(id);
  await repo.audit(v.accountId, "offering.archive", o.subject);
  revalidatePath("/admin/offerings");
}

/** 정원 초과 과목마다 반을 하나씩 늘린다 (화면 제안을 확인한 뒤 누른다 — 서버에서 다시 계산) */
export async function addSections(form: FormData) {
  const v = await requireCan("offering.manage");
  const roundId = String(form.get("roundId") ?? "");
  const [offerings, counts] = await Promise.all([repo.offeringList(roundId), repo.offeringCounts(roundId)]);
  const list = sectionSuggestions(offerings, counts);
  if (list.length === 0) return;
  await repo.offeringAddSections(list.map((x) => x.offering.id));
  await repo.audit(v.accountId, "offering.sections", list.map((x) => x.offering.subject).join(", "));
  revalidatePath("/admin/offerings");
}
