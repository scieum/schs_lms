import "server-only";
import type { ActivityLog } from "@/lib/domain/activity";
import type { LessonDraft, LessonItem, LessonMark, LessonPlan, LessonScopeKind } from "@/lib/domain/lesson-plan";
import type { RecordMemo } from "@/lib/domain/writing";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";
import { demoWriting } from "./writing";
import { demoCommon } from "./common";

// 차시별 활동 메뉴 (Figma N43 ②): 수업 계획(lesson_plans · lesson_plan_items) + 차시 메모(세특 record_memos · 창체 activity_logs, lesson_item_id).
// 표는 0025_n43_lesson_plans.sql. 적용 전 DB면 읽기는 빈 값, 저장은 안내 문구로 실패한다.

export type LessonPlanView = { plan: LessonPlan; items: LessonItem[] };
/** 차시 메모 한 건: 세특은 메모(memo), 창체는 누가기록(log) */
export type LessonMemoRef = { kind: "memo" | "log"; id: string };
export type NewLessonMemo =
  | { kind: "memo"; scope: string; studentId: string; authorId: string; content: string; date: string; itemId: string }
  | { kind: "log"; area: ActivityLog["area"]; clubId: string | null; studentId: string; authorId: string; content: string; date: string; itemId: string };
export type { LessonMark };

export interface LessonsRepo {
  getLessonPlan(scope: string, year: number): Promise<LessonPlanView | null>;
  /** 차시 id 로 (② AI로 쓰기 배경) */
  getLessonItems(ids: string[]): Promise<LessonItem[]>;
  /** 계획 저장: 있으면 바꾼다. id 가 있는 행은 고치고(메모 연결 유지), 빠진 행은 지우고(메모 연결만 끊김), 새 행은 넣는다 */
  saveLessonPlan(input: { scope: string; kind: LessonScopeKind; year: number; title: string; source: "excel" | "doc"; fileName: string | null; authorId: string; items: LessonDraft[] }): Promise<LessonPlanView>;
  /** 이 차시들에 남긴 메모 (학생 · 차시) — 세특 메모 · 누가기록 · 차시에서 만든 공통 활동 조각 */
  listLessonMarks(items: string[]): Promise<LessonMark[]>;
  addLessonMemos(rows: NewLessonMemo[]): Promise<LessonMemoRef[]>;
  /** 되돌리기: 이 교사가 10분 안에 만든 차시 메모만 지운다. 지운 수 */
  deleteLessonMemos(refs: LessonMemoRef[], authorId: string): Promise<number>;
}

const NEED25 = "차시별 활동을 쓰려면 DB 업데이트(0025)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /lesson_plan|lesson_item_id/.test(e.message);
const RECENT = 10 * 60 * 1000;

// ---------- 데모 ----------

const g = globalThis as unknown as { __schslessons?: { plans: LessonPlan[]; items: LessonItem[] }; __schswriting?: { memos: RecordMemo[] } };
const ls = () => (g.__schslessons ??= { plans: [], items: [] });
const memos = () => g.__schswriting?.memos ?? [];

