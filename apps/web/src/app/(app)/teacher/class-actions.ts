"use server";
import { can } from "@/lib/domain/policy";
import { CLASS_WRITE_LIMIT, CLASS_WRITE_RESUME_MS } from "@/lib/domain/class-write";
import { copyCells, parseCopyCols, parseWho, type CopyCol, type ExportRow } from "@/lib/domain/records-export";
import type { Level } from "@/lib/domain/achievement";
import { memoCounts, mySetukScopes, resolveScope, scopeFileName, scopeLevels, textStatus, type ClassScopeInput, type ResolvedScope } from "@/lib/server/class-scope";
import { scopeRows } from "@/lib/server/class-write";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 반 전체 글 쓰기 · 엑셀로 받기 · 시트용 복사 (Figma N42) 화면이 부르는 서버 액션.
// 권한은 class-scope 에서 (내 담당 과목·반 / 담임 반 / 내 동아리). 감사 로그에는 범위 · 숫자만 (이름 · 학번 · 글 없음).

export type ScopeArg = { kind: "setuk"; courseId: string; section?: string | null } | { kind: "record"; area: string; clubId?: string | null };

async function scopeOf(arg: ScopeArg): Promise<{ r: ResolvedScope; accountId: string } | null> {
  const v = await requireViewer();
  if (!can(v, arg?.kind === "setuk" ? "setuk.write" : "record.write")) return null;
  const input: ClassScopeInput = arg?.kind === "setuk"
    ? { kind: "setuk", courseId: String(arg.courseId ?? ""), section: arg.section ? String(arg.section) : null }
    : { kind: "record", area: String(arg?.area ?? ""), clubId: arg?.clubId ? String(arg.clubId) : null };
  const r = await resolveScope(v, input);
  return r ? { r, accountId: v.accountId } : null;
}

const auditScope = (r: ResolvedScope) => (r.kind === "setuk" ? r.title : r.clubName ? `동아리 ${r.clubName}` : r.areaKey);

export type RosterStudent = {
  id: string; no: string; name: string; memos: number; level: Level | null;
  status: "empty" | "draft" | "confirmed"; bytes: number;
};
export type ClassRoster =
  | {
    ok: true; title: string; area: string; maxBytes: number; levels: boolean; students: RosterStudent[]; rows: ExportRow[];
    /** 엑셀 "내 분반 모두"(세특) · "셋 다"(담임) */
    all: { sheets: number; students: number } | null; homeroom: boolean; fileName: string; fileAll: string | null;
  }
  | { ok: false; error: string };

/** 시작 패널 · 엑셀 미리보기 · 시트 미리보기: 학생마다 활동 메모 수 · 성취수준 · 지금 글 상태 (+ 엑셀 한 줄) */
export async function classRoster(arg: ScopeArg): Promise<ClassRoster> {
  const s = await scopeOf(arg);
  if (!s) return { ok: false, error: "내 담당 학생만 볼 수 있어요" };
  const { r } = s;
  const [counts, levels, rows] = await Promise.all([memoCounts(r), scopeLevels(r), scopeRows(r, "all")]);
  const byId = new Map(rows.map((x, i) => [r.students[i]?.id, x]));
  const students: RosterStudent[] = r.students.map((st) => {
    const rec = r.latest.get(st.id);
    return { id: st.id, no: byId.get(st.id)?.학번 ?? "", name: st.name, memos: counts.get(st.id) ?? 0, level: levels[st.id] ?? null, status: textStatus(rec), bytes: byId.get(st.id)?.바이트 ?? 0 };
  });
  let all: { sheets: number; students: number } | null = null;
  if (r.kind === "setuk") {
    const v = await requireViewer();
    const scopes = await mySetukScopes(v);
    if (scopes.length > 1) {
      let n = 0;
      for (const sc of scopes) n += (await resolveScope(v, sc))?.students.length ?? 0;
      all = { sheets: scopes.length, students: n };
    }
  }
  const homeroom = r.kind === "record" && !r.clubId;
  if (homeroom) all = { sheets: 3, students: r.students.length };
  return { ok: true, title: r.title, area: r.area, maxBytes: r.maxBytes, levels: r.kind === "setuk", students, rows, all, homeroom, fileName: scopeFileName(r), fileAll: all ? scopeFileName(r, true) : null };
}

