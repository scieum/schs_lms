import type { ProgramStatus } from "./program";

// 프로그램 흐름 (Figma N16): 다섯 단계 중 지금 어디인지, 다음에 누를 일 하나.
// ① 받는 중(서류) → ② 마감 → ③ 초안 만들기 → ④ 검토·확정 → ⑤ 담임 전달

export const STAGES = ["받는 중", "마감", "초안 만들기", "검토·확정", "담임 전달"] as const;
export type StageIndex = 0 | 1 | 2 | 3 | 4;

export type StageCounts = {
  status: ProgramStatus;
  targets: number;
  /** 설문·서류 중 하나라도 낸 학생 */
  evidence: number;
  /** 근거는 있는데 아직 초안을 만들지 않은 학생 */
  ready: number;
  running: number;
  failed: number;
  /** 검토 대기 */
  review: number;
  confirmed: number;
  /** 외부 글 프로그램 (N46): evidence = 글을 넣은 학생 */
  external?: boolean;
};

export type NextAction =
  | { kind: "publish"; label: string }
  | { kind: "remind"; label: string; n: number }
  | { kind: "close"; label: string }
  | { kind: "generate"; label: string; n: number }
  | { kind: "running"; label: string }
  | { kind: "retry"; label: string; n: number }
  | { kind: "review"; label: string; n: number }
  | { kind: "external"; label: string }
  | { kind: "done"; label: string };

export type Stage = { index: StageIndex; label: string; line: string; next: NextAction; secondary: NextAction | null };

export function programStage(c: StageCounts, dday: string): Stage {
  const missing = Math.max(0, c.targets - c.evidence);
  const made = c.review + c.confirmed;
  const S = (index: StageIndex, line: string, next: NextAction, secondary: NextAction | null = null): Stage => ({ index, label: STAGES[index], line, next, secondary });

  if (c.status === "draft") return S(0, c.external ? "발행 전 · 외부 글은 발행한 뒤 넣어요" : "발행 전 · 학생 화면에 아직 안 열렸어요", { kind: "publish", label: "발행하기" });
  // 외부 글 프로그램 (N46): 설문·AI 없이 ① 외부 글 넣기 → ④ 검토·확정 → ⑤ 담임 전달
  if (c.external) {
    const left = Math.max(0, c.targets - c.evidence);
    const put: NextAction = { kind: "external", label: "외부 글 넣기" };
    if (c.evidence === 0) return S(0, `외부 글 0/${c.targets}명 · 엑셀이나 학생마다 넣어요`, put);
    if (c.confirmed >= c.targets && c.targets > 0) return S(4, `확정 ${c.confirmed}/${c.targets}명 · 담임 받은 초안으로 갔어요`, { kind: "done", label: `담임에게 전달됨 ${c.confirmed}/${c.targets}` });
    const line = `외부 글 ${c.evidence}/${c.targets}명 · 확정 ${c.confirmed}`;
    if (c.review) return S(3, line, { kind: "review", label: `검토하러 가기 ${c.review}건`, n: c.review }, left ? put : null);
    return S(left ? 0 : 3, line, left ? put : { kind: "done", label: `확정 ${c.confirmed}/${c.targets}` });
  }
  // ① 받는 중 (마감 전): 미제출이 있으면 알리기 + 지금 마감, 다 냈으면 마감
  if (c.status === "open") {
    return S(0, `제출 ${c.evidence}/${c.targets}명 · 마감 ${dday}`,
      missing ? { kind: "remind", label: `미제출 ${missing}명에게 알리기`, n: missing } : { kind: "close", label: "지금 마감하기" },
      missing ? { kind: "close", label: "지금 마감" } : null);
  }

  // 확정이 모두 끝났으면 담임에게 넘어간 것
  if (c.evidence > 0 && c.confirmed >= c.evidence && !c.running && !c.failed && !c.ready) {
    return S(4, `확정 ${c.confirmed}/${c.targets}명 · 담임 받은 초안으로 갔어요`, { kind: "done", label: `담임에게 전달됨 ${c.confirmed}/${c.targets}` });
  }
  // ③ 초안 만들기: 아직 만드는 중·실패·남은 학생이 있다 (검토할 초안이 있으면 검토가 먼저, 실패는 둘째 버튼)
  if (c.running || c.failed || (made > 0 && c.ready > 0)) {
    const line = [c.running && `만드는 중 ${c.running}`, c.failed && `실패 ${c.failed}`, c.review && `검토 대기 ${c.review}`, c.confirmed && `확정 ${c.confirmed}`].filter(Boolean).join(" · ");
    if (c.review) return S(2, line, { kind: "review", label: `검토하러 가기 ${c.review}건`, n: c.review },
      c.failed ? { kind: "retry", label: `실패 ${c.failed}건 다시 만들기`, n: c.failed } : null);
    if (c.failed) return S(2, line, { kind: "retry", label: `실패 ${c.failed}건 다시 만들기`, n: c.failed },
      c.ready ? { kind: "generate", label: `초안 만들기 ${c.ready}명`, n: c.ready } : null);
    if (c.running) return S(2, line, { kind: "running", label: `만드는 중 ${c.running}건` });
    return S(2, `남은 학생 ${c.ready}명`, { kind: "generate", label: `초안 만들기 ${c.ready}명`, n: c.ready });
  }
  // ④ 검토·확정: 다 만들었고 확정이 남았다
  if (made > 0) {
    return S(3, `검토 대기 ${c.review} · 확정 ${c.confirmed}/${c.evidence}`, { kind: "review", label: `검토하러 가기 ${c.review}건`, n: c.review });
  }
  if (c.status === "closed") {
    return S(1, `제출 ${c.evidence}/${c.targets}명 · 마감`, c.ready
      ? { kind: "generate", label: `초안 만들기 ${c.ready}명`, n: c.ready }
      : { kind: "done", label: "초안을 만들 서류가 없어요" });
  }
  return S(1, `제출 ${c.evidence}/${c.targets}명`, { kind: "done", label: "초안을 만들 서류가 없어요" });
}