export const demoLessons: LessonsRepo = {
  async getLessonPlan(scope, year) {
    const plan = ls().plans.find((p) => p.scopeId === scope && p.schoolYear === year);
    if (!plan) return null;
    return { plan: { ...plan }, items: ls().items.filter((i) => i.planId === plan.id).sort((a, b) => a.position - b.position).map((i) => ({ ...i })) };
  },
  async getLessonItems(ids) {
    const set = new Set(ids);
    return ls().items.filter((i) => set.has(i.id)).map((i) => ({ ...i }));
  },
  async saveLessonPlan(x) {
    const now = new Date().toISOString();
    let plan = ls().plans.find((p) => p.scopeId === x.scope && p.schoolYear === x.year);
    if (plan) Object.assign(plan, { title: x.title, source: x.source, fileName: x.fileName, updatedAt: now });
    else {
      plan = { id: crypto.randomUUID(), schoolYear: x.year, scopeKind: x.kind, scopeId: x.scope, title: x.title, source: x.source, fileName: x.fileName, createdBy: x.authorId, createdAt: now, updatedAt: now };
      ls().plans.push(plan);
    }
    const pid = plan.id;
    const keep = new Set(x.items.map((i) => i.id).filter(Boolean));
    const dropped = new Set(ls().items.filter((i) => i.planId === pid && !keep.has(i.id)).map((i) => i.id));
    ls().items = ls().items.filter((i) => !dropped.has(i.id));
    // 지운 차시의 메모는 남기고 연결만 끊는다
    for (const m of memos()) if (m.lessonItemId && dropped.has(m.lessonItemId)) m.lessonItemId = null;
    for (const l of store().logs) if (l.lessonItemId && dropped.has(l.lessonItemId)) l.lessonItemId = null;
    x.items.forEach((d, position) => {
      const cur = d.id ? ls().items.find((i) => i.id === d.id && i.planId === pid) : undefined;
      if (cur) Object.assign(cur, { no: d.no, date: d.date, title: d.title, detail: d.detail, position });
      else ls().items.push({ id: crypto.randomUUID(), planId: pid, no: d.no, date: d.date, title: d.title, detail: d.detail, position });
    });
    return (await demoLessons.getLessonPlan(x.scope, x.year))!;
  },
  async listLessonMarks(items) {
    const set = new Set(items);
    const out: LessonMark[] = [];
    for (const m of memos()) if (m.lessonItemId && set.has(m.lessonItemId)) out.push({ itemId: m.lessonItemId, studentId: m.studentId });
    for (const l of store().logs) if (l.lessonItemId && set.has(l.lessonItemId)) out.push({ itemId: l.lessonItemId, studentId: l.studentId });
    const g2 = globalThis as unknown as { __schscommon?: { activities: { id: string; lessonItemId?: string | null }[]; pieces: { activityId: string; studentId: string }[] } };
    const acts = (g2.__schscommon?.activities ?? []).filter((a) => a.lessonItemId && set.has(a.lessonItemId));
    if (acts.length) {
      const pieces = await demoCommon.listCommonActivityPieces(acts.map((a) => a.id));
      for (const p of pieces) out.push({ itemId: acts.find((a) => a.id === p.activityId)!.lessonItemId!, studentId: p.studentId });
    }
    return out;
  },
  async addLessonMemos(rows) {
    const refs: LessonMemoRef[] = [];
    for (const r of rows) {
      if (r.kind === "memo") {
        const m = await demoWriting.addRecordMemo({ scope: r.scope, studentId: r.studentId, authorId: r.authorId, content: r.content, lessonItemId: r.itemId, date: r.date });
        refs.push({ kind: "memo", id: m.id });
      } else {
        const id = crypto.randomUUID();
        store().logs.push({ id, area: r.area, studentId: r.studentId, authorId: r.authorId, clubId: r.clubId, date: r.date, content: r.content, createdAt: new Date().toISOString(), lessonItemId: r.itemId });
        refs.push({ kind: "log", id });
      }
    }
    return refs;
  },
  async deleteLessonMemos(refs, authorId) {
    const since = Date.now() - RECENT;
    const ok = <T extends { id: string; authorId: string; createdAt: string; lessonItemId?: string | null }>(x: T, kind: LessonMemoRef["kind"]) =>
      refs.some((r) => r.kind === kind && r.id === x.id) && x.authorId === authorId && !!x.lessonItemId && Date.parse(x.createdAt) >= since;
    const ws = g.__schswriting;
    let n = 0;
    if (ws) { const before = ws.memos.length; ws.memos = ws.memos.filter((m) => !ok(m, "memo")); n += before - ws.memos.length; }
    const s = store();
    const before = s.logs.length;
    s.logs = s.logs.filter((l) => !ok(l, "log"));
    return n + before - s.logs.length;
  },
};

// ---------- Supabase ----------

type PlanRow = { id: string; school_year: number; scope_kind: LessonScopeKind; scope_id: string; title: string; source: "excel" | "doc"; file_name: string | null; created_by: string; created_at: string; updated_at: string };
type ItemRow = { id: string; plan_id: string; no: number; date: string | null; title: string; detail: string; position: number };
const toPlan = (r: PlanRow): LessonPlan => ({ id: r.id, schoolYear: r.school_year, scopeKind: r.scope_kind, scopeId: r.scope_id, title: r.title, source: r.source, fileName: r.file_name, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at });
const toItem = (r: ItemRow): LessonItem => ({ id: r.id, planId: r.plan_id, no: r.no, date: r.date, title: r.title, detail: r.detail, position: r.position });

