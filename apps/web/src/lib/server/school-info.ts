import "server-only";
import { compact, dropNeisDuplicates, mergeDays, nextMealDay, parseMeals, parseSchedule, type Meal, type SchoolEvent } from "@/lib/domain/school-info";
import { repo } from "@/lib/server/repo";

// 나이스 교육정보 개방 포털: 키 없이도 조회된다(건수 제한). NEIS_API_KEY 를 넣으면 제한이 풀린다.
// 학교: 강원특별자치도교육청(K10) 속초고등학교(7801152). 다른 학교면 env 로 바꾼다.
const BASE = "https://open.neis.go.kr/hub/";
const OFFICE = process.env.NEIS_OFFICE_CODE || "K10";
const SCHOOL = process.env.NEIS_SCHOOL_CODE || "7801152";

async function neis(service: string, params: Record<string, string>): Promise<unknown | null> {
  const q = new URLSearchParams({ Type: "json", pIndex: "1", pSize: "200", ATPT_OFCDC_SC_CODE: OFFICE, SD_SCHUL_CODE: SCHOOL, ...params });
  if (process.env.NEIS_API_KEY) q.set("KEY", process.env.NEIS_API_KEY);
  try {
    // 한 시간 동안 같은 요청은 다시 묻지 않는다 (급식·학사일정은 하루에 몇 번 안 바뀜)
    const r = await fetch(`${BASE}${service}?${q}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** 급식 (기간). 못 가져오면 null — 화면은 "불러오지 못했어요" */
export async function getMeals(from: string, to: string): Promise<Meal[] | null> {
  const j = await neis("mealServiceDietInfo", { MLSV_FROM_YMD: compact(from), MLSV_TO_YMD: compact(to) });
  return j ? parseMeals(j) : null;
}

/** 학사일정 (기간) */
export async function getSchedule(from: string, to: string): Promise<SchoolEvent[] | null> {
  const j = await neis("SchoolSchedule", { AA_FROM_YMD: compact(from), AA_TO_YMD: compact(to) });
  return j ? parseSchedule(j) : null;
}

/**
 * 학사일정 = 나이스(이어진 날은 기간 하나로) + 직접 추가한 일정. 나이스를 못 가져와도 직접 추가한 일정은 보인다.
 * neisOk 가 false 면 화면에 "나이스 일정을 불러오지 못했어요"를 함께 띄운다.
 */
export async function getEvents(from: string, to: string): Promise<{ events: SchoolEvent[]; neisOk: boolean }> {
  const [neis, custom, teachers] = await Promise.all([getSchedule(from, to), repo.listCustomEvents(from, to), repo.listTeachers()]);
  const names = new Map(teachers.map((t) => [t.id, `${t.name} 선생님`]));
  const mine: SchoolEvent[] = custom.map((c) => ({
    date: c.startDate, endDate: c.endDate, name: c.title, grades: c.grades, holiday: c.holiday,
    // 학생이 올린 일정은 이름 대신 "학생"으로 (다른 학생에게 이름이 보이지 않게)
    custom: { id: c.id, authorId: c.authorId, authorName: names.get(c.authorId) ?? "학생", memo: c.memo, dept: c.dept, imported: !!c.source },
  }));
  const fromNeis = dropNeisDuplicates(mergeDays(neis ?? []), mine);
  return { events: [...fromNeis, ...mine].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)), neisOk: !!neis };
}

/** 급식 하루치: dir 0 = 이날(없으면 그다음), 1 = 다음 급식일, -1 = 이전 급식일 (2주 안에서 찾음) */
export async function getMealDay(date: string, dir: -1 | 0 | 1): Promise<{ date: string; meals: Meal[] } | null | "error"> {
  const shift = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const from = dir === -1 ? shift(date, -14) : dir === 1 ? shift(date, 1) : date;
  const to = dir === -1 ? shift(date, -1) : shift(date, 14);
  const meals = await getMeals(from, to);
  if (!meals) return "error";
  if (dir === -1) {
    const day = meals.at(-1)?.date;
    return day ? { date: day, meals: meals.filter((m) => m.date === day) } : null;
  }
  return nextMealDay(meals, from);
}
