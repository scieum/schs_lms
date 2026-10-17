"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schoolYear } from "@/lib/domain/curriculum";
import { checkLength, UNIT_LABEL } from "@/lib/domain/length";
import type { Student, Viewer } from "@/lib/domain/types";
import { canWriteRecord, findIdentity, isRecordArea, latestMemoByStudent, RECORD_LABEL, resolveRecordLength, type AiDraftResult, type RecordArea } from "@/lib/domain/writing";
import { writeRecord } from "@/lib/server/ai/write-record";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { evidenceLogs } from "./data";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { readEvidence, type EvidenceResult } from "@/lib/server/ai/read-evidence";
import { fitRecord, mergeRecord, tagCompetency } from "@/lib/server/ai/merge-record";
import { logPieces, memoPieces, programPieces } from "@/lib/server/merge-pieces";
import { fitRange, type MergePiece } from "@/lib/domain/merge";
import type { TaggedSentence } from "@/lib/domain/competency";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";

// 창체 특기사항(자율·자치/동아리/진로)·행발: AI 초안 → 교사 수정 → 저장(새 버전) → 확정

/** 이 교사가 이 학생의 이 영역을 쓸 수 있는지 서버에서 다시 확인한다 */
async function target(v: Viewer, area: RecordArea, studentId: string, clubId?: string | null): Promise<{ student: Student; clubName?: string } | { error: string }> {
  const student = await repo.getStudent(studentId);
  if (!student) return { error: "학생을 찾지 못했어요" };
  let club: { advisorId: string; memberIds: Set<string> } | undefined;
  let clubName: string | undefined;
  if (area === "동아리") {
    const c = clubId ? await repo.getClub(clubId) : null;
    if (!c) return { error: "동아리를 골라 주세요" };
    club = { advisorId: c.advisorId, memberIds: new Set(await repo.listClubMembers(c.id)) };
    clubName = c.name;
  }
  if (!canWriteRecord(v, area, student, club)) return { error: area === "동아리" ? "내 동아리 부원만 쓸 수 있어요" : "우리 반 학생만 쓸 수 있어요" };
  return { student, clubName };
}

const AiSchema = z.object({
  area: z.string(),
  studentId: z.string().min(1),
  clubId: z.string().nullish(),
  memo: z.string().max(6000, "메모·자료는 6000자까지예요"),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
});

/** "AI 초안": 결과는 돌려주기만 한다. 저장은 교사가 "임시 저장/확정"을 눌러야 된다 */
export async function aiRecordDraft(input: z.input<typeof AiSchema>): Promise<AiDraftResult> {
  const v = await requireCan("record.write");
  const p = AiSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { area, studentId, clubId, unit, max } = p.data;
  if (!isRecordArea(area)) return { ok: false, error: "영역을 골라 주세요" };
  const t = await target(v, area, studentId, clubId);
  if ("error" in t) return { ok: false, error: t.error };

  // 메모가 바뀌었으면 새 버전으로 남긴다 (다음에 열면 이어서 보이게)
  const memo = p.data.memo.trim();
  const prev = latestMemoByStudent(await repo.listRecordMemos(area, [studentId])).get(studentId);
  if (memo && memo !== prev?.content) await repo.addRecordMemo({ scope: area, studentId, authorId: v.accountId, content: memo });

  const logs = await evidenceLogs(area, [studentId], clubId);
  const range = resolveRecordLength(area, { unit, max });
  const r = await writeRecord({ kind: area, student: t.student, context: t.clubName, memo, logs: logs.map((l) => ({ date: l.date, content: l.content })), range });
  await repo.audit(v.accountId, "record.ai_draft", `${area} ${t.student.pseudonymId}`);
  if (!r.text) return { ok: false, error: r.notice ?? "초안을 만들지 못했어요. 직접 써 주세요" };
  return { ok: true, text: r.text, sample: r.sample, notice: r.notice };
}

export type RecordState = { error?: string; saved?: "draft" | "confirmed"; at?: string };

const SaveSchema = z.object({
  area: z.string(),
  studentId: z.string().min(1),
  clubId: z.string().optional(),
  content: z.string().max(5000, "너무 길어요"),
  lengthUnit: z.enum(["bytes", "chars"]),
  lengthMax: z.coerce.number().int().min(1, "최대 분량을 넣어 주세요"),
  intent: z.enum(["draft", "confirmed"]),
});

