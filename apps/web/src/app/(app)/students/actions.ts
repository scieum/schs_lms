"use server";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkOne, checkRows, FIELD_LABEL, nextPseudonymIds, summarize, type CheckedRow, type Field } from "@/lib/domain/roster";
import { cleanHeaderMap, parseStudentQuery, type StudentFilter } from "@/lib/domain/teacher-assist";
import { mapRosterHeaders, parseStudentSearch } from "@/lib/server/ai/teacher-ai";
import { env } from "@/lib/server/env";
import { MAX_UPLOAD_BYTES, parseRoster } from "@/lib/server/excel";
import { repo, type NewStudent } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type PreviewState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | {
      /** 양식과 열 이름이 달라 열을 맞춰야 한다 (AI 또는 규칙 제안 → 교사 확인) */
      kind: "mapping";
      fileName: string;
      headers: string[];
      map: Partial<Record<Field, number>>;
      label: "AI" | "자동";
      notice?: string;
    }
  | {
      kind: "preview";
      fileName: string;
      renamed: { from: string; to: string }[];
      rows: CheckedRow[];
      summary: ReturnType<typeof summarize>;
    }
  | { kind: "done"; count: number; firstId: string; lastId: string };

const XLSX_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ""];

function headerText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    return "";
  }
  return String(v).trim();
}

/** 1행(열 제목)만 읽는다 */
async function readHeaderRow(buf: ArrayBuffer): Promise<{ wb: ExcelJS.Workbook; headers: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾지 못했어요");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col - 1] = headerText(c.value)));
  return { wb, headers: Array.from(headers, (h) => h ?? "") };
}

/** 확인한 열 맞춤대로 1행 제목을 양식 이름으로 바꾼 파일을 만든다 (나머지 열은 겹치지 않게 비운다) */
async function applyHeaderMap(buf: ArrayBuffer, map: Partial<Record<Field, number>>): Promise<{ buf: ArrayBuffer; renamed: { from: string; to: string }[] }> {
  const { wb, headers } = await readHeaderRow(buf);
  const row = wb.worksheets[0].getRow(1);
  const byCol = new Map(Object.entries(map).map(([f, i]) => [i as number, f as Field]));
  const renamed: { from: string; to: string }[] = [];
  const width = Math.max(headers.length, ...[...byCol.keys()].map((i) => i + 1));
  for (let i = 0; i < width; i++) {
    const f = byCol.get(i);
    row.getCell(i + 1).value = f ? FIELD_LABEL[f] : `-${i + 1}`;
    if (f && headers[i] && headers[i] !== FIELD_LABEL[f]) renamed.push({ from: headers[i], to: FIELD_LABEL[f] });
  }
  return { buf: (await wb.xlsx.writeBuffer()) as ArrayBuffer, renamed };
}

const MapSchema = z.partialRecord(z.enum(["grade", "classNo", "number", "name", "gender", "track"]), z.number().int().min(0).max(200));

/** 1단계: 엑셀을 읽어 검사만 한다 (아직 저장 안 함). 열 이름이 다르면 열 맞추기 제안부터 */
export async function previewRoster(_: PreviewState, form: FormData): Promise<PreviewState> {
  const v = await requireCan("student.register");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind: "error", message: "엑셀 파일을 골라 주세요" };
  if (!file.name.toLowerCase().endsWith(".xlsx") || !XLSX_TYPES.includes(file.type)) {
    return { kind: "error", message: "xlsx 파일만 올릴 수 있어요. 양식을 받아서 써 주세요" };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { kind: "error", message: "2MB까지 올릴 수 있어요" };

  try {
    let buf = await file.arrayBuffer();
    let extra: { from: string; to: string }[] = [];
    const rawMap = form.get("map");
    if (typeof rawMap === "string" && rawMap) {
      // 교사가 확인한 열 맞춤 적용
      const parsed = MapSchema.safeParse(JSON.parse(rawMap));
      if (!parsed.success) return { kind: "error", message: "열 맞춤을 읽지 못했어요. 다시 올려 주세요" };
      const applied = await applyHeaderMap(buf, cleanHeaderMap(parsed.data, 200));
      buf = applied.buf;
      extra = applied.renamed;
    }
    const { header, rows } = await parseRoster(buf);
    if (header.missing.length) {
      if (extra.length || rawMap) {
        return { kind: "error", message: `아직 맞추지 않은 열이 있어요: ${header.missing.map((f) => FIELD_LABEL[f]).join(", ")}` };
      }
      // 1행(열 제목)만 AI에 보낸다. 학생 행은 보내지 않는다
      const { headers } = await readHeaderRow(await file.arrayBuffer());
      const m = await mapRosterHeaders(headers.slice(0, 40));
      if (m.label === "AI") await repo.audit(v.accountId, "student.ai.columns", `${headers.length}열`);
      return {
        kind: "mapping", fileName: file.name, headers: headers.slice(0, 40), map: m.data, label: m.label,
        notice: m.error ? `AI 대신 열 이름으로 맞췄어요 (${m.error})` : undefined,
      };
    }
    if (!rows.length) return { kind: "error", message: "학생 행이 없어요" };
    const checked = checkRows(rows, await repo.existingStudentNos());
    return { kind: "preview", fileName: file.name, renamed: extra.length ? extra : header.renamed, rows: checked, summary: summarize(checked) };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "파일을 읽지 못했어요" };
  }
}

