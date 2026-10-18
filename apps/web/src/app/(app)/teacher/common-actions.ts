"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { commonScope, parseScope } from "@/lib/domain/common-activity";
import { PIECE_MAX, PIECE_MIN } from "@/lib/domain/merge";
import { seoulNow } from "@/lib/domain/night";
import type { Viewer } from "@/lib/domain/types";
import { readEvidence, type EvidenceResult } from "@/lib/server/ai/read-evidence";
import { resolveScope } from "@/lib/server/common-activity";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 공통 활동 (Figma N26): 등록 → 학생 자료 한꺼번에 → 학생마다 "[활동명] …" 조각.
// 세특은 세특 쓰기 권한, 창체·행발은 기록 쓰기 권한. 범위(과목·분반 / 담임 반 / 동아리)는 서버에서 다시 확인한다.

const NO = "내 과목·반·동아리 학생만 쓸 수 있어요";

/** 범위 종류에 맞는 권한으로 확인 */
async function viewerFor(scope: string): Promise<Viewer | null> {
  const ref = parseScope(scope);
  if (!ref) return null;
  return requireCan(ref.kind === "세특" ? "setuk.write" : "record.write");
}

const CreateSchema = z.object({
  scope: z.string().min(1).max(200),
  name: z.string().max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: z.string().max(300, "설명은 300자까지예요").optional().default(""),
});

export async function createCommonActivity(input: z.input<typeof CreateSchema>): Promise<{ error?: string; id?: string }> {
  const p = CreateSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const v = await viewerFor(p.data.scope);
  if (!v) return { error: NO };
  const r = await resolveScope(v, p.data.scope);
  if (!r) return { error: NO };
  const name = cleanActivity(p.data.name);
  if (!name) return { error: "활동명을 적어 주세요" };
  try {
    const a = await repo.addCommonActivity({ scope: p.data.scope, name, date: p.data.date ?? null, description: p.data.description.trim(), authorId: v.accountId });
    await repo.audit(v.accountId, "common.create", `${r.ref.kind} ${r.label} · ${name}`);
    revalidatePath(r.backHref.split("?")[0]);
    return { id: a.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "등록하지 못했어요" };
  }
}

/** 활동 + 이 교사가 쓸 수 있는지 + 그 학생 */
async function activityTarget(activityId: string, studentId: string) {
  const a = await repo.getCommonActivity(activityId);
  if (!a) return null;
  const v = await viewerFor(a.scope);
  if (!v) return null;
  const r = await resolveScope(v, a.scope);
  const student = r?.students.find((s) => s.id === studentId);
  if (!r || !student) return null;
  return { v, a, r, student };
}

/** 학생 자료 한 조각(큰 PDF는 브라우저가 쪽을 나눠 여러 번) → 활동 요약 1~2문장. 파일은 저장하지 않는다 */
export async function summarizeCommonFile(form: FormData): Promise<EvidenceResult> {
  const t = await activityTarget(String(form.get("activityId") ?? ""), String(form.get("studentId") ?? ""));
  if (!t) return { ok: false, error: NO };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, { mode: "log", kind: `${t.r.kind} · ${t.a.name}`, people: peopleAround(t.student, await repo.listStudents()) });
  await repo.audit(t.v.accountId, "common.ai_file", `${t.r.ref.kind} ${t.student.pseudonymId}`);
  return r;
}

const SaveSchema = z.object({
  activityId: z.string().min(1),
  studentId: z.string().min(1),
  text: z.string().max(4000),
  fileCount: z.number().int().min(0).max(50),
});

/**
 * 만든 요약을 그 학생 조각으로 남긴다 (추가만, C4). 글은 "[활동명] …".
 * 세특 → 과목 공통 활동 메모 · 행발 → 행발 공통 활동 메모 · 자율·자치·진로·동아리 → 누가기록(공통 활동 표시)
 */
export async function saveCommonPiece(input: z.input<typeof SaveSchema>): Promise<{ error?: string }> {
  const p = SaveSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const t = await activityTarget(p.data.activityId, p.data.studentId);
  if (!t) return { error: NO };
  const done = await repo.listCommonActivityPieces([t.a.id]);
  if (done.some((x) => x.studentId === t.student.id)) return { error: "이미 조각을 만들었어요" };
  const text = withActivity(t.a.name, p.data.text.replace(/\s+/g, " ")).slice(0, PIECE_MAX);
  if (text.length < PIECE_MIN + t.a.name.length + 3) return { error: "자료에서 글을 찾지 못했어요" };

  const ref = t.r.ref;
  try {
    if (ref.kind === "세특") {
      await repo.addRecordMemo({ scope: commonScope(`세특:${ref.courseId}`), studentId: t.student.id, authorId: t.v.accountId, content: text });
    } else if (ref.kind === "행발") {
      await repo.addRecordMemo({ scope: commonScope("행발"), studentId: t.student.id, authorId: t.v.accountId, content: text });
    } else {
      await repo.addActivityLogs([{
        area: ref.kind, studentId: t.student.id, authorId: t.v.accountId, clubId: ref.kind === "동아리" ? ref.clubId : null,
        date: t.a.date ?? seoulNow().date, content: text, commonActivityId: t.a.id,
      }]);
      revalidatePath("/teacher/logs");
    }
    await repo.addCommonActivityPiece({ activityId: t.a.id, studentId: t.student.id, authorId: t.v.accountId, content: text, fileCount: p.data.fileCount });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "남기지 못했어요" };
  }
  await repo.audit(t.v.accountId, "common.piece", `${ref.kind} ${t.student.pseudonymId}`);
  revalidatePath("/teacher/pieces");
  return {};
}
