// 학생 등록 규칙: 엑셀 열 맞추기, 행 검사, 학번·가명ID 만들기.
// 엑셀 파일 읽기(exceljs)는 lib/server/excel.ts 에서 하고, 여기는 순수 함수만 둔다.

export const TEMPLATE_COLUMNS = ["학년", "반", "번호", "이름", "성별", "계열"] as const;
export type Field = "grade" | "classNo" | "number" | "name" | "gender" | "track";
/** 계열은 비워 두면 1 (속초고는 1로 통일) — 그래서 필수 열이 아니다 */
const OPTIONAL: Field[] = ["track"];
export const DEFAULT_TRACK = 1;
export type Gender = "남" | "여";

const ALIASES: Record<Field, string[]> = {
  grade: ["학년", "grade"],
  classNo: ["반", "학급", "class"],
  number: ["번호", "번", "출석번호", "number", "no"],
  name: ["이름", "성명", "학생명", "학생이름", "name"],
  gender: ["성별", "남녀", "gender", "sex"],
  track: ["계열", "track"],
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
  const missing = (Object.keys(ALIASES) as Field[]).filter((f) => map[f] === undefined && !OPTIONAL.includes(f));
  return { map, renamed, missing };
}

export const FIELD_LABEL: Record<Field, string> = {
  grade: "학년",
  classNo: "반",
  number: "번호",
  name: "이름",
  gender: "성별",
  track: "계열",
};

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
export function checkOne(raw: Record<Field, string>): { input: Partial<RosterInput>; problems: string[] } {
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
