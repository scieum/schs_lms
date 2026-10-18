// 이동반(선택 과목 반) 명단: 나이스에서 받은 학생 명단(엑셀·CSV·복사 붙여넣기)을 읽어 우리 학생과 맞춘다.
// 2·3학년은 선택 과목마다 반이 섞이므로, 담당 과목의 학생을 "반"이 아니라 명단으로 정한다.
// 머리글(학번·학년·반·번호·성명/이름)이 있으면 그 열을 쓰고, 없으면 5자리 학번과 한글 이름을 찾아 읽는다.

import type { Student } from "./types";

export interface RosterLine { studentNo: string | null; grade: number | null; classNo: number | null; number: number | null; name: string | null; raw: string }
/** 명단 맞추기에 필요한 학생 정보만 (화면마다 가진 학생 모양이 달라서) */
export type RosterStudent = Pick<Student, "id" | "studentNo" | "grade" | "classNo" | "number" | "name">;
export interface RosterMatch<T extends RosterStudent = Student> { matched: T[]; unmatched: RosterLine[]; duplicates: number }

export const ROSTER_MAX_LINES = 400;

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (s: string) => {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
};
const isName = (s: string) => /^[가-힣]{2,5}$/.test(s);
const NOT_NAME = /^(학년|학생|번호|이름|성명|남자|여자|부원|동아리)$/;

const HEAD = {
  studentNo: /^학번$/,
  grade: /^학년$/,
  classNo: /^반$/,
  number: /^(번호|번)$/,
  name: /^(성명|이름|학생명|학생\s?이름)$/,
};

/** 붙여넣은 글(탭·쉼표·여러 칸 공백 구분) → 표 */
export function splitPasted(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.includes(",") ? l.split(",") : l.split(/\s{2,}|\s(?=\d)|(?<=\d)\s/)).map(clean));
}

/** 표(행×칸) → 명단 줄. 머리글이 있으면 그 열로, 없으면 칸 모양으로 */
export function readRosterTable(rows: string[][]): RosterLine[] {
  const table = rows.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
  const headAt = table.findIndex((r) => r.some((c) => HEAD.name.test(c)) && r.some((c) => HEAD.studentNo.test(c) || HEAD.number.test(c)));
  const out: RosterLine[] = [];
  if (headAt >= 0) {
    const head = table[headAt];
    const col = (re: RegExp) => head.findIndex((c) => re.test(c));
    const at = { studentNo: col(HEAD.studentNo), grade: col(HEAD.grade), classNo: col(HEAD.classNo), number: col(HEAD.number), name: col(HEAD.name) };
    for (const r of table.slice(headAt + 1)) {
      const get = (i: number) => (i >= 0 ? r[i] ?? "" : "");
      const no = get(at.studentNo).replace(/\D/g, "");
      const name = get(at.name).replace(/\s/g, "");
      if (!no && !name) continue;
      out.push({
        studentNo: /^\d{5}$/.test(no) ? no : null,
        grade: num(get(at.grade)), classNo: num(get(at.classNo)), number: num(get(at.number)),
        name: name || null, raw: r.filter(Boolean).join(" "),
      });
    }
  } else {
    for (const r of table) {
      const no = r.map((c) => c.replace(/\D/g, "")).find((c) => /^\d{5}$/.test(c)) ?? null;
      const raw = r.filter(Boolean).join(" ");
      // 2-3-12 · 2학년 3반 12번 · 2 3 12 (학번 대신)
      const gcn = no ? null : raw.match(/([1-3])\s*학년\s*(\d{1,2})\s*반\s*(\d{1,2})\s*번?/) ?? raw.match(/(?<!\d)([1-3])\s*[-.\s]\s*(\d{1,2})\s*[-.\s]\s*(\d{1,2})(?!\d)/);
      const name = r.flatMap((c) => c.match(/[가-힣]{2,5}/g) ?? []).find((w) => isName(w) && !NOT_NAME.test(w)) ?? null;
      if (!no && !gcn && !name) continue;
      out.push({ studentNo: no, grade: gcn ? Number(gcn[1]) : null, classNo: gcn ? Number(gcn[2]) : null, number: gcn ? Number(gcn[3]) : null, name, raw });
    }
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
