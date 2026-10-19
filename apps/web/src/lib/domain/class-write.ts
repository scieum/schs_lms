// 반 전체 글 쓰기 (Figma N42 ①): 쓸 학생 고르기 규칙 · 진행 행 순서 · 끝 요약. 순수 함수 (테스트: class-write.test.ts)
// 자동 확정은 없다 — 쓴 글은 학생마다 임시 저장(새 버전) + AI 원안(N38)만.

/** 한 번에 쓸 수 있는 학생 수 (N35 AI 고치기와 같은 값) · 동시 요청 수 · 화면 쪽 시간 제한 · 429 쉬는 시간 · 이어 쓰기 배너 */
export const CLASS_WRITE_LIMIT = 40;
export const CLASS_WRITE_CONCURRENCY = 3;
export const CLASS_WRITE_CLIENT_TIMEOUT_MS = 70_000;
export const CLASS_WRITE_SERVER_TIMEOUT_MS = 45_000;
export const CLASS_WRITE_BACKOFF_MS = 5_000;
export const CLASS_WRITE_RESUME_MS = 30 * 60_000;
/** 같은 학생 잠금 (서버 표 class_write_locks, 0024) */
export const CLASS_WRITE_LOCK_MS = 3 * 60_000;

export type TextStatus = "empty" | "draft" | "confirmed";
export type WriteCandidate = { id: string; memos: number; status: TextStatus };

/** 묶음 칩: 메모 있고 글 없음 · 글 있음 · 메모 없음 · 확정(빼요) */
export type WriteGroup = "ready" | "has_text" | "no_memo" | "locked";

export function groupOf(s: WriteCandidate): WriteGroup {
  if (s.status === "confirmed") return "locked";
  if (s.status === "draft") return "has_text";
  return s.memos > 0 ? "ready" : "no_memo";
}

export function groupCounts(list: WriteCandidate[]): Record<WriteGroup, number> {
  const c: Record<WriteGroup, number> = { ready: 0, has_text: 0, no_memo: 0, locked: 0 };
  for (const s of list) c[groupOf(s)]++;
  return c;
}

/** 기본 선택 = 메모 ≥ 1 · 글(최신 버전 본문)이 비었고 · 확정이 아닌 학생 */
export function pickDefault(list: WriteCandidate[]): string[] {
  return list.filter((s) => groupOf(s) === "ready").map((s) => s.id);
}

/** 고를 수 있는지: 확정은 안 됨 · 글이 있으면 "다시 쓰기"를 켜야 · 메모 없는 학생은 고를 수 있지만 돌리면 건너뜀 */
export function selectable(s: WriteCandidate, rewrite: boolean): boolean {
  const g = groupOf(s);
  return g === "locked" ? false : g === "has_text" ? rewrite : true;
}

/** 표 옆 회색 까닭 */
export function reasonOf(s: WriteCandidate, rewrite: boolean): string | null {
  const g = groupOf(s);
  if (g === "locked") return "확정 · 고를 수 없음";
  if (g === "has_text" && !rewrite) return "글 있음 · 다시 쓰기 꺼짐";
  if (s.memos === 0) return "메모 없음";
  return null;
}

/** 묶음 칩을 누르면 그 묶음을 모두 넣고/뺀다 (확정 묶음은 누를 수 없음). 다시 쓰기가 꺼져 있으면 글 있음 묶음은 넣지 못한다 */
export function toggleGroup(list: WriteCandidate[], picked: string[], g: WriteGroup, rewrite: boolean): string[] {
  if (g === "locked") return picked;
  const ids = list.filter((s) => groupOf(s) === g && selectable(s, rewrite)).map((s) => s.id);
  if (!ids.length) return picked;
  const set = new Set(picked);
  const all = ids.every((id) => set.has(id));
  for (const id of ids) if (all) set.delete(id); else set.add(id);
  return list.map((s) => s.id).filter((id) => set.has(id));
}

/** 다시 쓰기를 끄면 글 있는 학생은 고른 목록에서 빠진다 */
export function prunePicked(list: WriteCandidate[], picked: string[], rewrite: boolean): string[] {
  const ok = new Set(list.filter((s) => selectable(s, rewrite)).map((s) => s.id));
  return picked.filter((id) => ok.has(id));
}

/** 학생 수 상한: 앞 40명만 */
export function capTargets(ids: string[], limit = CLASS_WRITE_LIMIT): { ids: string[]; cut: number } {
  return { ids: ids.slice(0, limit), cut: Math.max(0, ids.length - limit) };
}

// ---------- 진행 ----------

