"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schoolYear } from "@/lib/domain/curriculum";
import { checkLength, UNIT_LABEL } from "@/lib/domain/length";
import type { Student, Viewer } from "@/lib/domain/types";
import { canWriteRecord, findIdentity, isRecordArea, latestMemoByStudent, RECORD_LABEL, recordMax, resolveRecordLength, type AiDraftResult, type RecordArea } from "@/lib/domain/writing";
import { writeRecord } from "@/lib/server/ai/write-record";
import { repo } from "@/lib/server/repo";
import { styleAreaOf, styleTone } from "@/lib/domain/writing-style";
import { requireCan } from "@/lib/server/viewer";
import { evidenceLogs } from "./data";
import { lessonBackgroundFor } from "@/lib/server/lessons";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { readEvidence, type EvidenceResult } from "@/lib/server/ai/read-evidence";
import { fitRecord, fixRecord, mergeRecord, reviseRecord, tagCompetency, variantsRecord } from "@/lib/server/ai/merge-record";
import { gateBand, type GateResult } from "@/lib/domain/length-gate";
import { softenMemo } from "@/lib/server/ai/teacher-ai";
import { measure } from "@/lib/domain/length";
import { scrubIdentity } from "@/lib/domain/writing";
import type { AiFixResult, VariantsActionResult } from "@/lib/domain/variants";
import { listMemosWithPieces, logPieces, memoPieces, programPieces } from "@/lib/server/merge-pieces";
import { seoulNow } from "@/lib/domain/night";
import { cleanActivity, withActivity } from "@/lib/domain/activity-name";
import { fitRange, PIECE_MAX, PIECE_MIN, PIECE_SOURCES, pieceScopeOf, type MergePiece, type PieceKind } from "@/lib/domain/merge";
import type { TaggedSentence } from "@/lib/domain/competency";
import { peopleAround, takeEvidenceFile } from "@/lib/server/evidence-upload";
import { homeroomStudents } from "@/lib/domain/activity";
import type { ClassCheckView } from "@/lib/domain/class-check";
import { buildClassView, classAudit } from "@/lib/server/class-check";
import { latestRecordByStudent } from "@/lib/domain/writing";
import { classProv, confirmAudit, pieceKey, piecesPool, provForSave, saveOriginal } from "@/lib/server/provenance";
import { sourceKey, type SourceItem } from "@/lib/domain/provenance";
import type { WriteOutcome } from "@/lib/domain/class-write";
import { aiFailed, runClassWrite } from "@/lib/server/class-write";
import { aiEnabled } from "@/lib/server/ai/claude";
import { behaviorDraft } from "@/lib/server/ai/merge-record";
import { RECORD_MAX_BYTES } from "@/lib/domain/writing";

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
  /** 활동명 (N27): 초안을 "활동명에서 …"로 */
  activity: z.string().max(60).optional().default(""),
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
  const saved = memo && memo !== prev?.content ? await repo.addRecordMemo({ scope: area, studentId, authorId: v.accountId, content: memo }) : prev?.content === memo ? prev : undefined;

  const logs = await evidenceLogs(area, [studentId], clubId);
  const range = resolveRecordLength(area, { unit, max });
  const r = await writeRecord({
    kind: area, student: t.student, context: t.clubName, memo, memoKey: saved ? sourceKey({ type: "piece", ref: saved.id }) : undefined, range, activity: p.data.activity,
    logs: logs.map((l) => ({ date: l.date, content: l.content, key: pieceKey({ id: `log-${l.id}`, source: l.commonActivityId ? "공통 활동" : "누가기록" }) })),
  });
  await repo.audit(v.accountId, "record.ai_draft", `${area} ${t.student.pseudonymId}`);
  if (!r.text) return { ok: false, error: r.notice ?? "초안을 만들지 못했어요. 직접 써 주세요" };
  // AI 원안 (N38): 고칠 수 없게 남기고 문장 근거를 붙인다
  const o = await saveOriginal({ kind: "record", studentId, scope: area, text: r.text, aiSentences: r.sentences, pool: await recordPool(area, studentId, clubId), model: r.sample ? "sample" : "write" });
  return { ok: true, text: r.text, sample: r.sample, notice: r.notice, ...(o ?? {}) };
}

