import "server-only";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";
import seed2026 from "../seed/school-events-2026.json";

// 직접 추가한 학사일정 (교사·학생 누구나). 나이스 일정과 함께 보이고, 올린 사람(또는 관리자)만 고치거나 지운다.
// 표는 0014_school_events.sql. 적용 전 DB면 읽기는 빈 목록, 쓰기는 안내 문구로 실패한다.

export interface CustomEvent {
  id: string; title: string; startDate: string; endDate: string; grades: number[]; memo: string | null; authorId: string; createdAt: string;
  /** 휴업일·공휴일 */
  holiday: boolean;
  /** 담당 부서 (온라인 교무실에서 옮긴 일정) */
  dept: string | null;
  /** 어디서 왔나: null = 앱에서 직접 추가, "notion-2026" = 온라인 교무실(노션) 학사일정 DB */
  source: string | null;
}
export type NewCustomEvent = Omit<CustomEvent, "id" | "createdAt" | "holiday" | "dept" | "source"> & Partial<Pick<CustomEvent, "holiday" | "dept" | "source">>;

export interface EventsRepo {
  listCustomEvents(from: string, to: string): Promise<CustomEvent[]>;
  getCustomEvent(id: string): Promise<CustomEvent | null>;
  addCustomEvent(e: NewCustomEvent): Promise<CustomEvent>;
  updateCustomEvent(id: string, patch: Partial<Omit<NewCustomEvent, "authorId">>): Promise<void>;
  deleteCustomEvent(id: string): Promise<void>;
}

const g = globalThis as unknown as { __schsevents?: CustomEvent[] };
const es = () => {
  store();
  // 데모: 온라인 교무실에서 옮긴 2026 학사일정 + 직접 추가한 예시 하나
  return (g.__schsevents ??= [
    ...(seed2026 as { title: string; startDate: string; endDate: string; grades: number[]; memo: string | null; holiday: boolean; dept: string | null }[]).map((e) => ({
      ...e, id: crypto.randomUUID(), authorId: "t-admin", createdAt: "2026-10-17T00:00:00Z", source: "notion-2026",
    })),
    { id: crypto.randomUUID(), title: "독서 주간", startDate: "2026-10-16", endDate: "2026-10-22", grades: [], memo: "도서관 대출 2배", authorId: "t-subject", createdAt: new Date().toISOString(), holiday: false, dept: null, source: null },
  ]);
};
const overlaps = (e: CustomEvent, from: string, to: string) => e.startDate <= to && e.endDate >= from;

export const demoEvents: EventsRepo = {
  async listCustomEvents(from, to) {
    return es().filter((e) => overlaps(e, from, to)).map((e) => ({ ...e, grades: [...e.grades] }));
  },
  async getCustomEvent(id) {
    const e = es().find((x) => x.id === id);
    return e ? { ...e } : null;
  },
  async addCustomEvent(e) {
    const row: CustomEvent = { holiday: false, dept: null, source: null, ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    es().push(row);
    return row;
  },
  async updateCustomEvent(id, patch) {
    const e = es().find((x) => x.id === id);
    if (e) Object.assign(e, patch);
  },
  async deleteCustomEvent(id) {
    g.__schsevents = es().filter((x) => x.id !== id);
  },
};

type Row = {
  id: string; title: string; start_date: string; end_date: string; grades: number[] | null; memo: string | null; author_id: string; created_at: string;
  holiday?: boolean | null; dept?: string | null; source?: string | null;
};
const toEvent = (r: Row): CustomEvent => ({
  id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date, grades: r.grades ?? [], memo: r.memo, authorId: r.author_id, createdAt: r.created_at,
  holiday: !!r.holiday, dept: r.dept ?? null, source: r.source ?? null,
});
const missing = (e: { message: string } | null) => !!e && /school_events/.test(e.message);
const NEED = "일정을 저장하려면 DB 업데이트(0014)가 필요해요. 관리자에게 알려 주세요";

export const supabaseEvents: EventsRepo = {
  async listCustomEvents(from, to) {
    const res = await db().from("school_events").select("*").lte("start_date", to).gte("end_date", from);
    if (missing(res.error)) return [];
    return (check(res) as Row[]).map(toEvent);
  },
  async getCustomEvent(id) {
    if (!isUuid(id)) return null;
    const res = await db().from("school_events").select("*").eq("id", id).maybeSingle();
    if (missing(res.error)) return null;
    const r = check(res);
    return r ? toEvent(r as Row) : null;
  },
  async addCustomEvent(e) {
    const res = await db().from("school_events").insert({ title: e.title, start_date: e.startDate, end_date: e.endDate, grades: e.grades, memo: e.memo, author_id: e.authorId }).select("*").single();
    if (missing(res.error)) throw new Error(NEED);
    return toEvent(check(res) as Row);
  },
  async updateCustomEvent(id, p) {
    if (!isUuid(id)) return;
    const row: Partial<Row> = {};
    if (p.title !== undefined) row.title = p.title;
    if (p.startDate !== undefined) row.start_date = p.startDate;
    if (p.endDate !== undefined) row.end_date = p.endDate;
    if (p.grades !== undefined) row.grades = p.grades;
    if (p.memo !== undefined) row.memo = p.memo;
    const res = await db().from("school_events").update(row).eq("id", id);
    if (missing(res.error)) throw new Error(NEED);
    check(res);
  },
  async deleteCustomEvent(id) {
    if (!isUuid(id)) return;
    const res = await db().from("school_events").delete().eq("id", id);
    if (missing(res.error)) throw new Error(NEED);
    check(res);
  },
};
