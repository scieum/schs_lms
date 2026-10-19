"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLASS_WRITE_BACKOFF_MS, CLASS_WRITE_CLIENT_TIMEOUT_MS, CLASS_WRITE_CONCURRENCY, parseSavedRun, resumeTargets, rowStateOf, summarize,
  type SavedRun, type WriteOutcome, type WriteRow,
} from "@/lib/domain/class-write";
import { runPool, withTimeout } from "@/lib/domain/pool";
import { classRoster, classWriteLog, classWriteStatus, type ClassRoster, type ScopeArg } from "@/app/(app)/teacher/class-actions";

// 반 전체 글 쓰기 (Figma N42 ①) 화면 상태: 이 화면을 열어 둔 동안 3명씩 쓴다(서버 작업 큐 없음).
// 다른 화면으로 가면 멈추고, 돌아오면 sessionStorage(run id · 학생 내부 id 만)와 서버 데이터로 남은 학생부터 이어 쓴다.

export type WritePhase = "idle" | "running" | "paused" | "done";
export type WriteBanner = { written: number; total: number; left: string[]; run: SavedRun } | null;

export type ClassWriteRun = {
  roster: ClassRoster | null;
  loadRoster: (force?: boolean) => Promise<ClassRoster | null>;
  phase: WritePhase;
  rows: WriteRow[];
  startedAt: number | null;
  finishedAt: number | null;
  target: number;
  rewrite: boolean;
  start: (ids: string[], opts: { target: number; rewrite: boolean }) => void;
  pause: () => void;
  resume: () => void;
  retry: (ids?: string[]) => void;
  reset: () => void;
  banner: WriteBanner;
  resumeSaved: () => void;
};

const storeKey = (s: ScopeArg) => `n42:${s.kind === "setuk" ? `setuk:${s.courseId}:${s.section ?? ""}` : `record:${s.area}:${s.clubId ?? ""}`}`;
const read = (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: SavedRun | null) => { try { if (v) window.sessionStorage.setItem(k, JSON.stringify(v)); else window.sessionStorage.removeItem(k); } catch { /* 저장 못 하면 이어 쓰기 배너만 없다 */ } };