/** needReason (N38): 적게 고친 채 확정 — 까닭을 받아 다시 확정 */
export type RecordState = { error?: string; saved?: "draft" | "confirmed"; at?: string; needReason?: { ratio: number; nosource: number; n: number } };

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

  // N38: AI 원안이 있으면 서버가 문장 근거 · 수정 비율을 다시 계산. 적게 고쳤는데 까닭이 없으면 확인 창
  const pv = await provForSave({ aiOriginalId: String(form.get("aiOriginalId") ?? "") || null, pins: form.get("pins"), content, studentId, confirm: intent === "confirmed", reason: String(form.get("lowEditReason") ?? "") });
  if (pv.needReason) return { needReason: { ratio: pv.ratio ?? 0, nosource: pv.nosource, n: Date.now() } };

  const r = await repo.addRecordDraft({ area, studentId, authorId: v.accountId, year: schoolYear(), semester: null, content, unit: range.unit, max: range.max, status: intent, ...pv.prov });
  // 확정: 수정 비율을 아는 글은 숫자만 남긴다 (글 · 까닭 · 이름 · 학번 없음)
  if (intent === "confirmed" && pv.ratio != null) await repo.audit(v.accountId, "record.confirm", confirmAudit(area, r.id, pv));
  else await repo.audit(v.accountId, intent === "confirmed" ? "record.confirm" : "record.save", `${area} ${t.student.pseudonymId}`);
  revalidatePath(area === "동아리" ? "/teacher/club/compose" : "/homeroom/compose");
  return { saved: intent, at: r.createdAt };
}

/** 조각 모으기 · 자료 (Figma N32): 활동 자료 → 활동 요약 1~2문장 (조각 후보, 저장하지 않음). 큰 PDF는 화면이 쪽을 나눠 여러 번 부른다 */
export async function summarizeRecordFile(form: FormData): Promise<EvidenceResult> {
  const v = await requireCan("record.write");
  const area = String(form.get("area") ?? "");
  if (!isRecordArea(area)) return { ok: false, error: "영역을 골라 주세요" };
  const t = await target(v, area, String(form.get("studentId") ?? ""), String(form.get("clubId") ?? "") || null);
  if ("error" in t) return { ok: false, error: t.error };
  const file = await takeEvidenceFile(form);
  if (typeof file === "string") return { ok: false, error: file };
  const r = await readEvidence(file, { mode: "log", kind: t.clubName ? `${t.clubName} ${RECORD_LABEL[area]}` : RECORD_LABEL[area], people: peopleAround(t.student, await repo.listStudents()) });
  await repo.audit(v.accountId, "record.ai_piece_file", `${area} ${t.student.pseudonymId}`);
  return r;
}

// ---------- 합치기 · 맞추기 · 역량 보기 (Figma N11) ----------

const MergeSchema = z.object({
  pieces: z.array(z.object({ id: z.string(), source: z.enum(PIECE_SOURCES), date: z.string().nullable(), text: z.string().max(6000), weight: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() })).min(1, "합칠 조각을 골라 주세요").max(80),
  unit: z.enum(["bytes", "chars"]),
  max: z.number().int().min(1),
  /** 메모 모아 쓰기 (N41): 교사가 정한 순서 그대로 */
  keepOrder: z.boolean().optional(),
  /** 분량 게이트 오차 (N49) — 목표(max) ± tol */
  tol: z.number().int().min(0).max(300).optional(),
  /** 지금 글에 더하기 (N49b): 지금 글(id "body")은 그대로 두고 고른 메모로 이어 쓴다 */
  append: z.boolean().optional(),
  /** 내 스타일 (N58): 이 교사의 창체 · 행발 프롬프트 · 레퍼런스를 붙인다 */
  style: z.boolean().optional(),
});
/** 더하기면 지금 글 (없으면 새로 쓰기) */
const keepText = (d: { append?: boolean; pieces: { id: string; text: string }[] }) => (d.append ? d.pieces.find((x) => x.id === "body")?.text.trim() || undefined : undefined);
const FitSchema = z.object({ text: z.string().min(1, "본문이 비어 있어요").max(6000), unit: z.enum(["bytes", "chars"]), max: z.number().int().min(1), tol: z.number().int().min(0).max(300).optional() });
/** 수정 요청 (N49): 교사가 AI 글에 보낸 한두 줄 */
const ReviseSchema = FitSchema.extend({ request: z.string().trim().min(1, "고칠 점을 적어 주세요").max(300, "요청은 300자까지예요") });
const recordGate = (area: RecordArea, d: { unit: "bytes" | "chars"; max: number; tol?: number }) => gateBand({ unit: d.unit, target: d.max, tol: d.tol, limit: recordMax(area, d.unit) });
/** N41: 화면 자동 검사와 같은 "근거보다 높은 평가" 행을 같이 고친다 (창체·행발은 성취수준이 없다 → null) */
const FixSchema = FitSchema.extend({ praise: z.object({ evidence: z.string().max(40000) }).optional() });
const toDraft = (r: { text: string; sample: boolean; notice?: string; gate?: GateResult }): AiDraftResult =>
  r.text ? { ok: true, text: r.text, sample: r.sample, notice: r.notice, gate: r.gate } : { ok: false, error: r.notice ?? "만들지 못했어요. 직접 고쳐 주세요" };

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
    listMemosWithPieces(t.area, [input.studentId]),
    programArea ? repo.listDraftsForStudents([input.studentId]) : Promise.resolve([]),
  ]);
  return [...programPieces(drafts.filter((d) => d.area === programArea)), ...logPieces(logs, t.v.accountId), ...memoPieces(memos, t.v.accountId)];
}

