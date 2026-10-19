// 학생 명단(엑셀로 학생 넣기 · 이동반 명단): 명단 양식(학번·학년·반·번호·이름, excel-template.ts)을 읽어 우리 학생과 맞춘다.
// 2·3학년은 선택 과목마다 반이 섞이므로, 담당 과목의 학생을 "반"이 아니라 명단으로 정한다.
// 양식이 아닌 파일·붙여넣기·나이스 출석부는 읽지 않는다 (Figma N25).

import type { Student } from "./types";

export interface RosterLine { studentNo: string | null; grade: number | null; classNo: number | null; number: number | null; name: string | null; raw: string; /** 엑셀 줄 번호 (1행 = 제목) */ line?: number }
/** 명단 맞추기에 필요한 학생 정보만 (화면마다 가진 학생 모양이 달라서) */
export type RosterStudent = Pick<Student, "id" | "studentNo" | "grade" | "classNo" | "number" | "name">;
export interface RosterMatch<T extends RosterStudent = Student> { matched: T[]; unmatched: RosterLine[]; duplicates: number }

export const ROSTER_MAX_LINES = 400;

const num = (s: string) => {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
};
/** 이름 칸의 덧붙임은 빼고 이름만 ("이재혁(공동)", "김민준 [전입]") — 학번·이름만 보고 맞춘다 */
const cleanName = (s: string) => s.replace(/\(.*?\)|（.*?）|\[.*?\]/g, "").replace(/[^가-힣a-zA-Z]/g, "");

/** 명단 양식 본문(readTemplate(rows, "list")) → 명단 줄. 학번·학년반번호·이름이 모두 없는 줄은 뺀다 */
export function listLines(body: { line?: number; cells: string[] }[]): RosterLine[] {
  const out: RosterLine[] = [];
  for (const { line, cells } of body) {
    const [no = "", grade = "", classNo = "", number = "", name = ""] = cells;
    const digits = no.replace(/\D/g, "");
    const clean = cleanName(name);
    const g = num(grade), c = num(classNo), n = num(number);
    if (!digits && !clean && !(g && c && n)) continue;
    out.push({
      studentNo: /^\d{5}$/.test(digits) ? digits : null,
      grade: g, classNo: c, number: n,
      name: clean || null, raw: cells.filter(Boolean).join(" "),
      ...(line ? { line } : {}),
    });
  }
  return out.slice(0, ROSTER_MAX_LINES);
}

/** 명단 줄 → 우리 학생. 학번 → 학년·반·번호 → (번호가 없을 때만, 그 학년에서 한 명뿐인) 이름 순으로 찾는다 */
export function matchRoster<T extends RosterStudent>(lines: RosterLine[], students: T[], grade?: number): RosterMatch<T> {
  const byNo = new Map(students.map((s) => [s.studentNo, s]));
  const pool = grade ? students.filter((s) => s.grade === grade) : students;
  const seen = new Set<string>();
  const matched: T[] = [];
  const unmatched: RosterLine[] = [];
  let duplicates = 0;
  for (const l of lines) {
    let s: T | undefined;
    if (l.studentNo) s = byNo.get(l.studentNo);
    if (!s && l.grade && l.classNo && l.number) s = students.find((x) => x.grade === l.grade && x.classNo === l.classNo && x.number === l.number);
    if (!s && l.classNo && l.number && grade) s = pool.find((x) => x.classNo === l.classNo && x.number === l.number);
    // 학번·학년반번호를 적었는데 못 찾았으면 이름으로 넘겨짚지 않는다 (다른 학생이 잡힐 수 있어서)
    if (!s && l.name && !l.studentNo && !(l.grade && l.classNo && l.number)) {
      const same = pool.filter((x) => x.name === l.name);
      if (same.length === 1) s = same[0];
    }
    // 이름이 있는데 찾은 학생 이름과 다르면 잘못 맞춘 것으로 본다
    if (s && l.name && s.name !== l.name) s = undefined;
    if (!s) { unmatched.push(l); continue; }
    if (seen.has(s.id)) { duplicates++; continue; }
    seen.add(s.id);
    matched.push(s);
  }
  matched.sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  return { matched, unmatched, duplicates };
}
