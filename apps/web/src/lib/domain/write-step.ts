// 기록 쓰기 단계 (Figma N48): ① 활동 메모 → ② AI로 쓰기 → ③ 글 확인 · 확정 — 한 번에 한 단계만 보여 준다.
// 처음 열 때 어느 단계를 보여 줄지 · 기억해 둔 단계 읽기 · 누가기록(① 학생 고르기 → ② 기록 쓰기 → ③ 확인 · 남기기) 첫 단계.

export type WriteStep = 1 | 2 | 3;
export type StepState = "current" | "done" | "todo";

export const WRITE_STEP_LABEL: Record<WriteStep, string> = { 1: "활동 메모", 2: "AI로 쓰기", 3: "글 확인 · 확정" };
export const LOG_STEP_LABEL: Record<WriteStep, string> = { 1: "학생 고르기", 2: "기록 쓰기", 3: "확인 · 남기기" };

/**
 * 처음 보여 줄 단계.
 * - 반 전체 검사에서 "열기"로 왔으면 ③ (검사 결과를 보러 온 것)
 * - 글이 있으면 ③ (확정한 글이면 ③ 읽기 화면)
 * - 행발처럼 키워드로 쓰는 곳은 글이 없으면 ② (키워드 메뉴판이 ②에 있다)
 * - 활동 메모가 있으면 ② · 없으면 ①
 * - 메모 수를 아직 모르면(불러오는 중) null — 알게 되면 한 번만 정한다
 */
export function defaultWriteStep(s: { memos: number | null; hasBody: boolean; openCheck?: boolean; keywordFirst?: boolean }): WriteStep | null {
  if (s.openCheck || s.hasBody) return 3;
  if (s.keywordFirst) return 2;
  if (s.memos === null) return null;
  return s.memos > 0 ? 2 : 1;
}

/** 누가기록 첫 단계: 고른 학생이 없으면 ①, 있으면 ② */
export function defaultLogStep(picked: number): WriteStep {
  return picked > 0 ? 2 : 1;
}

/** URL ?step= · 저장해 둔 값 → 단계 (틀린 값은 null) */
export function parseStep(v: string | null | undefined): WriteStep | null {
  return v === "1" || v === "2" || v === "3" ? (Number(v) as WriteStep) : null;
}

/** 단계 칸 상태: 지금 보는 단계가 먼저, 아니면 끝/아직 */
export function stepState(step: WriteStep, current: WriteStep, done: boolean): StepState {
  if (step === current) return "current";
  return done ? "done" : "todo";
}

/** 이 기기에 기억해 두는 열쇠 (학생 id만 — 이름은 넣지 않는다) */
export const stepStorageKey = (scope: string, studentId: string) => `schs.write-step.${scope}.${studentId}`;

/** 주소 줄에 단계 넣기: 다른 값은 그대로, step 만 바꾼다 */
export function withStepParam(search: string, step: WriteStep): string {
  const q = new URLSearchParams(search);
  q.set("step", String(step));
  return `?${q.toString()}`;
}
