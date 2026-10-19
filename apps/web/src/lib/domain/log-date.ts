import { addDays } from "./night";

// 누가기록 한 명씩 (Figma N32): 날짜 칩 [오늘 10.19 | 어제 | 날짜]

export type DateChip = "today" | "yesterday" | "pick";

/** "2026-10-19" → "10.19" */
export const shortMd = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}` : "");

/** 칩이 가리키는 날짜 (날짜 칩은 고른 날짜, 비면 오늘) */
export function chipDate(chip: DateChip, today: string, picked: string): string {
  if (chip === "today") return today;
  if (chip === "yesterday") return addDays(today, -1);
  return /^\d{4}-\d{2}-\d{2}$/.test(picked) ? picked : today;
}

/** 달력에서 고른 날짜가 오늘·어제면 그 칩으로 */
export function chipOf(date: string, today: string): DateChip {
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  return "pick";
}
