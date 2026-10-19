import "server-only";
import { db, isUuid } from "../supabase";

// 반 전체 글 쓰기 잠금 (Figma N42 ①, 0024 class_write_locks): 학생 × 범위마다 한 줄 · 만료 3분.
// 다른 run 이 살아 있으면 "이미 쓰는 중"(false). 0024 전 DB면 잠금 없이 이어 간다(true).

export interface ClassWriteRepo {
  /** 잠금 잡기: 잡았으면 true, 다른 run 이 쓰는 중이면 false */
  acquireClassWriteLock(x: { studentId: string; scope: string; runId: string; ttlMs: number }): Promise<boolean>;
  releaseClassWriteLock(x: { studentId: string; scope: string; runId: string }): Promise<void>;
}

// ---------- 데모 ----------

const g = globalThis as unknown as { __schswritelocks?: Map<string, { runId: string; expiresAt: number }> };
const locks = () => (g.__schswritelocks ??= new Map());
const k = (studentId: string, scope: string) => `${studentId}|${scope}`;

export const demoClassWrite: ClassWriteRepo = {
  async acquireClassWriteLock({ studentId, scope, runId, ttlMs }) {
    const cur = locks().get(k(studentId, scope));
    if (cur && cur.runId !== runId && cur.expiresAt > Date.now()) return false;
    locks().set(k(studentId, scope), { runId, expiresAt: Date.now() + ttlMs });
    return true;
  },
  async releaseClassWriteLock({ studentId, scope, runId }) {
    const cur = locks().get(k(studentId, scope));
    if (cur?.runId === runId) locks().delete(k(studentId, scope));
  },
};

// ---------- Supabase ----------

const missing = (e: { message: string; code?: string } | null) => !!e && (/class_write_locks/.test(e.message) || e.code === "42P01");

export const supabaseClassWrite: ClassWriteRepo = {
  async acquireClassWriteLock({ studentId, scope, runId, ttlMs }) {
    if (!isUuid(studentId) || !isUuid(runId)) return true;
    const now = new Date();
    const expires = new Date(now.getTime() + ttlMs).toISOString();
    // 만료된 줄은 먼저 지운다 → 넣기. 겹치면(다른 탭이 이미 넣음) 그 줄의 run 을 본다
    const del = await db().from("class_write_locks").delete().eq("student_id", studentId).eq("scope", scope).lt("expires_at", now.toISOString());
    if (missing(del.error)) return true;
    const ins = await db().from("class_write_locks").insert({ student_id: studentId, scope, run_id: runId, expires_at: expires });
    if (!ins.error) return true;
    if (missing(ins.error)) return true;
    const cur = await db().from("class_write_locks").select("run_id, expires_at").eq("student_id", studentId).eq("scope", scope).maybeSingle();
    if (cur.error || !cur.data) return true;
    const row = cur.data as { run_id: string; expires_at: string };
    if (row.run_id !== runId && Date.parse(row.expires_at) > now.getTime()) return false;
    await db().from("class_write_locks").update({ run_id: runId, expires_at: expires }).eq("student_id", studentId).eq("scope", scope);
    return true;
  },
  async releaseClassWriteLock({ studentId, scope, runId }) {
    if (!isUuid(studentId) || !isUuid(runId)) return;
    await db().from("class_write_locks").delete().eq("student_id", studentId).eq("scope", scope).eq("run_id", runId);
  },
};
