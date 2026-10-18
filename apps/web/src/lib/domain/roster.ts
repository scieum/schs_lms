// 학생 등록 규칙: 양식 줄 읽기, 행 검사, 학번·가명ID 만들기.
// 엑셀 파일 읽기(exceljs)는 lib/server/excel.ts, 양식 제목 검사는 excel-template.ts.

export type Field = "grade" | "classNo" | "number" | "name" | "gender" | "track";
export const DEFAULT_TRACK = 1;
export type Gender = "남" | "여";
/** 한 학생 입력 칸. studentNo(학번)는 양식에서만 오고, 적었으면 학년·반·번호와 같은지 본다 */
export type RawStudent = Record<Field, string> & { studentNo?: string };

/** 학생 등록 양식 본문(학번·학년·반·번호·이름·성별·계열) → 입력 칸 */
export function registerRows(body: { line: number; cells: string[] }[]): (RawStudent & { line: number })[] {
  return body.map(({ line, cells: [studentNo, grade, classNo, number, name, gender, track] }) => ({ line, studentNo, grade, classNo, number, name, gender, track }));
}

export interface RosterInput {
  grade: number;
  classNo: number;
  number: number;
  name: string;
  gender: Gender;
  track: number;
}

export type RowStatus = "new" | "duplicate" | "invalid";

export interface CheckedRow {
  line: number; // 엑셀 행 번호 (헤더가 1행)
  input: Partial<RosterInput> & { raw: RawStudent };
  status: RowStatus;
  problems: string[];
  studentNo: string | null;
}

function toInt(v: string): number | null {
  const t = v.replace(/[^0-9]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

/** 남/남자/M/1 → 남, 여/여자/F/2 → 여 */
export function normalizeGender(v: string): Gender | null {
  const s = v.trim().toLowerCase();
  if (/^(남|남자|남성|m|male|1)$/.test(s)) return "남";
  if (/^(여|여자|여성|f|female|2)$/.test(s)) return "여";
  return null;
}

/** 학번 = 학년 1자리 + 반 2자리 + 번호 2자리 (예: 2학년 3반 12번 → 20312) */
export function makeStudentNo(grade: number, classNo: number, number: number): string {
  return `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
}

/** 가명ID: S001, S002 … 기존 최대값 다음부터 */
export function nextPseudonymIds(existing: string[], count: number): string[] {
  const max = existing.reduce((m, id) => {
    const n = Number(id.replace(/^S/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return Array.from({ length: count }, (_, i) => `S${String(max + i + 1).padStart(3, "0")}`);
}

/** 한 학생 입력 검사. 문제 목록이 비어 있으면 통과. */
export function checkOne(raw: RawStudent): { input: Partial<RosterInput>; problems: string[] } {
  const problems: string[] = [];
  const grade = toInt(raw.grade);
  const classNo = toInt(raw.classNo);
  const number = toInt(raw.number);
  const name = raw.name.trim();
  const gender = normalizeGender(raw.gender ?? "");
  const trackRaw = (raw.track ?? "").trim();
  const track = trackRaw ? toInt(trackRaw) : DEFAULT_TRACK;

  if (grade === null || grade < 1 || grade > 3) problems.push("학년은 1~3이에요");
  if (classNo === null || classNo < 1 || classNo > 20) problems.push("반 숫자를 확인해 주세요");
  if (number === null || number < 1 || number > 60) problems.push("번호 숫자를 확인해 주세요");
  if (name.length < 2 || name.length > 20) problems.push("이름을 확인해 주세요");
  if (!(raw.gender ?? "").trim()) problems.push("성별이 비어 있어요");
  else if (!gender) problems.push("성별은 남·여로 써 주세요");
  if (track === null || track < 1 || track > 9) problems.push("계열은 숫자 1~9 (비우면 1)");
  const no = (raw.studentNo ?? "").trim();
  if (no && grade !== null && classNo !== null && number !== null && !problems.length && no !== makeStudentNo(grade, classNo, number)) {
    problems.push("학번이 학년·반·번호와 달라요");
  }

  return {
    input: {
      grade: grade ?? undefined,
      classNo: classNo ?? undefined,
      number: number ?? undefined,
      name,
      gender: gender ?? undefined,
      track: track ?? undefined,
    },
    problems,
  };
}

/**
 * 여러 행 검사.
 * - 같은 파일 안에서 학년·반·번호가 겹치면 뒤 행은 invalid
 * - 이미 등록된 학번이면 duplicate (등록하지 않고 건너뜀)
 */
export function checkRows(rows: (RawStudent & { line?: number })[], existingStudentNos: Set<string>): CheckedRow[] {
  const seen = new Map<string, number>();
  return rows.map(({ line: at, ...raw }, i) => {
    const line = at ?? i + 2;
    const { input, problems } = checkOne(raw);
    let studentNo: string | null = null;
    let status: RowStatus = problems.length ? "invalid" : "new";
    if (!problems.length) {
      studentNo = makeStudentNo(input.grade!, input.classNo!, input.number!);
      const prev = seen.get(studentNo);
      if (prev) {
        status = "invalid";
        problems.push(`${prev}행과 학년·반·번호가 같아요`);
      } else if (existingStudentNos.has(studentNo)) {
        status = "duplicate";
        problems.push("이미 등록된 학생");
      }
      seen.set(studentNo, line);
    }
    return { line, input: { ...input, raw }, status, problems, studentNo };
  });
}

export function summarize(rows: CheckedRow[]) {
  return {
    total: rows.length,
    ok: rows.filter((r) => r.status === "new").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };
}