async function post(scope: ScopeArg, studentId: string, runId: string, target: number, rewrite: boolean, signal: AbortSignal): Promise<WriteOutcome> {
  const body = scope.kind === "setuk"
    ? { kind: "setuk", courseId: scope.courseId, studentId, runId, target, rewrite }
    : { kind: "record", area: scope.area, clubId: scope.clubId ?? null, studentId, runId, target, rewrite };
  try {
    const res = await fetch("/teacher/class-write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal, cache: "no-store" });
    if (res.status === 429 || res.status === 503) return { status: "failed", error: "AI 사용량이 많아요 · 다시 쓰기", retryAfter: true };
    const o = (await res.json().catch(() => null)) as WriteOutcome | null;
    return o && typeof o === "object" && "status" in o ? o : { status: "failed", error: "쓰지 못했어요 · 다시 쓰기" };
  } catch {
    return { status: "failed", error: signal.aborted ? "멈췄어요" : "연결이 끊겼어요 · 다시 쓰기" };
  }
}

export function useClassWriteRun(scope: ScopeArg | null): ClassWriteRun {
  const router = useRouter();
  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [phase, setPhase] = useState<WritePhase>("idle");
  const [rows, setRows] = useState<WriteRow[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [opts, setOpts] = useState({ target: 1500, rewrite: false });
  const [banner, setBanner] = useState<WriteBanner>(null);
  const run = useRef<{ id: string; startedAt: string; ctrl: AbortController; ids: string[] } | null>(null);
  const alive = useRef(true);
  const key = scope ? storeKey(scope) : "";

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; run.current?.ctrl.abort(); };
  }, []);

  const loadRoster = useCallback(async (force = false) => {
    if (!scope) return null;
    if (roster && !force) return roster;
    const r = await classRoster(scope).catch((): ClassRoster => ({ ok: false, error: "학생 목록을 불러오지 못했어요" }));
    if (alive.current) setRoster(r);
    return r;
  }, [scope, roster]);

  // 돌아왔을 때: 저장된 run 이 있으면 서버에 물어 남은 학생이 있을 때만 배너
  useEffect(() => {
    if (!scope) return;
    const saved = parseSavedRun(read(key));
    if (!saved) { write(key, null); return; }
    let off = false;
    void classWriteStatus({ scope, startedAt: saved.startedAt, studentIds: saved.ids }).then((s) => {
      if (off || !s.ok) return;
      const left = resumeTargets(saved, s.resolved);
      if (!left.length) { write(key, null); return; }
      setBanner({ written: s.written.length, total: saved.ids.length, left, run: saved });
    }).catch(() => undefined);
    return () => { off = true; };
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 행 상태는 ref 에 바로 쓰고 화면에 내린다 (끝 요약을 셀 때 렌더를 기다리지 않게)
  const rowsRef = useRef<WriteRow[]>([]);
  const setAll = useCallback((next: WriteRow[]) => { rowsRef.current = next; setRows(next); }, []);
  const patch = useCallback((id: string, p: Partial<WriteRow>) => setAll(rowsRef.current.map((r) => (r.id === id ? { ...r, ...p } : r))), [setAll]);

  const go = useCallback((ids: string[], o: { target: number; rewrite: boolean }) => {
    if (!scope || !run.current || !ids.length) return;
    const cur = run.current;
    const ctrl = new AbortController();
    cur.ctrl = ctrl;
    setPhase("running");
    setFinishedAt(null);
    void runPool(ids, CLASS_WRITE_CONCURRENCY, async (id) => {
      patch(id, { state: "running" });
      const res = await withTimeout(post(scope, id, cur.id, o.target, o.rewrite, ctrl.signal), CLASS_WRITE_CLIENT_TIMEOUT_MS, (): WriteOutcome => ({ status: "failed", error: "시간이 오래 걸려요 · 다시 쓰기" }));
      if (alive.current) patch(id, ctrl.signal.aborted && res.status === "failed" ? { state: "waiting" } : { state: rowStateOf(res), outcome: res, at: Date.now() });
      return res;
    }, { signal: ctrl.signal, backoff: (r) => (r.status === "failed" && r.retryAfter ? CLASS_WRITE_BACKOFF_MS : null) }).then(() => {
      if (!alive.current || run.current !== cur) return;
      if (ctrl.signal.aborted) { setPhase("paused"); return; }
      setPhase("done");
      setFinishedAt(Date.now());
      const s = summarize(rowsRef.current);
      void classWriteLog({ scope, phase: "done", done: s.done, failed: s.failed, skipped: s.skipped });
      // 실패한 학생이 없으면 이어 쓰기 기록을 지운다
      if (!s.failed) write(key, null);
      router.refresh();
      void loadRoster(true);
    });
  }, [scope, key, router, loadRoster, patch]);

  const start = useCallback((ids: string[], o: { target: number; rewrite: boolean }) => {
    if (!scope || !ids.length) return;
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    run.current = { id, startedAt: at, ctrl: new AbortController(), ids };
    write(key, { runId: id, startedAt: at, ids, rewrite: o.rewrite, target: o.target });
    setOpts(o);
    setBanner(null);
    setStartedAt(Date.now());
    setAll(ids.map((x) => ({ id: x, state: "waiting" })));
    void classWriteLog({ scope, phase: "start", n: ids.length, rewrite: o.rewrite });
    go(ids, o);
  }, [scope, key, go, setAll]);

  const pause = useCallback(() => { run.current?.ctrl.abort(); }, []);
  const resume = useCallback(() => {
    const left = rows.filter((r) => r.state === "waiting").map((r) => r.id);
    go(left, opts);
  }, [rows, opts, go]);
  const retry = useCallback((ids?: string[]) => {
    const list = ids ?? rows.filter((r) => r.state === "failed").map((r) => r.id);
    if (!list.length || phase === "running") return;
    setAll(rowsRef.current.map((r) => (list.includes(r.id) ? { id: r.id, state: "waiting" } : r)));
    go(list, opts);
  }, [rows, opts, phase, go, setAll]);
  const reset = useCallback(() => {
    if (phase === "running") return;
    setPhase("idle"); setAll([]); setStartedAt(null); setFinishedAt(null); run.current = null;
  }, [phase, setAll]);

  /** 배너 "이어 쓰기": 처음 고른 학생 중 아직 안 쓴 학생만, 같은 run id 로 */
  const resumeSaved = useCallback(() => {
    if (!banner || !scope) return;
    const { run: saved, left } = banner;
    run.current = { id: saved.runId, startedAt: saved.startedAt, ctrl: new AbortController(), ids: saved.ids };
    const o = { target: saved.target || 1500, rewrite: saved.rewrite };
    setOpts(o);
    setBanner(null);
    setStartedAt(Date.now());
    const done = new Set(saved.ids.filter((x) => !left.includes(x)));
    setAll(saved.ids.map((x) => (done.has(x) ? { id: x, state: "done" as const, at: 0 } : { id: x, state: "waiting" as const })));
    go(left, o);
  }, [banner, scope, go, setAll]);

  return useMemo(() => ({ roster, loadRoster, phase, rows, startedAt, finishedAt, target: opts.target, rewrite: opts.rewrite, start, pause, resume, retry, reset, banner, resumeSaved }),
    [roster, loadRoster, phase, rows, startedAt, finishedAt, opts, start, pause, resume, retry, reset, banner, resumeSaved]);
}