/**
 * 조각 칸 (Figma N19): 지금 본 것을 바로 한 조각으로 남긴다 (추가만, C4).
 * 자율·자치·동아리·진로는 누가기록으로 쌓고(누가기록 화면에도 보인다), 행발은 조각 메모로 쌓는다.
 */
export async function addRecordPiece(input: { area: string; studentId: string; clubId?: string | null; text: string; activity: string; kind?: PieceKind }): Promise<{ error?: string }> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { error: t.error };
  // 보관함에서 넣은 조각(N35)은 활동명 없이 문장 그대로, 누가기록은 만들지 않고 조각으로만 남긴다
  const lib = input.kind === "library";
  if (!lib && !cleanActivity(input.activity)) return { error: "활동명을 적어 주세요" };
  const text = lib ? scrubIdentity(String(input.text ?? ""), t.student).text : withActivity(input.activity, String(input.text ?? ""));
  if (text.length < PIECE_MIN || text.length > PIECE_MAX) return { error: `조각은 ${PIECE_MIN}~${PIECE_MAX.toLocaleString()}자로 써 주세요` };
  if (t.area === "행발" || lib) {
    await repo.addRecordMemo({ scope: pieceScopeOf(t.area, input.kind === "file" ? "file" : lib ? "library" : "memo"), studentId: t.student.id, authorId: t.v.accountId, content: text });
  } else {
    if (t.area === "동아리" && !input.clubId) return { error: "동아리를 골라 주세요" };
    await repo.addActivityLogs([{ area: t.area, studentId: t.student.id, authorId: t.v.accountId, clubId: t.area === "동아리" ? input.clubId! : null, date: seoulNow().date, content: text }]);
    revalidatePath("/teacher/logs");
  }
  await repo.audit(t.v.accountId, "record.piece", `${t.area} ${t.student.pseudonymId}`);
  revalidatePath("/teacher/pieces");
  return {};
}

export async function mergeRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof MergeSchema>): Promise<AiDraftResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = MergeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max }));
  // 차시 메모(N43)가 있으면 그 차시 활동 내용을 배경으로 (학생 행동 아님)
  const lessonLogs = t.area !== "행발" && p.data.pieces.some((x) => x.source === "차시") ? await evidenceLogs(t.area, [t.student.id], input.clubId) : [];
  const background = await lessonBackgroundFor(lessonLogs.map((l) => l.lessonItemId), p.data.pieces.filter((x) => x.source === "차시").map((x) => x.text), t.student);
  const tone = p.data.style ? styleTone(await repo.getWritingStyle(t.v.accountId, styleAreaOf(t.area))) : undefined;
  const r = await mergeRecord({ kind: t.area, context: t.clubName, student: t.student, pieces: p.data.pieces, range, tone, level: null, keepOrder: p.data.keepOrder, background, gate: recordGate(t.area, p.data), limit: recordMax(t.area, p.data.unit), keep: keepText(p.data) });
  await repo.audit(t.v.accountId, "record.ai_merge", `${t.area} ${t.student.pseudonymId} ${p.data.pieces.length}조각`);
  const d = toDraft(r);
  if (!d.ok) return d;
  // AI 원안 (N38): 근거 표는 서버가 다시 읽은 조각 (지금 본문 조각은 교사 글)
  const o = await saveOriginal({ kind: "record", studentId: t.student.id, scope: t.area, text: r.text, aiSentences: r.sentences, pool: await recordPool(t.area, t.student.id, input.clubId), model: r.sample ? "sample" : "write", ownKeys: ["body"] });
  return o ? { ...d, ...o } : d;
}

