// 학생 등록 규칙: 엑셀 열 맞추기, 행 검사, 학번·가명ID 만들기.
// 엑셀 파일 읽기(exceljs)는 lib/server/excel.ts 에서 하고, 여기는 순수 함수만 둔다.

export const TEMPLATE_COLUMNS = ["학년", "반", "번호", "이름", "생년월일"] as const;
export type Field = "grade" | "classNo" | "number" | "name" | "birthDate";

const ALIASES: Record<Field, string[]> = {
  grade: ["학년", "grade"],
  classNo: ["반", "학급", "class"],
  number: ["번호", "번", "출석번호", "number", "no"],
  name: ["이름", "성명", "학생명", "학생이름", "name"],
  birthDate: ["생년월일", "생일", "출생일", "birth", "birthdate"],
};

const norm = (s: string) => s.replace(/\s|\(.*?\)/g, "").toLowerCase();

export interface HeaderMatch {
  map: Partial<Record<Field, number>>; // field -> column index
  /** 양식과 이름이 달랐지만 맞춘 열 (예: 성명 → 이름) */
  renamed: { from: string; to: string }[];
  missing: Field[];
}

export function matchHeaders(headers: string[]): HeaderMatch {
  const map: Partial<Record<Field, number>> = {};
  const renamed: { from: string; to: string }[] = [];
  headers.forEach((raw, idx) => {
    const h = norm(raw ?? "");
    if (!h) return;
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (map[f] !== undefined) continue;
      const aliases = ALIASES[f].map(norm);
      if (aliases.includes(h)) {
        map[f] = idx;
        const canonical = ALIASES[f][0];
        if (norm(canonical) !== h) renamed.push({ from: raw.trim(), to: canonical });
        return;
      }
    }
  });
  const missing = (Object.keys(ALIASES) as Field[]).filter((f) => map[f] === undefined);
  return { map, renamed, missing };
}

export const FIELD_LABEL: Record<Field, string> = {
  grade: "학년",
  classNo: "반",
  number: "번호",
  name: "이름",
  birthDate: "생년월일",
};

export interface RosterInput {
  grade: number;
  classNo: number;
  number: number;
  name: string;
  birthDate: string; // YYYY-MM-DD
}

export type RowStatus = "new" | "duplicate" | "invalid";

export interface CheckedRow {
  line: number; // 엑셀 행 번호 (헤더가 1행)
  input: Partial<RosterInput> & { raw: Record<Field, string> };
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

/** 2009-03-14 / 2009.03.14 / 2009/3/14 / 20090314 → 2009-03-14 */
export function normalizeBirth(v: string): string | null {
  const s = v.trim();
  let y: number, m: number, d: number;
  const sep = s.match(/^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})일?$/);
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (sep) [y, m, d] = [Number(sep[1]), Number(sep[2]), Number(sep[3])];
  else if (compact) [y, m, d] = [Number(compact[1]), Number(compact[2]), Number(compact[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1990 || y > 2025) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
export function checkOne(raw: Record<Field, string>): { input: Partial<RosterInput>; problems: string[] } {
  const problems: string[] = [];
  const grade = toInt(raw.grade);
  const classNo = toInt(raw.classNo);
  const number = toInt(raw.number);
  const name = raw.name.trim();
  const birthDate = raw.birthDate.trim() ? normalizeBirth(raw.birthDate) : null;

  if (grade === null || grade < 1 || grade > 3) problems.push("학년은 1~3이에요");
  if (classNo === null || classNo < 1 || classNo > 20) problems.push("반 숫자를 확인해 주세요");
  if (number === null || number < 1 || number > 60) problems.push("번호 숫자를 확인해 주세요");
  if (name.length < 2 || name.length > 20) problems.push("이름을 확인해 주세요");
  if (!raw.birthDate.trim()) problems.push("생년월일이 비어 있어요");
  else if (!birthDate) problems.push("생년월일 형식 (예: 2009-03-14)");

  return {
    input: {
      grade: grade ?? undefined,
      classNo: classNo ?? undefined,
      number: number ?? undefined,
      name,
      birthDate: birthDate ?? undefined,
    },
    problems,
  };
}

/**
 * 여러 행 검사.
 * - 같은 파일 안에서 학년·반·번호가 겹치면 뒤 행은 invalid
 * - 이미 등록된 학번이면 duplicate (등록하지 않고 건너뜀)
 */
export function checkRows(rows: Record<Field, string>[], existingStudentNos: Set<string>): CheckedRow[] {
  const seen = new Map<string, number>();
  return rows.map((raw, i) => {
    const line = i + 2;
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
