// 나이스 교육정보 개방 포털(open.neis.go.kr) 응답 다루기: 급식 식단(mealServiceDietInfo) · 학사일정(SchoolSchedule).
// 가져오기는 lib/server/school-info.ts, 여기는 응답 → 화면용 모양 (순수 함수).

export type MealKind = "조식" | "중식" | "석식";
export interface Dish { name: string; allergens: number[] }
export interface Meal { date: string; kind: MealKind; dishes: Dish[]; kcal: string | null }
/** 학사일정 한 건. date~endDate 기간 (하루면 같음). custom 이면 교사·학생이 직접 추가한 일정 */
export interface SchoolEvent {
  date: string; endDate: string; name: string; grades: number[]; holiday: boolean;
  custom?: { id: string; authorId: string; authorName: string; memo: string | null; dept: string | null; imported: boolean };
}

/** 알레르기 번호 (식품 알레르기 표시 기준) */
export const ALLERGENS: Record<number, string> = {
  1: "난류", 2: "우유", 3: "메밀", 4: "땅콩", 5: "대두", 6: "밀", 7: "고등어", 8: "게", 9: "새우", 10: "돼지고기",
  11: "복숭아", 12: "토마토", 13: "아황산류", 14: "호두", 15: "닭고기", 16: "쇠고기", 17: "오징어", 18: "조개류", 19: "잣",
};

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
export const compact = (d: string) => d.replace(/-/g, "");

type Rows<T> = Record<string, [unknown, { row?: T[] }?]>;
function rowsOf<T>(json: unknown, key: string): T[] {
  const block = (json as Rows<T>)?.[key];
  return (Array.isArray(block) ? block[1]?.row : undefined) ?? [];
}

/** "참치김치찌개 (5.9)" → { name: "참치김치찌개", allergens: [5, 9] } */
export function parseDish(raw: string): Dish | null {
  const t = raw.replace(/<[^>]+>/g, "").trim();
  if (!t) return null;
  const m = t.match(/\(([\d.\s]+)\)\s*$/);
  const allergens = m ? m[1].split(".").map((x) => Number(x.trim())).filter((x) => x > 0 && x < 30) : [];
  const name = (m ? t.slice(0, m.index) : t).replace(/[*#]+$/, "").trim();
  return name ? { name, allergens } : null;
}

export function parseMeals(json: unknown): Meal[] {
  return rowsOf<{ MLSV_YMD: string; MMEAL_SC_NM: string; DDISH_NM: string; CAL_INFO?: string }>(json, "mealServiceDietInfo")
    .map((r) => ({
      date: ymd(r.MLSV_YMD),
      kind: (["조식", "중식", "석식"].includes(r.MMEAL_SC_NM) ? r.MMEAL_SC_NM : "중식") as MealKind,
      dishes: r.DDISH_NM.split(/<br\s*\/?>/i).map(parseDish).filter((d): d is Dish => !!d),
      kcal: r.CAL_INFO?.trim() || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || "조식중식석식".indexOf(a.kind) - "조식중식석식".indexOf(b.kind));
}

export function parseSchedule(json: unknown): SchoolEvent[] {
  const yes = (v?: string) => v === "Y";
  return rowsOf<{ AA_YMD: string; EVENT_NM: string; SBTR_DD_SC_NM?: string; ONE_GRADE_EVENT_YN?: string; TW_GRADE_EVENT_YN?: string; THREE_GRADE_EVENT_YN?: string }>(json, "SchoolSchedule")
    .filter((r) => r.EVENT_NM && r.EVENT_NM !== "토요휴업일")
    .map((r) => ({
      date: ymd(r.AA_YMD),
      endDate: ymd(r.AA_YMD),
      name: r.EVENT_NM.trim(),
      grades: [yes(r.ONE_GRADE_EVENT_YN) && 1, yes(r.TW_GRADE_EVENT_YN) && 2, yes(r.THREE_GRADE_EVENT_YN) && 3].filter((x): x is number => !!x),
      holiday: /휴업|공휴/.test(r.SBTR_DD_SC_NM ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 오늘(없으면 그다음) 급식 하루치 */
export function nextMealDay(meals: Meal[], today: string): { date: string; meals: Meal[] } | null {
  const day = meals.find((m) => m.date >= today)?.date;
  return day ? { date: day, meals: meals.filter((m) => m.date === day) } : null;
}

const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

/** 나이스는 여러 날 일정(예: 고사 기간)을 날마다 따로 준다 → 이어진 같은 이름은 기간 하나로 */
export function mergeDays(events: SchoolEvent[]): SchoolEvent[] {
  const out: SchoolEvent[] = [];
  for (const e of [...events].sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date))) {
    const last = out.at(-1);
    if (last && !last.custom && !e.custom && last.name === e.name && last.holiday === e.holiday && nextDay(last.endDate) >= e.date) {
      if (e.endDate > last.endDate) last.endDate = e.endDate;
      last.grades = [...new Set([...last.grades, ...e.grades])].sort();
      continue;
    }
    out.push({ ...e, grades: [...e.grades] });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export type EventStatus = "진행 중" | "시작 전" | "완료" | "휴업일";

/** 오늘 기준 상태 (휴업일·공휴일은 따로) */
export function eventStatus(e: Pick<SchoolEvent, "date" | "endDate" | "holiday">, today: string): EventStatus {
  if (e.holiday) return "휴업일";
  if (e.endDate < today) return "완료";
  if (e.date > today) return "시작 전";
  return "진행 중";
}

const norm = (s: string) => s.replace(/[\s·()]/g, "");

/**
 * 나이스 일정과 직접(또는 온라인 교무실에서) 넣은 일정이 겹치면 한 번만 보인다:
 * 같은 날 같은 이름, 또는 같은 날 둘 다 휴업일이면 나이스 쪽을 뺀다
 */
export function dropNeisDuplicates(neis: SchoolEvent[], custom: SchoolEvent[]): SchoolEvent[] {
  return neis.filter((n) => !custom.some((c) => c.date <= n.date && c.endDate >= n.date && (norm(c.name) === norm(n.name) || (c.holiday && n.holiday) || norm(c.name).includes(norm(n.name)))));
}

/** 학년 거르기: 학생은 자기 학년(또는 전체) 일정만 */
export const forGrade = (events: SchoolEvent[], grade?: number) =>
  grade ? events.filter((e) => !e.grades.length || e.grades.length === 3 || e.grades.includes(grade)) : events;
