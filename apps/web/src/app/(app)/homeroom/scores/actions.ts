"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { classScope } from "@/components/scores/scope";
import {
  checkScoreRows, colLetter, matchScoreHeaders, SCORE_FIELD_LABEL, SCORE_FIELDS, summarizeScoreRows, validColumnMap, withRosterNames,
  type CheckedScoreRow, type ColumnMap, type NumberedScoreRow, type ScoreField,
} from "@/lib/domain/scores";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";
import { readScorePicture } from "@/lib/server/ai/homeroom-ai";
import { repo } from "@/lib/server/repo";
import { buildTable, readScoreSheet, SCORE_MAX_BYTES } from "@/lib/server/scores-excel";
import { requireCan } from "@/lib/server/viewer";

export type UploadState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  /** 열을 다 못 맞춤 → 교사가 고르거나 AI 제안 */
  | { kind: "mapping"; fileName: string; headers: string[]; map: ColumnMap; missing: ScoreField[] }
  | {
      kind: "preview";
      fileName: string;
      headers: string[];
      map: ColumnMap;
      renamed: { from: string; to: ScoreField }[];
      rows: CheckedScoreRow[];
      summary: ReturnType<typeof summarizeScoreRows>;
      /** 사진·PDF 를 AI 가 읽은 번호·등급 행. 반영할 때 그대로 다시 보내 서버가 다시 검사한다 */
      picture?: NumberedScoreRow[];
    }
  | { kind: "done"; count: number; examName: string };

const XLSX_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ""];
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const PICTURE_MAX_BYTES = 8 * 1024 * 1024;
const G = z.string().trim().max(6);
const NumberedRows = z.array(z.object({ number: G, ko: G, ma: G, en: G, hi: G, t1: G, t2: G })).min(1).max(80);
const IDENTITY_MAP = Object.fromEntries(SCORE_FIELDS.map((f, i) => [f, i])) as ColumnMap;

function parseMap(raw: FormDataEntryValue | null): ColumnMap | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(String(raw));
    const out: ColumnMap = {};
    for (const f of SCORE_FIELDS) if (Number.isInteger(o?.[f])) out[f] = o[f];
    return out;
  } catch {
    return null;
  }
}

/** 파일 읽기 + 열 맞추기 + 행 검사. 반영할 때도 같은 함수로 다시 검사한다 (클라이언트 값을 믿지 않음) */
async function inspect(form: FormData, readPicture = false): Promise<Exclude<UploadState, { kind: "idle" } | { kind: "done" }> & { classKey?: string }> {
  const v = await requireCan("scores.upload");
  const scope = await classScope(v, String(form.get("class") ?? ""));
  if (!scope) return { kind: "error", message: "담임 반이 없어요" };
  const roster = scope.students.map((s) => ({ id: s.id, number: s.number, name: s.name }));
  // 사진 행: 이름은 언제나 서버가 번호로 명단에서 붙인다 (클라이언트·AI 의 이름을 받지 않음)
  const numbered = (picture: NumberedScoreRow[], fileName: string) => {
    const rows = checkScoreRows(withRosterNames(picture, roster), roster);
    return {
      kind: "preview" as const, fileName, headers: SCORE_FIELDS.map((f) => SCORE_FIELD_LABEL[f]), map: IDENTITY_MAP, renamed: [],
      rows, summary: summarizeScoreRows(rows, roster.length), picture, classKey: scope.key,
    };
  };
  const rawsJson = form.get("raws");
  if (rawsJson) {
    const parsed = NumberedRows.safeParse((() => { try { return JSON.parse(String(rawsJson)); } catch { return null; } })());
    if (!parsed.success) return { kind: "error", message: "읽은 성적을 다시 확인해 주세요" };
    return numbered(parsed.data, String(form.get("fileName") ?? "성적표 사진").slice(0, 80));
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind: "error", message: "엑셀 파일을 골라 주세요" };
  if (PICTURE_TYPES.includes(file.type)) {
    if (!readPicture) return { kind: "error", message: "사진은 먼저 읽기부터 해 주세요" };
    if (!aiEnabled()) return { kind: "error", message: "AI가 꺼져 있어 사진은 읽을 수 없어요. 양식 엑셀로 올려 주세요" };
    if (file.size > PICTURE_MAX_BYTES) return { kind: "error", message: "사진·PDF는 8MB까지 올릴 수 있어요" };
    const r = await readScorePicture(new Uint8Array(await file.arrayBuffer()), file.type);
    if (!r.ok) return { kind: "error", message: `${r.error} · 양식 엑셀로 올려도 돼요` };
    if (!r.data.length) return { kind: "error", message: "AI가 성적표에서 행을 찾지 못했어요. 양식 엑셀로 올려 주세요" };
    await repo.audit(v.accountId, "scores.ai.picture", `${scope.key} ${r.data.length}행`);
    return numbered(r.data.slice(0, 80), file.name);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx") || !XLSX_TYPES.includes(file.type)) return { kind: "error", message: "xlsx 또는 성적표 사진(png·jpg)·PDF만 올릴 수 있어요" };
  if (file.size > SCORE_MAX_BYTES) return { kind: "error", message: "2MB까지 올릴 수 있어요" };

  let sheet: { headers: string[]; rows: string[][] };
  try {
    sheet = await readScoreSheet(await file.arrayBuffer());
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "파일을 읽지 못했어요" };
  }
  if (!sheet.rows.length) return { kind: "error", message: "성적 행이 없어요" };

  const auto = matchScoreHeaders(sheet.headers);
  const given = parseMap(form.get("map"));
  const map = given ?? auto.map;
  const problem = validColumnMap(map, sheet.headers.length);
  if (problem) {
    return { kind: "mapping", fileName: file.name, headers: sheet.headers, map, missing: SCORE_FIELDS.filter((f) => map[f] === undefined) };
  }
  const raws = sheet.rows.map((cells) => Object.fromEntries(SCORE_FIELDS.map((f) => [f, cells[map[f]!] ?? ""])) as Record<ScoreField, string>);
  const rows = checkScoreRows(raws, roster);
  const renamed = given
    ? SCORE_FIELDS.filter((f) => sheet.headers[map[f]!] !== SCORE_FIELD_LABEL[f]).map((f) => ({ from: sheet.headers[map[f]!] || `${colLetter(map[f]!)}열`, to: f }))
    : auto.renamed;
  return { kind: "preview", fileName: file.name, headers: sheet.headers, map, renamed, rows, summary: summarizeScoreRows(rows, roster.length), classKey: scope.key };
}

