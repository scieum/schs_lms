"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { checkOne, checkRows, FIELD_LABEL, nextPseudonymIds, summarize, type CheckedRow, type Field } from "@/lib/domain/roster";
import { env } from "@/lib/server/env";
import { MAX_UPLOAD_BYTES, parseRoster } from "@/lib/server/excel";
import { repo, type NewStudent } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type PreviewState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | {
      kind: "preview";
      fileName: string;
      renamed: { from: string; to: string }[];
      rows: CheckedRow[];
      summary: ReturnType<typeof summarize>;
    }
  | { kind: "done"; count: number; firstId: string; lastId: string };

const XLSX_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ""];

/** 1단계: 엑셀을 읽어 검사만 한다 (아직 저장 안 함) */
export async function previewRoster(_: PreviewState, form: FormData): Promise<PreviewState> {
  await requireCan("student.register");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind: "error", message: "엑셀 파일을 골라 주세요" };
  if (!file.name.toLowerCase().endsWith(".xlsx") || !XLSX_TYPES.includes(file.type)) {
    return { kind: "error", message: "xlsx 파일만 올릴 수 있어요. 양식을 받아서 써 주세요" };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { kind: "error", message: "2MB까지 올릴 수 있어요" };

  try {
    const { header, rows } = await parseRoster(await file.arrayBuffer());
    if (header.missing.length) {
      return { kind: "error", message: `양식에 없는 열이 있어요: ${header.missing.map((f) => FIELD_LABEL[f]).join(", ")}` };
    }
    if (!rows.length) return { kind: "error", message: "학생 행이 없어요" };
    const checked = checkRows(rows, await repo.existingStudentNos());
    return { kind: "preview", fileName: file.name, renamed: header.renamed, rows: checked, summary: summarize(checked) };
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
    birthDate: r.input.birthDate!,
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
    birthDate: String(form.get("birthDate") ?? ""),
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
