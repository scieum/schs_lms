"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { schoolYear } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type ClubState = { error?: string; saved?: boolean };

/** 동아리 만들기: 만든 교사가 지도교사 */
export async function createClub(_: ClubState, form: FormData): Promise<ClubState> {
  const v = await requireCan("logs.write");
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 30) return { error: "동아리 이름을 2~30자로 써 주세요" };
  let id: string;
  try {
    id = (await repo.createClub({ year: schoolYear(), name, advisorId: v.accountId })).id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "만들지 못했어요" };
  }
  await repo.audit(v.accountId, "club.create", name);
  revalidatePath("/teacher/club");
  redirect(`/teacher/club?club=${id}`);
}

const Members = z.object({ clubId: z.string(), studentIds: z.array(z.string()).max(200) });

/** 부원 저장: 지도교사만 */
export async function saveMembers(_: ClubState, form: FormData): Promise<ClubState> {
  const v = await requireCan("logs.write");
  let data: z.infer<typeof Members>;
  try {
    data = Members.parse(JSON.parse(String(form.get("payload") ?? "")));
  } catch {
    return { error: "저장할 내용을 읽지 못했어요" };
  }
  const club = await repo.getClub(data.clubId);
  if (!club || club.advisorId !== v.accountId) return { error: "내가 지도하는 동아리만 바꿀 수 있어요" };
  const known = new Set((await repo.listStudents()).map((s) => s.id));
  const ids = data.studentIds.filter((id) => known.has(id));
  await repo.setClubMembers(club.id, ids);
  await repo.audit(v.accountId, "club.members", `${club.name} ${ids.length}명`);
  revalidatePath("/teacher/club");
  revalidatePath("/teacher/logs");
  return { saved: true };
}
