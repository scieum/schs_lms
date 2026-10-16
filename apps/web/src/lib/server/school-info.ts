import "server-only";
import { compact, parseMeals, parseSchedule, type Meal, type SchoolEvent } from "@/lib/domain/school-info";

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