async function insert(raws: Record<Field, string>[], actorId: string) {
  // 클라이언트가 보낸 값은 믿지 않고 서버에서 다시 검사한다
  const checked = checkRows(raws, await repo.existingStudentNos()).filter((r) => r.status === "new");
  if (!checked.length) return null;
  const ids = nextPseudonymIds(await repo.existingPseudonymIds(), checked.length);
  const hash = await bcrypt.hash(env.initialAuthCode, 10); // 첫 비밀번호 = 공통 인증코드 (F1)
  const rows: NewStudent[] = checked.map((r, i) => ({
    pseudonymId: ids[i],
    studentNo: r.studentNo!,
    grade: r.input.grade!,
    classNo: r.input.classNo!,
    number: r.input.number!,
    name: r.input.name!,
    gender: r.input.gender!,
    track: r.input.track!,
    passwordHash: hash,
  }));
  const created = await repo.createStudents(rows);
  // 감사 로그에는 이름·학번 대신 가명ID만 남긴다
  await repo.audit(actorId, "student.register", `${created.length}명 ${ids[0]}–${ids[ids.length - 1]}`);
  revalidatePath("/students");
  return { count: created.length, firstId: ids[0], lastId: ids[ids.length - 1] };
}

/** 2단계: 미리보기에서 '새 학생'만 등록 */
export async function registerRoster(_: PreviewState, form: FormData): Promise<PreviewState> {
  const v = await requireCan("student.register");
  let raws: Record<Field, string>[];
  try {
    raws = JSON.parse(String(form.get("rows") ?? "[]"));
    if (!Array.isArray(raws) || raws.length > 600) throw new Error();
  } catch {
    return { kind: "error", message: "등록할 학생 정보를 읽지 못했어요. 다시 올려 주세요" };
  }
  try {
    const r = await insert(raws, v.accountId);
    if (!r) return { kind: "error", message: "새로 등록할 학생이 없어요" };
    return { kind: "done", ...r };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "등록하지 못했어요" };
  }
}

type Added = { name: string; meta: string; id: string };
export type OneState = { error?: string; problems?: string[]; history: Added[] };

/** 한 명씩 추가 */
export async function registerOne(prev: OneState, form: FormData): Promise<OneState> {
  const res = await registerOneInner(form);
  const history = res.added ? [res.added, ...prev.history] : prev.history;
  return { error: res.error, problems: res.problems, history };
}

async function registerOneInner(form: FormData): Promise<{ error?: string; problems?: string[]; added?: Added }> {
  const v = await requireCan("student.register");
  const raw: Record<Field, string> = {
    grade: String(form.get("grade") ?? ""),
    classNo: String(form.get("classNo") ?? ""),
    number: String(form.get("number") ?? ""),
    name: String(form.get("name") ?? ""),
    gender: String(form.get("gender") ?? ""),
    track: String(form.get("track") ?? ""),
  };
  const { problems } = checkOne(raw);
  if (problems.length) return { problems };
  const existing = await repo.existingStudentNos();
  const [row] = checkRows([raw], existing);
  if (row.status === "duplicate") return { error: `이미 등록된 학생이에요 (학번 ${row.studentNo})` };
  try {
    const r = await insert([raw], v.accountId);
    if (!r) return { error: "추가하지 못했어요" };
    return { added: { name: row.input.name!, meta: `${row.input.grade}학년 ${row.input.classNo}반 ${row.input.number}번 · 학번 ${row.studentNo}`, id: r.firstId } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "추가하지 못했어요" };
  }
}

export type SearchResult = { filter: StudentFilter; label: "AI" | "자동"; notice?: string };

/** 학생 목록 말로 찾기: 검색어 → 필터. 이름이 들어 있으면 AI에 보내지 않고 규칙만 쓴다 */
export async function studentSearchFilter(q: string): Promise<SearchResult> {
  const v = await requireCan("student.list");
  const query = String(q ?? "").trim().slice(0, 100);
  const rule = parseStudentQuery(query);
  if (!query) return { filter: {}, label: "자동" };
  const names = (await repo.listStudents()).map((s) => s.name).filter((n) => n.length >= 2);
  if (rule.filter.name || names.some((n) => query.includes(n))) {
    return { filter: rule.filter, label: "자동", notice: "이름이 들어 있어 AI 없이 찾았어요" };
  }
  const r = await parseStudentSearch(query);
  if (r.label === "AI") await repo.audit(v.accountId, "student.ai.search", null);
  return { filter: r.data, label: r.label, notice: r.error ? `AI 대신 규칙으로 찾았어요 (${r.error})` : undefined };
}