export const supabaseLessons: LessonsRepo = {
  async getLessonPlan(scope, year) {
    const res = await db().from("lesson_plans").select("*").eq("scope_id", scope).eq("school_year", year).maybeSingle();
    if (missing(res.error)) return null;
    const p = check(res) as PlanRow | null;
    if (!p) return null;
    const items = check(await db().from("lesson_plan_items").select("*").eq("plan_id", p.id).order("position")) as ItemRow[];
    return { plan: toPlan(p), items: items.map(toItem) };
  },
  async getLessonItems(ids) {
    const list = ids.filter(isUuid);
    if (!list.length) return [];
    const res = await db().from("lesson_plan_items").select("*").in("id", list);
    if (missing(res.error)) return [];
    return (check(res) as ItemRow[]).map(toItem);
  },
  async saveLessonPlan(x) {
    const now = new Date().toISOString();
    const up = await db().from("lesson_plans")
      .upsert({ school_year: x.year, scope_kind: x.kind, scope_id: x.scope, title: x.title, source: x.source, file_name: x.fileName, created_by: x.authorId, updated_at: now }, { onConflict: "school_year,scope_kind,scope_id" })
      .select("*").single();
    if (missing(up.error)) throw new Error(NEED25);
    const plan = check(up) as PlanRow;
    const cur = check(await db().from("lesson_plan_items").select("id").eq("plan_id", plan.id)) as { id: string }[];
    const keep = new Set(x.items.map((i) => i.id).filter((id): id is string => !!id && isUuid(id)));
    const drop = cur.map((r) => r.id).filter((id) => !keep.has(id));
    if (drop.length) check(await db().from("lesson_plan_items").delete().in("id", drop));
    const rows = x.items.map((d, position) => ({ plan_id: plan.id, no: d.no, date: d.date, title: d.title, detail: d.detail, position }));
    const kept = x.items.map((d, i) => ({ d, i })).filter(({ d }) => d.id && keep.has(d.id) && cur.some((c) => c.id === d.id));
    for (const { d, i } of kept) check(await db().from("lesson_plan_items").update(rows[i]).eq("id", d.id!));
    const fresh = x.items.map((d, i) => ({ d, i })).filter(({ d }) => !(d.id && cur.some((c) => c.id === d.id)));
    if (fresh.length) check(await db().from("lesson_plan_items").insert(fresh.map(({ i }) => rows[i])));
    return (await supabaseLessons.getLessonPlan(x.scope, x.year))!;
  },
  async listLessonMarks(items) {
    const ids = items.filter(isUuid);
    if (!ids.length) return [];
    const [m, l, a] = await Promise.all([
      db().from("record_memos").select("student_id, lesson_item_id").in("lesson_item_id", ids),
      db().from("activity_logs").select("student_id, lesson_item_id").in("lesson_item_id", ids),
      db().from("common_activities").select("id, lesson_item_id").in("lesson_item_id", ids),
    ]);
    if (missing(m.error) || missing(l.error) || missing(a.error)) return [];
    const out: LessonMark[] = [];
    for (const r of [...(check(m) as { student_id: string; lesson_item_id: string }[]), ...(check(l) as { student_id: string; lesson_item_id: string }[])]) out.push({ itemId: r.lesson_item_id, studentId: r.student_id });
    const acts = check(a) as { id: string; lesson_item_id: string }[];
    if (acts.length) {
      const p = check(await db().from("common_activity_pieces").select("activity_id, student_id").in("activity_id", acts.map((x) => x.id))) as { activity_id: string; student_id: string }[];
      for (const r of p) out.push({ itemId: acts.find((x) => x.id === r.activity_id)!.lesson_item_id, studentId: r.student_id });
    }
    return out;
  },
  async addLessonMemos(rows) {
    const memoRows = rows.filter((r) => r.kind === "memo");
    const logRows = rows.filter((r) => r.kind === "log");
    const refs: LessonMemoRef[] = [];
    if (memoRows.length) {
      const res = await db().from("record_memos").insert(memoRows.map((r) => ({ scope: r.scope, student_id: r.studentId, author_id: r.authorId, content: r.content, lesson_item_id: r.itemId, date: r.date }))).select("id");
      if (missing(res.error)) throw new Error(NEED25);
      refs.push(...(check(res) as { id: string }[]).map((x) => ({ kind: "memo" as const, id: x.id })));
    }
    if (logRows.length) {
      const res = await db().from("activity_logs").insert(logRows.map((r) => ({ area: r.area, student_id: r.studentId, author_id: r.authorId, club_id: r.clubId, date: r.date, content: r.content, lesson_item_id: r.itemId }))).select("id");
      if (missing(res.error)) throw new Error(NEED25);
      refs.push(...(check(res) as { id: string }[]).map((x) => ({ kind: "log" as const, id: x.id })));
    }
    return refs;
  },
  async deleteLessonMemos(refs, authorId) {
    const since = new Date(Date.now() - RECENT).toISOString();
    let n = 0;
    for (const [kind, table] of [["memo", "record_memos"], ["log", "activity_logs"]] as const) {
      const ids = refs.filter((r) => r.kind === kind).map((r) => r.id).filter(isUuid);
      if (!ids.length) continue;
      const res = await db().from(table).delete().in("id", ids).eq("author_id", authorId).not("lesson_item_id", "is", null).gte("created_at", since).select("id");
      n += (check(res) as { id: string }[]).length;
    }
    return n;
  },
};