/** 근거 표 (N38): 합칠 조각과 같은 묶음 + 행발 에피소드 메모 */
async function recordPool(area: RecordArea, studentId: string, clubId?: string | null): Promise<SourceItem[]> {
  const pool = piecesPool(await listRecordPieces({ area, studentId, clubId }));
  if (area === "행발") {
    const pick = (await repo.listBehaviorPicks([studentId], schoolYear()).catch(() => []))[0];
    if (pick?.memo.trim()) pool.push({ type: "piece", ref: "pick", key: sourceKey({ type: "piece", ref: "pick" }), kind: "조각", where: "에피소드 메모", chip: "조각 · 에피소드 메모", text: pick.memo });
  }
  return pool;
}
export { recordPool as recordSourcePool };

export async function fitRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof FitSchema>): Promise<AiDraftResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = FitSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max }));
  const evidence = (await recordPool(t.area, t.student.id, input.clubId)).map((x) => x.text);
  const r = await fitRecord({ kind: t.area, context: t.clubName, student: t.student, text: p.data.text, range, gate: recordGate(t.area, p.data), limit: recordMax(t.area, p.data.unit), evidence: [p.data.text, ...evidence] });
  await repo.audit(t.v.accountId, "record.ai_fit", `${t.area} ${t.student.pseudonymId}`);
  return toDraft(r);
}

/** 수정 요청 (N49): AI 글을 교사 요청대로 다시 쓴 제안 → 분량 게이트 (저장하지 않음) */
export async function reviseRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof ReviseSchema>): Promise<AiDraftResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = ReviseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const evidence = (await recordPool(t.area, t.student.id, input.clubId)).map((x) => x.text);
  const r = await reviseRecord({ kind: t.area, context: t.clubName, student: t.student, text: p.data.text, request: p.data.request, evidence, gate: recordGate(t.area, p.data), limit: recordMax(t.area, p.data.unit) });
  await repo.audit(t.v.accountId, "record.ai_revise", `${t.area} ${t.student.pseudonymId}`);
  return toDraft(r);
}

// ---------- AI로 고치기 · 다른 버전 · 순화 (Figma N34) ----------

const VarSchema = FitSchema.extend({ mode: z.enum(["keep", "fresh"]) });

/** AI로 고치기: 자동 검사에 걸린 곳만 고친 글 (저장하지 않음) */
export async function aiFixRecordAction(input: { area: string; studentId: string; clubId?: string | null; batch?: boolean } & z.input<typeof FixSchema>): Promise<AiFixResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = FixSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max });
  const r = await fixRecord({ kind: t.area, context: t.clubName, student: t.student, text: p.data.text, range, praise: p.data.praise ? { level: null, evidence: p.data.praise.evidence } : undefined });
  await repo.audit(t.v.accountId, "record.ai_fix", `${t.area} ${t.student.pseudonymId}${input.batch ? " class" : ""}`);
  return { ok: true, text: r.text, changes: r.changes, label: r.label, bytes: measure(r.text, range.unit), notice: r.notice };
}

/** 다른 버전 3개 (저장하지 않음) */
export async function variantsRecordAction(input: { area: string; studentId: string; clubId?: string | null } & z.input<typeof VarSchema>): Promise<VariantsActionResult> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const p = VarSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const range = fitRange(resolveRecordLength(t.area, { unit: p.data.unit, max: p.data.max }));
  const r = await variantsRecord({ kind: t.area, context: t.clubName, student: t.student, text: p.data.text, mode: p.data.mode, range });
  await repo.audit(t.v.accountId, "record.ai_variants", `${t.area} ${t.student.pseudonymId} ${p.data.mode}`);
  if (!r.versions.length) return { ok: false, error: r.notice ?? "버전을 만들지 못했어요. 다시 만들어 주세요" };
  return { ok: true, ...r };
}

