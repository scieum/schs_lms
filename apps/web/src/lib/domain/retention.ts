// 자료 보존 기간 · 자동 파기 (Figma N39 ③). 순수 규칙만 — 지울 날 계산, 고를 수 있는 값, D-n 표시.
// 지우는 것: 학생이 올린 원본 파일(program-docs · service-docs) · 파일에서 읽은 글(program_materials.text).
// 지우지 않는 것: 확정한 초안 · 담임에게 보낸 기록 · 감사 로그(건수만). 숫자 값은 retention_settings 표에만 둔다(아래 DEFAULT 는 표가 없을 때만).

export type RetentionKey = "raw_files" | "extracted_text";
export type RetentionBase = "term_end" | "confirm" | "year_end";
export interface RetentionSetting { key: RetentionKey; days: number; base: RetentionBase }
export type RetentionSettings = Record<RetentionKey, RetentionSetting>;
/** 학기 마감 (MM-DD). 학사일정(app_state term_end_1 · term_end_2)에서, 없으면 7-31 · 1-31 */
export interface TermEnds { t1: string; t2: string }

export const DEFAULT_TERM_ENDS: TermEnds = { t1: "07-31", t2: "01-31" };
/** 표(0021)가 없을 때 쓰는 기본값. 실제 값은 retention_settings */
export const DEFAULT_RETENTION: RetentionSettings = {
  raw_files: { key: "raw_files", days: 30, base: "term_end" },
  extracted_text: { key: "extracted_text", days: 90, base: "term_end" },
};
/** 한 번 미루기: 프로그램(자료 묶음)당 1번, 지울 날 + 30일 */
export const HOLD_DAYS = 30;
/** 이 날 수 안이면 "곧 지워짐" (노랑) */
export const SOON_DAYS = 14;

export interface RetentionOption { value: string; label: string; base: RetentionBase; days: number }
const opt = (base: RetentionBase, days: number, label: string): RetentionOption => ({ value: `${base}:${days}`, label, base, days });

/** 고를 수 있는 값 (관리자가 이 안에서만 바꾼다) */
export const RETENTION_OPTIONS: Record<RetentionKey, RetentionOption[]> = {
  raw_files: [opt("confirm", 0, "초안 확정 뒤 바로"), opt("term_end", 7, "학기 마감 후 7일"), opt("term_end", 30, "학기 마감 후 30일"), opt("term_end", 90, "학기 마감 후 90일"), opt("year_end", 0, "학년 말(2월 말)")],
  extracted_text: [opt("term_end", 30, "학기 마감 후 30일"), opt("term_end", 90, "학기 마감 후 90일"), opt("term_end", 180, "학기 마감 후 180일"), opt("year_end", 0, "학년 말(2월 말)")],
};

export const RETENTION_LABEL: Record<RetentionKey, { title: string; desc: string; short: string }> = {
  raw_files: { title: "학생이 올린 원본 파일", desc: "PDF·사진·HWPX 원본. 초안을 만든 뒤에는 읽은 글만 있으면 돼요", short: "PDF·사진·HWPX 원본" },
  extracted_text: { title: "파일에서 읽은 글", desc: "이름·학번을 가린 글. 초안 근거로 쓰고, 확정 뒤에는 필요 없어요", short: "이름·학번을 가린 글" },
};

export const optionValue = (s: Pick<RetentionSetting, "base" | "days">) => `${s.base}:${s.days}`;
export function optionLabel(s: Pick<RetentionSetting, "base" | "days">): string {
  for (const list of Object.values(RETENTION_OPTIONS)) {
    const o = list.find((x) => x.value === optionValue(s));
    if (o) return o.label;
  }
  return s.base === "term_end" ? `학기 마감 후 ${s.days}일` : s.base === "year_end" ? "학년 말(2월 말)" : "초안 확정 뒤 바로";
}

/** 폼 값 → 설정. 고를 수 있는 값이 아니면 null (서버 액션이 거절) */
export function parseOption(key: RetentionKey, value: string): RetentionSetting | null {
  const o = RETENTION_OPTIONS[key].find((x) => x.value === value);
  return o ? { key, base: o.base, days: o.days } : null;
}

/** 저장된 값이 이상하면(범위 밖·모르는 기준) 기본값으로 */
export function sanitizeSetting(key: RetentionKey, s: Partial<RetentionSetting> | null | undefined): RetentionSetting {
  const base = s?.base;
  const days = Number(s?.days);
  if ((base === "term_end" || base === "confirm" || base === "year_end") && Number.isInteger(days) && days >= 0 && days <= 365) return { key, base, days };
  return DEFAULT_RETENTION[key];
}

// ---------- 날짜 ----------

const DAY = 86400000;
const dayNum = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY;
export const addDays = (ymd: string, n: number) => new Date((dayNum(ymd) + n) * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);
const validMd = (md: string | null | undefined) => (md && /^\d{2}-\d{2}$/.test(md) ? md : null);

