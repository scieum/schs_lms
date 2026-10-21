import "server-only";
import { isLevel, scaleOf, type Level, type ScaleKey } from "@/lib/domain/achievement";
import { schoolYear } from "@/lib/domain/curriculum";
import { check, db, isUuid, selectIn } from "../supabase";

// 성취수준 (Figma N35 ③): 세특 과목·학생·학년도·학기마다 하나 (achievement_levels, 0020).
// 학교 설정 단계는 app_state 키 achievement_scale ("A-E" | "상중하"). 적용 전 DB면 읽기는 빈 값, 저장은 안내 문구로 실패.

export type LevelKey = { courseId: string; year: number; semester: number };

export interface LevelsRepo {
  /** 학생 id → 수준 (정하지 않은 학생은 없음) */
  listLevels(k: LevelKey, studentIds: string[]): Promise<Record<string, Level>>;
  /** level = null 이면 지운다 */
  setLevels(k: LevelKey, items: { studentId: string; level: Level | null }[], authorId: string): Promise<void>;
  getAchievementScale(): Promise<ScaleKey>;
  setAchievementScale(scale: ScaleKey): Promise<void>;
}

// ---------- 데모 ----------

const g = globalThis as unknown as { __schslevels?: Map<string, Level>; __schsscale?: ScaleKey };
const key = (k: LevelKey, sid: string) => `${k.courseId}|${k.year}|${k.semester}|${sid}`;
function levels(): Map<string, Level> {
  if (!g.__schslevels) {
    // 물리학(c-4) 예시: 몇 명만 정해 둔다 (배지 · "성취수준 n / m명")
    const base = { courseId: "c-4", year: schoolYear(), semester: 1 };
    void base; // 공유용 깨끗한 데모: 성취수준은 비워 둔다
    g.__schslevels = new Map();
  }
  return g.__schslevels;
}

export const demoLevels: LevelsRepo = {
  async listLevels(k, ids) {
    const out: Record<string, Level> = {};
    for (const id of ids) {
      const l = levels().get(key(k, id));
      if (l) out[id] = l;
    }
    return out;
  },
  async setLevels(k, items) {
    for (const it of items) {
      if (it.level) levels().set(key(k, it.studentId), it.level);
      else levels().delete(key(k, it.studentId));
    }
  },
  async getAchievementScale() {
    return g.__schsscale ?? "A-E";
  },
  async setAchievementScale(scale) {
    g.__schsscale = scale;
  },
};

// ---------- Supabase ----------

const NEED20 = "성취수준을 저장하려면 DB 업데이트(0020)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /achievement_levels/.test(e.message);

export const supabaseLevels: LevelsRepo = {
  async listLevels(k, studentIds) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return {};
    try {
      const rows = await selectIn<{ student_id: string; level: string }>(ids, (part) =>
        db().from("achievement_levels").select("student_id, level").eq("course_id", k.courseId).eq("school_year", k.year).eq("semester", k.semester).in("student_id", part));
      const out: Record<string, Level> = {};
      for (const r of rows) if (isLevel(r.level)) out[r.student_id] = r.level;
      return out;
    } catch (e) {
      if (e instanceof Error && /achievement_levels/.test(e.message)) return {};
      throw e;
    }
  },
  async setLevels(k, items, authorId) {
    const put = items.filter((x) => x.level && isUuid(x.studentId));
    const del = items.filter((x) => !x.level && isUuid(x.studentId)).map((x) => x.studentId);
    const at = new Date().toISOString();
    if (put.length) {
      const res = await db().from("achievement_levels").upsert(
        put.map((x) => ({ course_id: k.courseId, student_id: x.studentId, school_year: k.year, semester: k.semester, level: x.level, author_id: isUuid(authorId) ? authorId : null, updated_at: at })),
        { onConflict: "course_id,student_id,school_year,semester" },
      );
      if (missing(res.error)) throw new Error(NEED20);
      check(res);
    }
    if (del.length) {
      const res = await db().from("achievement_levels").delete().eq("course_id", k.courseId).eq("school_year", k.year).eq("semester", k.semester).in("student_id", del);
      if (missing(res.error)) throw new Error(NEED20);
      check(res);
    }
  },
  async getAchievementScale() {
    const r = await db().from("app_state").select("value").eq("key", "achievement_scale").maybeSingle();
    return r.error || !r.data ? "A-E" : scaleOf((r.data as { value: unknown }).value);
  },
  async setAchievementScale(scale) {
    check(await db().from("app_state").upsert({ key: "achievement_scale", value: scale, updated_at: new Date().toISOString() }));
  },
};