/** 1단계: 올린 파일 검사 (저장 안 함). 사진·PDF 면 AI 가 번호·등급만 읽는다 */
export async function previewScores(_: UploadState, form: FormData): Promise<UploadState> {
  const r = await inspect(form, true);
  if (r.kind === "preview") delete r.classKey;
  return r;
}

/** 2단계: 반영. 번호·이름이 하나라도 안 맞으면 전체 취소 (PRD F5-2) */
export async function commitScores(_: UploadState, form: FormData): Promise<UploadState> {
  const v = await requireCan("scores.upload");
  const examId = String(form.get("examId") ?? "");
  const exam = (await repo.listExams()).find((e) => e.id === examId);
  if (!exam) return { kind: "error", message: "시험을 골라 주세요" };
  const r = await inspect(form);
  if (r.kind !== "preview") return r.kind === "mapping" ? { kind: "error", message: "열을 먼저 맞춰 주세요" } : r;
  if (r.summary.blocked) return { kind: "error", message: "번호·이름이 명단과 다른 행이 있어서 하나도 반영하지 않았어요" };
  const rows = r.rows.filter((x) => (x.status === "정상" || x.status === "빈 칸") && x.studentId).map((x) => ({ studentId: x.studentId!, grades: x.grades }));
  if (!rows.length) return { kind: "error", message: "반영할 행이 없어요" };
  try {
    const n = await repo.addMockScores(exam.id, rows, v.accountId);
    await repo.audit(v.accountId, "scores.upload", `${r.classKey} ${exam.name} ${n}명`);
    revalidatePath("/homeroom/scores");
    revalidatePath("/homeroom/minimum");
    return { kind: "done", count: n, examName: exam.name };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "반영하지 못했어요" };
  }
}

export type ExamState = { error?: string; createdId?: string };
/** 시험 추가 (같은 연도·월이 있으면 그 시험) */
export async function addExam(_: ExamState, form: FormData): Promise<ExamState> {
  await requireCan("scores.upload");
  const p = z.object({ year: z.coerce.number().int().min(2020).max(2100), month: z.coerce.number().int().min(1).max(12) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "연도와 월을 확인해 주세요" };
  const e = await repo.createExam(p.data);
  revalidatePath("/homeroom/scores");
  return { createdId: e.id };
}

// ---------------------------------------------------------------- AI 열 맞추기

const AiMap = z.object({
  columns: z.array(z.object({ field: z.enum(SCORE_FIELDS), column: z.number().int().nullable() })),
});

/** 엑셀 1행 제목만 AI 에 보내 열 매칭을 제안받는다. 학생 이름·성적 값은 보내지 않는다 */
export async function suggestColumns(headers: string[]): Promise<{ ok: true; map: ColumnMap } | { ok: false; error: string }> {
  const v = await requireCan("scores.upload");
  const list = headers.slice(0, 40).map((h, i) => `${colLetter(i)}열(index ${i}): ${String(h).slice(0, 40)}`).join("\n");
  const res = await aiJson(AiMap, {
    model: "fast",
    system:
      "고등학교 모의고사 성적 엑셀의 1행 제목만 보고, 각 항목이 어느 열인지 맞춘다. 항목: number=번호, name=이름, ko=국어 등급, ma=수학 등급, en=영어 등급, hi=한국사 등급, t1=탐구1(통합사회) 등급, t2=탐구2(통합과학) 등급. 원점수·표준점수·백분위 열이 아니라 등급 열을 고른다. 맞는 열이 없으면 column=null. 같은 열을 두 번 쓰지 않는다.",
    content: `엑셀 1행 제목:\n${list}`,
  });
  if (!res.ok) return res;
  await repo.audit(v.accountId, "scores.ai.columns", `${headers.length}열`);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const c of res.data.columns) {
    if (c.column === null || c.column < 0 || c.column >= headers.length || used.has(c.column)) continue;
    map[c.field] = c.column;
    used.add(c.column);
  }
  return { ok: true, map };
}

// ---------------------------------------------------------------- 오류 행만 내려받기

/** 확인이 필요한 행만 엑셀로. 학생이 올린 원래 값 그대로 + 사유 */
export async function errorRowsFile(form: FormData): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  const r = await inspect(form);
  if (r.kind !== "preview") return { ok: false, error: r.kind === "error" ? r.message : "열을 먼저 맞춰 주세요" };
  const bad = r.rows.filter((x) => x.status !== "정상");
  if (!bad.length) return { ok: false, error: "확인할 행이 없어요" };
  const data = await buildTable(
    "확인 필요",
    [...SCORE_FIELDS.map((f) => SCORE_FIELD_LABEL[f]), "상태", "사유"],
    bad.map((x) => [...SCORE_FIELDS.map((f) => x.raw[f]), x.status, x.problems.join(" · ")]),
    [8, 10, 7, 7, 7, 8, 8, 8, 12, 40],
  );
  return { ok: true, base64: Buffer.from(data).toString("base64") };
}
