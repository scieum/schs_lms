// 갖고 있던 생기부 글 올리기 (N66, 글 모아 보기 · 엑셀로 올리기): 양식 줄(학번 · 이름 · 생기부 글) → 반 학생과 맞춘 줄.
// 학번으로 찾고 이름까지 같아야 넣는다. 글은 한 문단으로(줄바꿈 → 띄어쓰기), 바이트는 나이스 기준.

import { neisBytes } from "./length";

export type ImportStudent = { id: string; studentNo: string; name: string };
export type ImportRow = {
  line: number; studentNo: string; name: string; text: string; bytes: number;
  studentId: string | null;
  /** 넣을 수 없는 까닭 (없으면 넣음) */
  problem: string | null;
  /** 이미 글이 있어 새 버전이 된다 */
  replaces: boolean;
  over: boolean;
};

export const IMPORT_MAX_CHARS = 3000;
const oneParagraph = (t: string) => t.replace(/\s*\r?\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
const norm = (s: string) => s.replace(/\s/g, "");

/** current: 학생 id → 지금 글. 지금 글과 같은 줄(양식에 미리 채운 글 그대로)은 건너뛴다 */
export function matchImport(body: { line: number; cells: string[] }[], students: ImportStudent[], current: Map<string, string>, maxBytes: number): ImportRow[] {
  const byNo = new Map(students.map((s) => [s.studentNo, s]));
  const seen = new Set<string>();
  return body.flatMap(({ line, cells: [no = "", name = "", raw = ""] }) => {
    const text = oneParagraph(raw);
    const st = byNo.get(no.trim());
    if (!text || (st && oneParagraph(current.get(st.id) ?? "") === text)) return [];
    const bytes = neisBytes(text);
    let problem: string | null = null;
    if (!st) problem = "이 반 학생이 아니에요";
    else if (norm(st.name) !== norm(name)) problem = "이름이 달라요";
    else if (seen.has(st.id)) problem = "같은 학생이 두 번 있어요";
    else if (text.length > IMPORT_MAX_CHARS) problem = `${IMPORT_MAX_CHARS.toLocaleString("ko-KR")}자까지예요`;
    if (st && !problem) seen.add(st.id);
    return [{ line, studentNo: no.trim(), name: name.trim(), text, bytes, studentId: problem ? null : st!.id, problem, replaces: !!st && !!current.get(st.id)?.trim(), over: bytes > maxBytes }];
  });
}