/**
 * 이어 쓰기 (N42 ①): 처음 고른 학생 중 이 시작 뒤 AI 원안이 붙은 새 버전이 생긴 학생(= 썼음) · 확정 · 메모 없음은 끝난 것으로.
 * sessionStorage 에는 run id · 학생 내부 id 만 있다 — 판단은 서버 데이터로.
 */
export async function classWriteStatus(input: { scope: ScopeArg; startedAt: string; studentIds: string[] }): Promise<{ ok: true; written: string[]; resolved: string[] } | { ok: false }> {
  const s = await scopeOf(input?.scope);
  const at = Date.parse(String(input?.startedAt ?? ""));
  if (!s || !Number.isFinite(at) || Date.now() - at > CLASS_WRITE_RESUME_MS) return { ok: false };
  const ids = new Set((Array.isArray(input.studentIds) ? input.studentIds : []).map(String).slice(0, CLASS_WRITE_LIMIT));
  const counts = await memoCounts(s.r);
  const written: string[] = [];
  const resolved: string[] = [];
  for (const st of s.r.students) {
    if (!ids.has(st.id)) continue;
    const rec = s.r.latest.get(st.id);
    const w = !!rec?.aiOriginalId && Date.parse(rec.createdAt) >= at - 1000;
    if (w) written.push(st.id);
    if (w || rec?.status === "confirmed" || !(counts.get(st.id) ?? 0)) resolved.push(st.id);
  }
  return { ok: true, written, resolved };
}

/** 감사: class_write.start "<범위> n=14 rewrite=0" · class_write.done "<범위> done=12 failed=1 skipped=1" (숫자만) */
export async function classWriteLog(input: { scope: ScopeArg; phase: "start" | "done"; n?: number; rewrite?: boolean; done?: number; failed?: number; skipped?: number }): Promise<void> {
  const s = await scopeOf(input?.scope);
  if (!s) return;
  const num = (x: unknown) => Math.max(0, Math.min(999, Math.floor(Number(x) || 0)));
  const what = auditScope(s.r);
  if (input.phase === "start") await repo.audit(s.accountId, "class_write.start", `${what} n=${num(input.n)} rewrite=${input.rewrite ? 1 : 0}`);
  else await repo.audit(s.accountId, "class_write.done", `${what} done=${num(input.done)} failed=${num(input.failed)} skipped=${num(input.skipped)}`);
}

/** 시트용 복사 (N42 ③): 확정만이면 확정 글, 전체면 최신 버전 글. 화면이 TSV 로 바꿔 클립보드에 넣는다 */
export async function copyRows(input: { scope: ScopeArg; who: "confirmed" | "all"; cols: CopyCol[] }): Promise<{ ok: true; header: CopyCol[]; rows: (string | number)[][] } | { ok: false; error: string }> {
  const s = await scopeOf(input?.scope);
  if (!s) return { ok: false, error: "내 담당 학생만 복사할 수 있어요" };
  const who = parseWho(input.who) === "confirmed" ? "confirmed" : "all";
  const cols = parseCopyCols(input.cols).filter((c) => s.r.kind === "setuk" || c !== "성취수준");
  if (!cols.length) return { ok: false, error: "열을 골라 주세요" };
  const rows = (await scopeRows(s.r, who)).map((x) => copyCells(x, cols));
  await repo.audit(s.accountId, "records.copy_tsv", `${auditScope(s.r)} n=${rows.length}`);
  return { ok: true, header: cols, rows };
}