/** 순화하기 (① 조각 추가 메모): 이름·학번을 지운 뒤 보낸다. 저장하지 않음 ("조각으로 넣기"는 addRecordPiece) */
export async function softenRecordMemo(input: { area: string; studentId: string; clubId?: string | null; text: string }): Promise<{ ok: true; text: string; label: "AI" } | { ok: false; error: string }> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { ok: false, error: t.error };
  const text = String(input.text ?? "").trim();
  if (text.length < 2) return { ok: false, error: "메모를 먼저 적어 주세요" };
  if (text.length > PIECE_MAX) return { ok: false, error: `${PIECE_MAX.toLocaleString()}자까지 순화할 수 있어요` };
  const r = await softenMemo(scrubIdentity(text, t.student).text, RECORD_LABEL[t.area]);
  if (!r) return { ok: false, error: "AI가 꺼져 있어 순화할 수 없어요. 직접 고쳐 주세요" };
  if (r.error || !r.data) return { ok: false, error: r.error ?? "순화하지 못했어요. 직접 고쳐 주세요" };
  await repo.audit(t.v.accountId, "record.ai_soften", `${t.area} ${t.student.pseudonymId}`);
  return { ok: true, text: r.data, label: "AI" };
}

export async function tagRecord(input: { area: string; studentId: string; clubId?: string | null; text: string; force?: boolean }): Promise<{ tags: TaggedSentence[]; label: "AI" | "자동"; savedAt?: string; cached?: boolean } | { error: string }> {
  const t = await recordTarget(input.area, input.studentId, input.clubId);
  if ("error" in t) return { error: t.error };
  return tagCompetency(String(input.text ?? "").slice(0, 6000), t.student, { force: !!input.force });
}

// ---------- 반 전체 검사 (Figma N35 ①) ----------

/** 반 전체 검사: 담임 반(자율·자치·진로·행발) 또는 내 동아리 부원들의 최신 기록을 규칙으로만 (AI 없음). 확정 기록은 locked */
export async function classCheckRecords(input: { area: string; clubId?: string | null }): Promise<ClassCheckView> {
  const v = await requireCan("record.write");
  const area = String(input?.area ?? "");
  if (!isRecordArea(area)) return { ok: false, error: "영역을 골라 주세요" };
  const all = await repo.listStudents();
  let students: Student[] = [];
  let base = "";
  if (area === "동아리") {
    const club = input.clubId ? await repo.getClub(input.clubId) : null;
    if (!club || club.advisorId !== v.accountId) return { ok: false, error: "내 동아리만 검사할 수 있어요" };
    const ids = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => ids.has(s.id)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
    base = `/teacher/club/compose?club=${club.id}&`;
  } else {
    students = homeroomStudents(v, all);
    base = `/homeroom/compose?tab=${area === "행발" ? "behavior" : area === "진로" ? "career" : "autonomy"}&`;
  }
  if (!students.length) return { ok: false, error: area === "동아리" ? "부원이 없어요" : "우리 반 학생만 검사할 수 있어요" };
  // 학생마다 쓸 수 있는지 한 번 더 (canWriteRecord)
  const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year: schoolYear(), studentIds: students.map((s) => s.id) }));
  // N38: 근거 없는 문장 · 수정 비율 (AI 원안이 있는 학생만)
  const [originals, settings] = await Promise.all([repo.listAiOriginals([...latest.values()].map((r) => r.aiOriginalId ?? "").filter(Boolean)), repo.getProvenanceSettings()]);
  const origOf = new Map(originals.map((o) => [o.id, o]));
  const view = buildClassView(students.map((s) => {
    const r = latest.get(s.id);
    const text = r?.content ?? "";
    return {
      id: s.id, student: s, text, locked: r?.status === "confirmed",
      ...classProv(r?.aiOriginalId ? origOf.get(r.aiOriginalId) : undefined, r, text, settings),
      range: resolveRecordLength(area, { unit: r?.unit ?? "bytes", max: r?.max }),
      href: `${base}student=${s.id}&check=1`,
    };
  }));
  await repo.audit(v.accountId, "record.class_check", classAudit(area, view));
  return view;
}

// ---------- 반 전체 글 쓰기 (Figma N42 ①) ----------

