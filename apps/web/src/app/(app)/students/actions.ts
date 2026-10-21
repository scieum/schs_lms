"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { checkOne, checkRows, myeongnyeolRows, nextPseudonymIds, readMyeongnyeol, readNoNameRoster, registerRows, summarize, type CheckedRow, type RawStudent } from "@/lib/domain/roster";
import { parseStudentQuery, type StudentFilter } from "@/lib/domain/teacher-assist";
import { parseStudentSearch } from "@/lib/server/ai/teacher-ai";
import { env } from "@/lib/server/env";
import { readGrid, readTemplateFile } from "@/lib/server/excel";
import { repo, type NewStudent } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type PreviewState =
  | { kind: "idle" }
  | { kind: "error"; message: string; fileName?: string }
  | {
      kind: "preview";
      fileName: string;
      rows: CheckedRow[];
      summary: ReturnType<typeof summarize>;
      /** 학교 명렬표 · 학번 · 이름 명단에서 읽음: 성별 칸이 없으면 화면에서 고른다 (label: "3학년 1반" · "1~3학년 600명") */
      myeongnyeol?: { label: string };
    }
  | { kind: "done"; count: number; firstId: string; lastId: string };

/** 1단계: 학생등록_양식.xlsx 를 읽어 검사만 한다 (아직 저장 안 함). 양식이 아니면 읽지 않는다 (N25, AI 없음) */
export async function previewRoster(_: PreviewState, form: FormData): Promise<PreviewState> {
  await requireCan("student.register");
  const file = form.get("file");
  const fileName = file instanceof File ? file.name : undefined;
  const r = await readTemplateFile(file, "register");
  if ("error" in r) {
    // 양식이 아니면 학교 명렬표(나이스 "학생명렬표" xlsx · csv)인지 본다
    const grid = await readGrid(file, 3000);
    const m = grid && readMyeongnyeol(grid);
    if (m) {
      const checked = checkRows(myeongnyeolRows(m), await repo.existingStudentNos());
      return { kind: "preview", fileName: fileName ?? "", rows: checked, summary: summarize(checked), myeongnyeol: { label: `학교 명렬표 · ${m.grade}학년 ${m.classNo}반` } };
    }
    // 학번 · 이름 명단 (반 코드 같은 다른 열은 무시)
    const nn = grid && readNoNameRoster(grid);
    if (!nn) return { kind: "error", message: `${r.error} · 학교 명렬표나 학번 · 이름 명단(엑셀 · CSV)도 읽어요`, fileName };
    if (nn.rows.length > 1500) return { kind: "error", message: "한 번에 1,500명까지 올릴 수 있어요", fileName };
    const checked = checkRows(nn.rows, await repo.existingStudentNos());
    return { kind: "preview", fileName: fileName ?? "", rows: checked, summary: summarize(checked), myeongnyeol: { label: `학번 · 이름 명단 · ${nn.grades.join("·")}학년 ${nn.rows.length}명` } };
  }
  if (!r.body.length) return { kind: "error", message: "학생 행이 없어요. 2행부터 적어 주세요", fileName };
  const checked = checkRows(registerRows(r.body), await repo.existingStudentNos());
  return { kind: "preview", fileName: fileName ?? "", rows: checked, summary: summarize(checked) };
}

async function insert(raws: RawStudent[], actorId: string) {
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
  let raws: RawStudent[];
  try {
    raws = JSON.parse(String(form.get("rows") ?? "[]"));
    if (!Array.isArray(raws) || raws.length > 1500) throw new Error();
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
  const raw: RawStudent = {
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
