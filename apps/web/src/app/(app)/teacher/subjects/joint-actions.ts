"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteJoint, saveJoint } from "@/lib/server/joint";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 공동교육과정 수업 등록 · 고치기 · 지우기 (Figma N54). 만든 교사 본인 것만. 감사 로그에는 이름 없이 수만 남긴다 (C4)

export type JointResult = { ok: true; courseId: string } | { ok: false; error: string };

const Payload = z.object({
  id: z.string().optional(),
  kind: z.enum(["school", "online"]),
  subject: z.string().max(40),
  grade: z.number().int(),
  semester: z.union([z.literal(1), z.literal(2)]),
  ownIds: z.array(z.string()).max(200),
  external: z.array(z.object({
    id: z.string().optional(),
    school: z.string().max(20),
    grade: z.number().int(),
    classNo: z.number().int(),
    number: z.number().int(),
    name: z.string().max(20),
  })).max(200),
});

const done = () => {
  revalidatePath("/teacher/subjects");
  revalidatePath("/teacher/setuk", "layout");
};

export async function saveJointCourse(input: unknown): Promise<JointResult> {
  const v = await requireCan("subjects.assign");
  const p = Payload.safeParse(input);
  if (!p.success) return { ok: false, error: "저장할 내용을 읽지 못했어요" };
  try {
    const r = await saveJoint(v.accountId, p.data);
    await repo.audit(v.accountId, p.data.id ? "joint.update" : "joint.create", `${r.course.id} · 우리 학교 ${p.data.ownIds.length} · 다른 학교 ${p.data.external.length}`);
    done();
    return { ok: true, courseId: r.course.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

export async function deleteJointCourse(courseId: string): Promise<JointResult> {
  const v = await requireCan("subjects.assign");
  try {
    const c = await deleteJoint(v.accountId, String(courseId));
    await repo.audit(v.accountId, "joint.delete", c.id);
    done();
    return { ok: true, courseId: c.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "지우지 못했어요" };
  }
}
