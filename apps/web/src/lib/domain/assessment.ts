// 수행평가 (Figma N59): 교과 교사가 분반마다 수행평가를 등록하고, 학생 자료(한 명씩 · 합본 PDF 나누기)를 올리면
// AI가 학생마다 읽어 요약만 "수행평가" 조각으로 남긴다(파일은 저장하지 않음 — 세특 자료 요약 N32와 같은 방식).
// 조각 범위 = 세특:<과목>#수행:<수행평가 id> → 글 짓기 왼쪽 칸에 "수행평가" 출처로 나온다.

export type Assessment = {
  id: string;
  courseId: string;
  /** 이동반 분반 (고정반 · 공동교육과정이면 그 분반 이름 또는 null) */
  section: string | null;
  teacherId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 평가 내용 · 기준 — AI가 학생 자료를 읽을 때 참고 */
  description: string;
  createdAt: string;
};

export const ASSESS_LIMITS = { title: 40, description: 500 } as const;

export const assessScope = (courseId: string, id: string) => `세특:${courseId}#수행:${id}`;
export const isAssessScope = (scope: string) => /#수행:/.test(scope);
export const assessIdOf = (scope: string) => scope.split("#수행:")[1] ?? "";

export function checkAssessment(input: { title: string; date: string; description?: string }): string | null {
  const title = input.title.trim();
  if (title.length < 2) return "수행평가 이름을 2자 이상 써 주세요";
  if (title.length > ASSESS_LIMITS.title) return `이름은 ${ASSESS_LIMITS.title}자까지예요`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "날짜를 골라 주세요";
  if ((input.description ?? "").trim().length > ASSESS_LIMITS.description) return `평가 내용은 ${ASSESS_LIMITS.description}자까지예요`;
  return null;
}

/** 학생마다 마지막 요약 (자료 있음 표시 · 미리보기) */
export function latestSummaries<T extends { studentId: string; createdAt: string }>(memos: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of memos) { const p = m.get(x.studentId); if (!p || p.createdAt < x.createdAt) m.set(x.studentId, x); }
  return m;
}

/** 이 분반의 수행평가만, 최신 날짜 위 */
export const assessmentsFor = (all: Assessment[], courseId: string, section: string | null) =>
  all.filter((a) => a.courseId === courseId && (a.section ?? null) === (section ?? null)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
