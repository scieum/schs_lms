// 편제표 이미지·PDF → AI 가 뽑은 과목 목록을 편제표에 넣기 전에 맞추고 검사한다 (순수 규칙)
import { isSubjectGroup, matchSubject, normalizeSubjectName, type Course, type CourseType, type SubjectGroup } from "./curriculum";

export interface ImportInput {
  grade: number;
  semester: number;
  subject: string;
  credits: number;
  /** AI 가 읽은 교과(군). 없거나 틀리면 과목 이름으로 맞춘다 */
  group?: string | null;
}

export interface ImportRow {
  grade: number;
  semester: 1 | 2;
  subject: string;
  group: SubjectGroup;
  type: CourseType | null;
  credits: number;
  /** 2022 개정 과목 이름으로 바꿨으면 원래 이름 */
  renamedFrom: string | null;
  error: string | null;
}

/**
 * - 학년 1~3, 학기 1~2, 학점 1~10 이 아니면 오류
 * - 2022 개정 과목이면 이름·교과·유형을 맞춘다. 아니면 읽은 교과(없으면 "교양")로 학교 지정 과목
 * - 이미 편제표에 있거나 목록 안에서 겹치면 오류
 */
export function prepareCourseImport(rows: ImportInput[], existing: Pick<Course, "grade" | "semester" | "subject">[]): ImportRow[] {
  const key = (g: number, s: number, name: string) => `${g}-${s}-${normalizeSubjectName(name)}`;
  const have = new Set(existing.map((c) => key(c.grade, c.semester, c.subject)));
  const seen = new Set<string>();
  return rows.map((r) => {
    const raw = r.subject.trim().slice(0, 30);
    const m = matchSubject(raw);
    const subject = m?.name ?? raw;
    const group: SubjectGroup = m?.group ?? (r.group && isSubjectGroup(r.group) ? r.group : "교양");
    const grade = Math.round(r.grade);
    const semester = Math.round(r.semester);
    const credits = Math.round(r.credits);
    let error: string | null = null;
    if (subject.length < 2) error = "과목 이름이 짧아요";
    else if (grade < 1 || grade > 3) error = "학년을 확인해 주세요";
    else if (semester !== 1 && semester !== 2) error = "학기를 확인해 주세요";
    else if (!(credits >= 1 && credits <= 10)) error = "학점은 1~10";
    else if (have.has(key(grade, semester, subject))) error = "이미 편제표에 있어요";
    else if (seen.has(key(grade, semester, subject))) error = "목록에 두 번 있어요";
    if (!error) seen.add(key(grade, semester, subject));
    return {
      grade, semester: (semester === 2 ? 2 : 1) as 1 | 2, subject, group, type: m?.type ?? null, credits,
      renamedFrom: m && m.name !== raw ? raw : null, error,
    };
  });
}

/**
 * 붙여넣은 편제표 글 → 줄마다 학년·학기·과목·학점 (AI 가 꺼져 있을 때).
 * 한 줄 예: "2 1 물리학Ⅰ 4", "2학년 1학기 물리학Ⅰ 4학점", "2\t1\t물리학Ⅰ\t4"
 */
export function parseCourseLines(text: string): ImportInput[] {
  const out: ImportInput[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.trim().match(/^([1-3])\s*(?:학년)?[\s,\t/-]*([12])\s*(?:학기)?[\s,\t]+(.+?)[\s,\t]+(\d{1,2})\s*(?:학점|단위)?$/);
    if (!m) continue;
    out.push({ grade: Number(m[1]), semester: Number(m[2]), subject: m[3].trim(), credits: Number(m[4]) });
  }
  return out;
}