export type SkipReason = "no_memo" | "has_text" | "busy" | "locked";
/** 서버가 학생 한 명마다 돌려주는 결과 */
export type WriteOutcome =
  | { status: "done"; bytes: number; versionId: string; max: number; sample?: boolean }
  | { status: "skipped"; reason: SkipReason }
  | { status: "locked" }
  | { status: "failed"; error: string; retryAfter?: boolean };

export type RowState = "waiting" | "running" | "done" | "skipped" | "failed";
export type WriteRow = { id: string; state: RowState; outcome?: WriteOutcome; at?: number };

export function rowStateOf(o: WriteOutcome): RowState {
  return o.status === "done" ? "done" : o.status === "failed" ? "failed" : "skipped";
}

export const SKIP_LABEL: Record<SkipReason, string> = {
  no_memo: "활동 메모가 없어요",
  has_text: "글이 있어 건너뛰었어요",
  busy: "다른 화면에서 쓰는 중이에요",
  locked: "확정한 글이에요",
};
export const skipLabel = (o: WriteOutcome | undefined) =>
  o?.status === "skipped" ? SKIP_LABEL[o.reason] : o?.status === "locked" ? SKIP_LABEL.locked : "";

/** 진행 행 순서 (쓰는 중 화면): 실패 → 쓰는 중 → 완료(최근 순) → 대기 → 건너뜀 */
const ORDER: Record<RowState, number> = { failed: 0, running: 1, done: 2, waiting: 3, skipped: 4 };
/** 끝 화면: 실패 · 건너뜀 먼저 → 완료 */
const END_ORDER: Record<RowState, number> = { failed: 0, skipped: 1, running: 2, done: 3, waiting: 4 };

export function sortRows(rows: WriteRow[], end = false): WriteRow[] {
  const o = end ? END_ORDER : ORDER;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const d = o[a.r.state] - o[b.r.state];
    if (d) return d;
    if (a.r.state === "done" && !end) return (b.r.at ?? 0) - (a.r.at ?? 0);
    return a.i - b.i;
  }).map((x) => x.r);
}

export type WriteSummary = { total: number; done: number; running: number; waiting: number; failed: number; skipped: number; noMemo: number; finished: boolean };

export function summarize(rows: WriteRow[]): WriteSummary {
  const s: WriteSummary = { total: rows.length, done: 0, running: 0, waiting: 0, failed: 0, skipped: 0, noMemo: 0, finished: false };
  for (const r of rows) {
    s[r.state === "done" ? "done" : r.state === "running" ? "running" : r.state === "waiting" ? "waiting" : r.state === "failed" ? "failed" : "skipped"]++;
    if (r.outcome?.status === "skipped" && r.outcome.reason === "no_memo") s.noMemo++;
  }
  s.finished = rows.length > 0 && s.running === 0 && s.waiting === 0;
  return s;
}

/** 남은 시간 대략: 한 명 ~20초 · 동시 3 */
export function etaLabel(left: number, concurrency = CLASS_WRITE_CONCURRENCY): string {
  if (left <= 0) return "";
  const sec = Math.ceil(left / Math.max(1, concurrency)) * 20;
  return sec < 60 ? "1분 안" : `약 ${Math.round(sec / 60)}분`;
}

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}분 ${s % 60}초` : `${s}초`;
}

/** 429 · 과부하 답 → 남은 요청을 쉬었다가 (aiError 문구 · 상태 코드) */
export const isRateLimited = (error: string) => /사용량|429|529|과부하|overload/i.test(error);

/** 이어 쓰기 (sessionStorage `n42:<scope>`): 학생 이름 · 글 없이 내부 id 만 */
export type SavedRun = { runId: string; startedAt: string; ids: string[]; rewrite: boolean; target: number };

export function parseSavedRun(raw: string | null | undefined, now = Date.now()): SavedRun | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw) as Partial<SavedRun>;
    if (typeof x.runId !== "string" || typeof x.startedAt !== "string" || !Array.isArray(x.ids)) return null;
    const at = Date.parse(x.startedAt);
    if (!Number.isFinite(at) || now - at > CLASS_WRITE_RESUME_MS) return null;
    return { runId: x.runId, startedAt: x.startedAt, ids: x.ids.filter((id): id is string => typeof id === "string").slice(0, CLASS_WRITE_LIMIT), rewrite: !!x.rewrite, target: Number(x.target) || 0 };
  } catch {
    return null;
  }
}

/** 이어 쓸 학생: 처음 고른 학생 중 이 시작 뒤 AI 원안이 없는(서버 판단) 학생 */
export function resumeTargets(run: Pick<SavedRun, "ids">, written: Iterable<string>): string[] {
  const done = new Set(written);
  return run.ids.filter((id) => !done.has(id));
}
