import { describe, expect, it } from "vitest";
import {
  baseLine, DEFAULT_RETENTION, dueChip, dueDate, holdUntilFrom, isDue, needsVisitRun, noticeLine, parseOption, purgeAuditLine,
  sanitizeSetting, termEndDate, termOf, yearEndDate,
} from "./retention";

describe("보존 기간 (N39)", () => {
  it("학기: 3~8월 1학기, 9~12월 2학기, 1~2월은 지난해 2학기", () => {
    expect(termOf("2026-04-10")).toEqual({ year: 2026, semester: 1 });
    expect(termOf("2026-10-23")).toEqual({ year: 2026, semester: 2 });
    expect(termOf("2027-01-15")).toEqual({ year: 2026, semester: 2 });
  });

  it("학기 마감: 기본 7-31 · 다음 해 1-31, 학사일정 값이 있으면 그것", () => {
    expect(termEndDate(2026, 1)).toBe("2026-07-31");
    expect(termEndDate(2026, 2)).toBe("2027-01-31");
    expect(termEndDate(2026, 2, { t2: "02-05" })).toBe("2027-02-05");
    expect(termEndDate(2026, 1, { t1: "7월" })).toBe("2026-07-31");
  });

  it("학년 말 = 다음 해 2월 마지막 날 (윤년)", () => {
    expect(yearEndDate(2026)).toBe("2027-02-28");
    expect(yearEndDate(2027)).toBe("2028-02-29");
  });

  it("원본 파일 기본값: 2학기 프로그램은 2027-03-02, 읽은 글은 2027-05-01", () => {
    expect(dueDate({ refDate: "2026-10-23", setting: DEFAULT_RETENTION.raw_files })).toBe("2027-03-02");
    expect(dueDate({ refDate: "2026-10-23", setting: DEFAULT_RETENTION.extracted_text })).toBe("2027-05-01");
    expect(dueDate({ refDate: "2026-05-10", setting: DEFAULT_RETENTION.raw_files })).toBe("2026-08-30");
  });

  it("초안 확정 뒤 바로: 확정이 끝나야 날이 생긴다", () => {
    const s = { base: "confirm" as const, days: 0 };
    expect(dueDate({ refDate: "2026-10-23", setting: s, confirmedAt: null })).toBeNull();
    expect(dueDate({ refDate: "2026-10-23", setting: s, confirmedAt: "2026-11-02T03:00:00Z" })).toBe("2026-11-02");
  });

  it("학년 말 기준", () => {
    expect(dueDate({ refDate: "2026-04-01", setting: { base: "year_end", days: 0 } })).toBe("2027-02-28");
  });

  it("한 번 미루기: +30일, 계산한 날보다 늦을 때만", () => {
    expect(holdUntilFrom("2027-03-02")).toBe("2027-04-01");
    expect(dueDate({ refDate: "2026-10-23", setting: DEFAULT_RETENTION.raw_files, holdUntil: "2027-04-01" })).toBe("2027-04-01");
    expect(dueDate({ refDate: "2026-10-23", setting: DEFAULT_RETENTION.raw_files, holdUntil: "2027-01-01" })).toBe("2027-03-02");
  });

  it("지울 때가 됐나", () => {
    expect(isDue("2026-10-19", "2026-10-19")).toBe(true);
    expect(isDue("2026-10-20", "2026-10-19")).toBe(false);
    expect(isDue(null, "2026-10-19")).toBe(false);
  });

  it("남은 날 칩: 14일 이내 노랑", () => {
    expect(dueChip("2026-11-01", "2026-10-19")).toEqual({ label: "D-13 곧 지워짐", soon: true, days: 13 });
    expect(dueChip("2027-03-02", "2026-10-19")).toEqual({ label: "D-134", soon: false, days: 134 });
    expect(dueChip("2026-10-19", "2026-10-19").label).toBe("오늘 지워짐");
    expect(dueChip(null, "2026-10-19").label).toBe("확정 뒤");
  });

  it("교사 안내 한 줄", () => {
    expect(noticeLine("2027-03-02", "2026-10-19")).toEqual({ title: "이 자료는 2027-03-02에 지워져요", soon: false });
    expect(noticeLine("2026-11-01", "2026-10-19")).toEqual({ title: "13일 뒤 지워져요 (2026-11-01)", soon: true });
    expect(baseLine("2026-10-23", DEFAULT_RETENTION.raw_files)).toBe("2학기 마감(2027-01-31) 후 30일");
  });

  it("고를 수 있는 값만 저장", () => {
    expect(parseOption("raw_files", "term_end:7")).toEqual({ key: "raw_files", base: "term_end", days: 7 });
    expect(parseOption("raw_files", "term_end:999")).toBeNull();
    expect(parseOption("extracted_text", "confirm:0")).toBeNull();
    expect(sanitizeSetting("raw_files", { base: "term_end", days: -3 })).toEqual(DEFAULT_RETENTION.raw_files);
    expect(sanitizeSetting("extracted_text", { base: "year_end", days: 0 })).toEqual({ key: "extracted_text", base: "year_end", days: 0 });
  });

  it("감사 로그는 건수만", () => {
    expect(purgeAuditLine({ programs: 1, files: 48, texts: 48 })).toBe("프로그램 1개 · 원본 48개 · 글 48건 파기");
  });

  it("관리자 방문 때 다시 돌리기: 24시간 넘었으면", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    expect(needsVisitRun(null, now)).toBe(true);
    expect(needsVisitRun("2026-10-18T18:00:00Z", now)).toBe(false);
    expect(needsVisitRun("2026-10-18T09:00:00Z", now)).toBe(true);
  });
});