/** 날짜가 속한 학년도·학기: 3~8월 = 그해 1학기, 9~12월 = 그해 2학기, 1~2월 = 지난해 2학기 */
export function termOf(ymd: string): { year: number; semester: 1 | 2 } {
  const y = +ymd.slice(0, 4);
  const m = +ymd.slice(5, 7);
  if (m >= 3 && m <= 8) return { year: y, semester: 1 };
  if (m >= 9) return { year: y, semester: 2 };
  return { year: y - 1, semester: 2 };
}

/** 학기 마감 날짜 (1학기 = 그해 7-31, 2학기 = 다음 해 1-31 — 학사일정 값이 있으면 그것) */
export function termEndDate(year: number, semester: 1 | 2, ends: Partial<TermEnds> = {}): string {
  if (semester === 1) return `${year}-${validMd(ends.t1) ?? DEFAULT_TERM_ENDS.t1}`;
  return `${year + 1}-${validMd(ends.t2) ?? DEFAULT_TERM_ENDS.t2}`;
}

/** 학년 말 = 다음 해 2월 마지막 날 */
export function yearEndDate(year: number): string {
  const y = year + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-02-${leap ? 29 : 28}`;
}

export interface DueInput {
  /** 자료 묶음의 기준 날짜 (프로그램 마감일 · 봉사 날짜) — 학기를 정한다 */
  refDate: string;
  setting: Pick<RetentionSetting, "base" | "days">;
  termEnds?: Partial<TermEnds>;
  /** 초안 확정이 모두 끝난 날 (base=confirm 일 때만). 아직이면 null → 지울 날 없음 */
  confirmedAt?: string | null;
  /** 한 번 미루기로 늦춘 날 (있으면 이 날과 계산한 날 중 늦은 날) */
  holdUntil?: string | null;
}

/** 지울 날 (YYYY-MM-DD). base=confirm 인데 아직 확정이 안 끝났으면 null */
export function dueDate(x: DueInput): string | null {
  const t = termOf(x.refDate);
  let due: string | null;
  if (x.setting.base === "confirm") due = x.confirmedAt ? addDays(x.confirmedAt.slice(0, 10), x.setting.days) : null;
  else if (x.setting.base === "year_end") due = addDays(yearEndDate(t.year), x.setting.days);
  else due = addDays(termEndDate(t.year, t.semester, x.termEnds), x.setting.days);
  if (due && x.holdUntil && x.holdUntil > due) due = x.holdUntil;
  return due;
}

/** 미루면 지울 날 = 지금 지울 날 + 30일 */
export const holdUntilFrom = (due: string) => addDays(due, HOLD_DAYS);

export const isDue = (due: string | null, today: string) => !!due && due <= today;

/** 남은 날 칩: "D-13 곧 지워짐"(14일 이내, 노랑) · "D-134"(회색) · "오늘 지워짐" */
export function dueChip(due: string | null, today: string): { label: string; soon: boolean; days: number | null } {
  if (!due) return { label: "확정 뒤", soon: false, days: null };
  const n = daysBetween(today, due);
  if (n <= 0) return { label: "오늘 지워짐", soon: true, days: 0 };
  return n <= SOON_DAYS ? { label: `D-${n} 곧 지워짐`, soon: true, days: n } : { label: `D-${n}`, soon: false, days: n };
}

/** 교사 화면 안내 한 줄 ("이 자료는 2027-03-02에 지워져요" / "13일 뒤 지워져요") */
export function noticeLine(due: string | null, today: string): { title: string; soon: boolean } {
  if (!due) return { title: "초안을 모두 확정하면 원본 파일이 지워져요", soon: false };
  const n = daysBetween(today, due);
  if (n <= SOON_DAYS) return { title: n <= 0 ? "이 자료는 오늘 지워져요" : `${n}일 뒤 지워져요 (${due})`, soon: true };
  return { title: `이 자료는 ${due}에 지워져요`, soon: false };
}

/** 기준 설명: "2학기 마감(2027-01-31) 후 30일" */
export function baseLine(refDate: string, s: Pick<RetentionSetting, "base" | "days">, ends?: Partial<TermEnds>): string {
  const t = termOf(refDate);
  if (s.base === "confirm") return "초안 확정 뒤 바로";
  if (s.base === "year_end") return `학년 말(${yearEndDate(t.year)})`;
  return `${t.semester}학기 마감(${termEndDate(t.year, t.semester, ends)}) 후 ${s.days}일`;
}

/** 감사 로그 대상 (건수만): "프로그램 1개 · 원본 48개 · 글 48건 파기" */
export function purgeAuditLine(r: { programs: number; files: number; texts: number }): string {
  return `프로그램 ${r.programs}개 · 원본 ${r.files}개 · 글 ${r.texts}건 파기`;
}

/** 오늘 (한국 시간 YYYY-MM-DD) — 크론은 UTC 18시(= KST 03시)에 돈다 */
export const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** 다음 크론 전에 다시 돌려야 하나 (관리자가 화면을 열 때): 마지막 실행이 24시간 넘었으면 */
export function needsVisitRun(lastRunAt: string | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - new Date(lastRunAt).getTime() > 24 * 3600000;
}