/** 저장: 임시 저장 또는 확정. 언제나 새 버전으로 추가한다 (C4) */
export async function saveRecord(_: RecordState, form: FormData): Promise<RecordState> {
  const v = await requireCan("record.write");
  const p = SaveSchema.safeParse({ ...Object.fromEntries(form), clubId: form.get("clubId") || undefined });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const { area, studentId, clubId, intent } = p.data;
  if (!isRecordArea(area)) return { error: "영역을 골라 주세요" };
  const t = await target(v, area, studentId, clubId);
  if ("error" in t) return { error: t.error };

  const content = p.data.content.replace(/\r\n/g, "\n").trim();
  const range = resolveRecordLength(area, { unit: p.data.lengthUnit, max: p.data.lengthMax });
  if (intent === "confirmed") {
    if (!content) return { error: "빈 내용은 확정할 수 없어요" };
    const c = checkLength(content, range);
    // 분량 초과는 교사가 확인(allowOver)하면 확정한다
    if (c.reason === "too_long" && form.get("allowOver") !== "on") return { error: `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}를 넘었어요 (지금 ${c.value.toLocaleString()}). 이대로 확정하려면 분량 초과 확인에 체크해 주세요` };
    if (c.reason === "too_long") await repo.audit(v.accountId, "record.over_length", `${c.value}/${range.max}`);
    if (findIdentity(content, t.student).length) return { error: "이름·학번이 들어 있어 확정할 수 없어요" };
    const banned = forbiddenBlock(content);
    if (banned) return { error: banned };
  }

  const r = await repo.addRecordDraft({ area, studentId, authorId: v.accountId, year: schoolYear(), semester: null, content, unit: range.unit, max: range.max, status: intent });
  await repo.audit(v.accountId, intent === "confirmed" ? "record.confirm" : "record.save", `${area} ${t.student.pseudonymId}`);
  revalidatePath(area === "행발" ? "/homeroom/behavior" : "/teacher/write");
  return { saved: intent, at: r.createdAt };
}

/** 자료로 쓰기 (Figma N10): 학생 자료 파일 하나 → (주제)(활동)(키워드) 근거. 저장하지 않는다 */
export async function readRecordFile(form: FormData): Promise<EvidenceResult> {
  const v = await requireCan("record.write");
  const area = String(form.get("area") ?? "");
  if (!isRecordArea(area)) return { ok: false, error: "영역을 골라 주세요" };
  const t = await target(v, area, String(form.get("studentId") ?? ""), String(form.get("clubId") ?? "") || null);
  if ("error" in t) return { ok: false, error: t.error };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, { mode: "record", kind: RECORD_LABEL[area], context: t.clubName, people: peopleAround(t.student, await repo.listStudents()) });
  await repo.audit(v.accountId, "record.ai_read_file", `${area} ${t.student.pseudonymId}`);
  return r;
}

// ---------- 합치기 · 맞추기 · 역량 보기 (Figma N11) ----------

const MergeSchema = z.object({
  pieces: z.array(z.object({ id: z.string(), source: z.enum(["누가기록", "메모", "본문", "특색 활동"]), date: z.string().nullable(), text: z.string().max(6000) })).min(1, "합칠 조각을 골라 주세요").max(80),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
});
const FitSchema = z.object({ text: z.string().min(1, "본문이 비어 있어요").max(6000), unit: z.enum(["bytes", "chars"]), max: z.number().int().min(1) });
const toDraft = (r: { text: string; sample: boolean; notice?: string }): AiDraftResult =>
  r.text ? { ok: true, text: r.text, sample: r.sample, notice: r.notice } : { ok: false, error: r.notice ?? "만들지 못했어요. 직접 고쳐 주세요" };

async function recordTarget(area: string, studentId: string, clubId?: string | null) {
  const v = await requireCan("record.write");
  if (!isRecordArea(area)) return { error: "영역을 골라 주세요" };
  const t = await target(v, area, studentId, clubId);
  if ("error" in t) return t;
  return { v, area, ...t };
}

// 담임 영역에 붙는 특색 활동 초안의 영역 (동아리 특기사항은 지도교사가, 행발은 담임이 직접 쓴다)
const PROGRAM_AREA = { "자율·자치": "창체-자율", 진로: "창체-진로" } as const;

/** 합칠 조각: 이 영역 누가기록(행발은 세 영역) + 관찰 메모 + (자율·자치·진로) 받은 특색 활동 초안 */
export async function listRecordPieces(input: { area: string; studentId: string; clubId?: string | null }): Promise<MergePiece[]> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return [];
  const programArea = t.area === "자율·자치" || t.area === "진로" ? PROGRAM_AREA[t.area] : null;
  const [logs, memos, drafts] = await Promise.all([
    evidenceLogs(t.area, [input.studentId], input.clubId),
    repo.listRecordMemos(t.area, [input.studentId]),
    programArea ? repo.listDraftsForStudents([input.studentId]) : Promise.resolve([]),
  ]);
  return [...programPieces(drafts.filter((d) => d.area === programArea)), ...logPieces(logs), ...memoPieces(memos)];
}

export async function mergeRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof MergeSchema>): Promise<AiDraftResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = MergeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max }));
  const r = await mergeRecord({ kind: t.area, context: t.clubName, student: t.student, pieces: p.data.pieces, range });
  await repo.audit(t.v.accountId, "record.ai_merge", `${t.area} ${t.student.pseudonymId} ${p.data.pieces.length}조각`);
  return toDraft(r);
}

export async function fitRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof FitSchema>): Promise<AiDraftResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = FitSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max }));
  const r = await fitRecord({ kind: t.area, context: t.clubName, student: t.student, text: p.data.text, range });
  await repo.audit(t.v.accountId, "record.ai_fit", `${t.area} ${t.student.pseudonymId}`);
  return toDraft(r);
}

export async function tagRecord(input: { area: string; studentId: string; clubId?: string | null; text: string }): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동" } | { error: string }> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { error: t.error };
  return tagCompetency(String(input.text ?? "").slice(0, 6000), t.student);
}
