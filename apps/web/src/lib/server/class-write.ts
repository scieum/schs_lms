import "server-only";
import { CLASS_WRITE_LOCK_MS, CLASS_WRITE_SERVER_TIMEOUT_MS, isRateLimited, type WriteOutcome } from "@/lib/domain/class-write";
import { withTimeout } from "@/lib/domain/pool";
import { exportRows, exportSummary, type ExportCol, type ExportRow, type ExportWho } from "@/lib/domain/records-export";
import type { Viewer } from "@/lib/domain/types";
import { buildRecordsWorkbook } from "./excel";
import { exportStudents, resolveScope, scopeLevels, scopeOriginals, type ClassScopeInput, type ResolvedScope } from "./class-scope";
import { repo } from "./repo";

// 반 전체 글 쓰기 (Figma N42 ①) 서버 쪽: 학생 한 명 = 요청 하나. 잠금(0024) → 쓰기(45초 제한) → 잠금 풀기.
// 확정은 하지 않는다 — 쓴 글은 새 버전 status "draft" + ai_original_id(N38).

export async function runClassWrite(input: { lockScope: string; studentId: string; runId: string; write: () => Promise<WriteOutcome> }): Promise<WriteOutcome> {
  const lock = { studentId: input.studentId, scope: input.lockScope, runId: input.runId };
  if (!(await repo.acquireClassWriteLock({ ...lock, ttlMs: CLASS_WRITE_LOCK_MS }))) return { status: "skipped", reason: "busy" };
  try {
    return await withTimeout(input.write(), CLASS_WRITE_SERVER_TIMEOUT_MS, (): WriteOutcome => ({ status: "failed", error: "시간이 오래 걸려요 · 다시 쓰기" }));
  } catch {
    return { status: "failed", error: "쓰지 못했어요 · 다시 쓰기" };
  } finally {
    await repo.releaseClassWriteLock(lock).catch(() => undefined);
  }
}

/** AI가 켜져 있는데 예시 글(이어 붙이기)로 돌아왔으면 실패로 (AI 꺼짐이면 예시 초안으로 같은 흐름) */
export function aiFailed(r: { text: string; sample: boolean; notice?: string }, aiOn: boolean): WriteOutcome | null {
  if (r.text && !(aiOn && r.sample)) return null;
  const error = (r.notice ?? "쓰지 못했어요").replace(/\s*—\s*조각을 이어 붙였어요$/, "");
  return { status: "failed", error, retryAfter: isRateLimited(error) };
}

// ---------- 엑셀로 받기 (N42 ②) ----------

export type SheetData = { scope: ResolvedScope; rows: ExportRow[] };

export async function scopeRows(r: ResolvedScope, who: ExportWho): Promise<ExportRow[]> {
  const [levels, originals] = await Promise.all([scopeLevels(r), scopeOriginals(r)]);
  return exportRows(exportStudents(r, levels), r.latest, originals, { area: r.area, who, maxBytes: r.maxBytes });
}

/** 범위 여러 개 → 시트 여러 개 + 요약 시트 (한 개면 항목 · 값 두 열, 여러 개면 범위마다 한 줄) */
export async function recordsWorkbook(v: Viewer, inputs: ClassScopeInput[], who: ExportWho, cols: ExportCol[], teacherName: string): Promise<{ data: ArrayBuffer; sheets: SheetData[] } | null> {
  const sheets: SheetData[] = [];
  for (const i of inputs) {
    const r = await resolveScope(v, i);
    if (r) sheets.push({ scope: r, rows: await scopeRows(r, who) });
  }
  if (!sheets.length) return null;
  const settings = await repo.getProvenanceSettings();
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const metric = (r: ResolvedScope, rows: ExportRow[]) => {
    const s = exportSummary(rows, settings.editRatioMin);
    return [
      ["과목·분반", r.title], ["학년도·학기", r.semester ? `${r.year}-${r.semester}` : `${r.year}`], ["학생 수", s.students], ["확정", s.confirmed], ["임시", s.draft], ["빈 글", s.empty],
      ["AI 원안 있는 글", s.withOriginal], ["평균 수정 %", s.avgEdit ?? "-"], [`수정 ${settings.editRatioMin}% 미만`, s.lowEdit], ["평균 바이트", s.avgBytes ?? "-"], ["한도 넘음", s.over],
    ] as [string, string | number][];
  };
  const tail: [string, string][] = [["받은 시각", now], ["받은 선생님", teacherName]];
  const summary = sheets.length === 1
    ? { head: ["항목", "값"], rows: [...metric(sheets[0].scope, sheets[0].rows), ...tail] }
    : (() => {
      const m = sheets.map((s) => metric(s.scope, s.rows));
      return { head: m[0].map(([k]) => k), rows: [...m.map((x) => x.map(([, v]) => v)), [], ...tail] };
    })();
  const data = await buildRecordsWorkbook({ sheets: sheets.map((s) => ({ name: s.scope.title, rows: s.rows })), cols, summary });
  return { data, sheets };
}
