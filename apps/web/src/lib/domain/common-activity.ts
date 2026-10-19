// 공통 활동 (Figma N26): 과목(분반)·반·동아리 전체가 같이 한 활동(수행평가 등)을 한 번 등록하고,
// 학생 자료를 한꺼번에 올리면 파일 이름의 학번·이름으로 학생을 맞춘다 (AI 없이). 학생마다 "[활동명] …" 조각을 만든다.

import type { RecordArea } from "./writing";

export interface CommonActivity {
  id: string;
  /** "세특:<courseId>" · "세특:<courseId>:<분반>" · "자율·자치:2-3" · "진로:2-3" · "행발:2-3" · "동아리:<clubId>" */
  scope: string;
  name: string;
  date: string | null; // YYYY-MM-DD
  description: string;
  authorId: string;
  createdAt: string;
  /** 차시(Figma N43)에서 만든 활동이면 그 차시 ID */
  lessonItemId?: string | null;
}

/** 공통 활동에서 만든 조각 기록 (학생마다 한 줄, 상태·개수 셈에 쓴다) */
export interface CommonActivityPiece {
  id: string;
  activityId: string;
  studentId: string;
  authorId: string;
  content: string;
  fileCount: number;
  createdAt: string;
}

export type ScopeRef =
  | { kind: "세특"; courseId: string; section: string | null }
  | { kind: Exclude<RecordArea, "동아리">; grade: number; classNo: number }
  | { kind: "동아리"; clubId: string };

export function setukScope(courseId: string, section?: string | null): string {
  return section ? `세특:${courseId}:${section}` : `세특:${courseId}`;
}
export function classScope(area: "자율·자치" | "진로" | "행발", grade: number, classNo: number): string {
  return `${area}:${grade}-${classNo}`;
}
export const clubScope = (clubId: string) => `동아리:${clubId}`;

export function parseScope(scope: string): ScopeRef | null {
  const i = scope.indexOf(":");
  if (i < 0) return null;
  const head = scope.slice(0, i);
  const rest = scope.slice(i + 1);
  if (!rest) return null;
  if (head === "세특") {
    const j = rest.indexOf(":");
    return j < 0 ? { kind: "세특", courseId: rest, section: null } : { kind: "세특", courseId: rest.slice(0, j), section: rest.slice(j + 1) || null };
  }
  if (head === "동아리") return { kind: "동아리", clubId: rest };
  if (head === "자율·자치" || head === "진로" || head === "행발") {
    const m = /^(\d)-(\d{1,2})$/.exec(rest);
    return m ? { kind: head, grade: +m[1], classNo: +m[2] } : null;
  }
  return null;
}

/** 공통 활동 조각을 남기는 메모 범위 (세특·행발). 조각 칸·생기부 조각이 "공통 활동" 칩으로 보여 준다 */
export const commonScope = (scope: string) => `${scope}#공통`;
export const isCommonScope = (scope: string) => scope.endsWith("#공통");

// ---------- 파일 이름으로 학생 맞추기 ----------

export type Matchable = { id: string; studentNo: string; name: string };
export type FileMatch = { file: string; studentId: string | null };

/** 파일 이름 → 낱말들: 확장자를 떼고, 기호·공백과 숫자/글자 경계에서 나눈다 ("20111한지민_보고서" → 20111 · 한지민 · 보고서) */
export function fileTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").normalize("NFC");
  return base
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((t) => t.split(/(?<=\d)(?=\D)|(?<=\D)(?=\d)/))
    .filter(Boolean);
}

/**
 * 파일 하나가 누구 것인지: 5자리 학번이 정확히 하나 맞으면 그 학생, 아니면 이름이 정확히 같은 학생이 한 명일 때.
 * 학번과 이름이 서로 다른 학생을 가리키거나, 같은 이름이 둘이면 모름(null).
 */
export function matchFile(fileName: string, students: Matchable[]): string | null {
  const tokens = fileTokens(fileName);
  const nos = new Set(tokens.filter((t) => /^\d{5}$/.test(t)));
  const byNo = students.filter((s) => nos.has(s.studentNo));
  const names = new Set(tokens);
  const byName = students.filter((s) => s.name && names.has(s.name));
  const noIds = new Set(byNo.map((s) => s.id));
  const nameIds = new Set(byName.map((s) => s.id));
  if (noIds.size === 1) {
    const [id] = noIds;
    // 이름도 적혀 있는데 다른 학생이면 믿지 않는다
    if (nameIds.size && !nameIds.has(id)) return null;
    return id;
  }
  if (noIds.size > 1) return null;
  return nameIds.size === 1 ? [...nameIds][0] : null;
}

export function matchFiles(fileNames: string[], students: Matchable[]): FileMatch[] {
  return fileNames.map((file) => ({ file, studentId: matchFile(file, students) }));
}

/** 요약 칩: 맞춤 n명 · 자료 없음 n명 · 모름 n개 */
export function matchSummary(matches: FileMatch[], studentIds: string[]): { matched: number; missing: number; unknown: number } {
  const has = new Set(matches.filter((m) => m.studentId).map((m) => m.studentId!));
  const matched = studentIds.filter((id) => has.has(id)).length;
  return { matched, missing: studentIds.length - matched, unknown: matches.filter((m) => !m.studentId).length };
}

/** 목록 행 진행 칩: 조각 n/학생 수 (다 되면 초록), 자료로 만든 조각이 없으면 "자료 없음" */
export function progressChip(made: number, total: number): { label: string; tone: "key" | "ok" | "none" } {
  if (made === 0) return { label: "자료 없음", tone: "none" };
  return { label: `조각 ${made}/${total}`, tone: total > 0 && made >= total ? "ok" : "key" };
}