const ClassWriteSchema = z.object({
  area: z.string(),
  clubId: z.string().nullish(),
  studentId: z.string().min(1),
  runId: z.string().uuid(),
  target: z.number().int().min(100).max(5000),
  rewrite: z.boolean(),
});

/**
 * 반 전체 글 쓰기 (담임 반 자율·자치 · 진로 · 행발 / 동아리): 학생 한 명 = 요청 하나.
 * 창체는 N41 메모 모아 쓰기와 같은 길(누가기록 · 메모 · 받은 특색 활동 모두, 보통 중요도, 과장 막기).
 * 행발은 N35 키워드·에피소드 메모가 있으면 키워드 초안, 없으면 활동 메모로. 임시 저장 + AI 원안 — 확정하지 않는다.
 */
export async function classWriteRecord(input: z.input<typeof ClassWriteSchema>): Promise<WriteOutcome> {
  const p = ClassWriteSchema.safeParse(input);
  if (!p.success) return { status: "failed", error: "입력을 확인해 주세요" };
  const { studentId, runId, target, rewrite } = p.data;
  const clubId = p.data.clubId ?? null;
  const t = await recordTarget(p.data.area, studentId, clubId);
  if ("error" in t) return { status: "failed", error: t.error };
  const area = t.area;
  return runClassWrite({
    lockScope: `record:${area}${clubId ? `:${clubId}` : ""}`, studentId, runId,
    write: async (): Promise<WriteOutcome> => {
      const year = schoolYear();
      const cur = latestRecordByStudent(await repo.listRecordDrafts({ area, year, studentIds: [studentId] })).get(studentId);
      if (cur?.status === "confirmed") return { status: "locked" };
      const range = fitRange(resolveRecordLength(area, { unit: "bytes", max: target }));
      const pick = area === "행발" ? (await repo.listBehaviorPicks([studentId], year).catch(() => []))[0] : undefined;
      const usePick = !!pick && (pick.keywords.length > 0 || !!pick.memo.trim());
      let r: Awaited<ReturnType<typeof mergeRecord>>;
      let kind: "record" | "behavior_keyword" = "record";
      if (usePick && pick) {
        const raw = pick.useLogs ? await evidenceLogs("행발", [studentId]) : [];
        if (!pick.memo.trim() && !raw.length) return { status: "skipped", reason: "no_memo" };
        if (cur?.content.trim() && !rewrite) return { status: "skipped", reason: "has_text" };
        const logs = raw.map((l) => ({ date: l.date, content: l.content, key: pieceKey({ id: `log-${l.id}`, source: l.commonActivityId ? "공통 활동" : "누가기록" }) }));
        r = await behaviorDraft({ student: t.student, keywords: pick.keywords, memo: pick.memo, logs, range, memoKey: sourceKey({ type: "piece", ref: "pick" }) });
        kind = "behavior_keyword";
        await repo.audit(t.v.accountId, "record.ai_behavior", `행발 ${t.student.pseudonymId} 키워드 ${pick.keywords.length} class`);
      } else {
        const pieces = await listRecordPieces({ area, studentId, clubId });
        if (!pieces.length) return { status: "skipped", reason: "no_memo" };
        if (cur?.content.trim() && !rewrite) return { status: "skipped", reason: "has_text" };
        r = await mergeRecord({ kind: area, context: t.clubName, student: t.student, pieces, range, level: null });
        await repo.audit(t.v.accountId, "record.ai_merge", `${area} ${t.student.pseudonymId} ${pieces.length}조각 class`);
      }
      const fail = aiFailed(r, aiEnabled());
      if (fail) return fail;
      const o = await saveOriginal({ kind, studentId, scope: area, text: r.text, aiSentences: r.sentences, pool: await recordPool(area, studentId, clubId), model: r.sample ? "sample" : "write" });
      const pv = await provForSave({ aiOriginalId: o?.original.id ?? null, pins: [], content: r.text, studentId, confirm: false, reason: "" });
      const max = RECORD_MAX_BYTES[area];
      const rec = await repo.addRecordDraft({ area, studentId, authorId: t.v.accountId, year, semester: null, content: r.text, unit: "bytes", max, status: "draft", ...pv.prov });
      await repo.audit(t.v.accountId, "record.save", `${area} ${t.student.pseudonymId} class`);
      return { status: "done", bytes: measure(r.text, "bytes"), max, versionId: rec.id, sample: r.sample };
    },
  });
}
