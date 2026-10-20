import { describe, expect, it } from "vitest";
import {
  bytesLabel, bytesTone, copyAllLogsTsv, copyAllTsv, emptyLine, gatePass, logDate, logStats, logsSummary, logText,
  parseTextsTab, parseTextsWho, rowNumbers, showRows, sortLines, summaryLabel, textsSummary, type TextRow,
} from "./texts-view";

const ko = (n: number) => "가".repeat(n); // 한글 1자 = 3B
const row = (id: string, text: string, status: TextRow["status"]): TextRow => ({ id, no: id, name: `학생${id}`, text, bytes: text.length * 3, status });

describe("parse", () => {
  it("탭 · 확정만 기본값", () => {
    expect(parseTextsTab("logs")).toBe("logs");
    expect(parseTextsTab("x")).toBe("setuk");
    expect(parseTextsWho(undefined)).toBe("confirmed");
    expect(parseTextsWho("all")).toBe("all");
  });
});

describe("gatePass", () => {
  it("[한도 − 50, 한도] 안이면 통과", () => {
    expect(gatePass(ko(494), 1500)).toBe(true); // 1482B
    expect(gatePass(ko(500), 1500)).toBe(true); // 1500B
    expect(gatePass(ko(442), 1500)).toBe(false); // 1326B 짧음
    expect(gatePass(ko(501), 1500)).toBe(false); // 넘음
    expect(gatePass("", 1500)).toBe(false);
  });
});

describe("bytesTone", () => {
  it("넘음 · 짧음 · 안 · 없음", () => {
    expect(bytesTone(1538, 1500)).toBe("over");
    expect(bytesTone(1326, 1500)).toBe("short");
    expect(bytesTone(1482, 1500)).toBe("ok");
    expect(bytesTone(0, 1500)).toBe("none");
  });
});

describe("요약 · 보이는 행", () => {
  const rows = [row("1", ko(494), "confirmed"), row("2", ko(494), "draft"), row("3", ko(300), "confirmed"), row("4", "", "empty")];
  it("요약은 반 전체로 센다", () => {
    const s = textsSummary(rows, 1500);
    expect(s).toEqual({ students: 4, confirmed: 2, gate: 2 });
    expect(summaryLabel(s)).toBe("4명 · 확정 2 · 게이트 통과 2");
    expect(summaryLabel(s, true)).toBe("4명 · 확정 2 · 통과 2");
  });
  it("확정만이면 확정 행만", () => {
    expect(showRows(rows, "confirmed").map((r) => r.id)).toEqual(["1", "3"]);
    expect(showRows(rows, "all")).toHaveLength(4);
  });
});

describe("rowNumbers", () => {
  it("한 반이면 번호, 섞이면 학번", () => {
    expect(rowNumbers([{ grade: 2, classNo: 3, number: 1 }, { grade: 2, classNo: 3, number: 12 }])).toEqual(["1", "12"]);
    expect(rowNumbers([{ grade: 2, classNo: 3, number: 1 }, { grade: 2, classNo: 4, number: 2 }])).toEqual(["20301", "20402"]);
  });
});

describe("복사", () => {
  it("번호 · 이름 · 글 TSV (글 안 줄바꿈은 따옴표)", () => {
    expect(copyAllTsv([{ no: "1", name: "학생A", text: "글" }])).toBe("번호\t이름\t글\r\n1\t학생A\t글");
    expect(copyAllLogsTsv([{ id: "a", no: "1", name: "학생A", lines: [{ date: "2026-10-19", content: "가" }, { date: "2026-10-05", content: "나" }] }]))
      .toBe('번호\t이름\t글\r\n1\t학생A\t"10.19 가\n10.5 나"');
  });
});

describe("누가기록", () => {
  const lines = sortLines([{ date: "2026-09-21", content: ko(10) }, { date: "2026-10-19", content: "ab" }]);
  it("최신 위 · 날짜 줄임 · 건 · 바이트", () => {
    expect(lines[0].date).toBe("2026-10-19");
    expect(logDate("2026-09-21")).toBe("9.21");
    expect(logStats(lines)).toBe("2건 · 32B");
    expect(logText(lines)).toBe(`10.19 ab\n9.21 ${ko(10)}`);
    expect(logsSummary(12, [{ id: "a", no: "1", name: "A", lines }])).toBe("12명 · 기록 2건");
  });
});

describe("빈 화면 · 바이트", () => {
  it("문구", () => {
    expect(emptyLine("behavior", "confirmed", 28)).toBe("확정한 행발이 아직 없어요");
    expect(emptyLine("setuk", "all", 28)).toBe("쓴 세특이 아직 없어요");
    expect(emptyLine("record", "confirmed", 0)).toBe("이 반에 학생이 없어요");
    expect(emptyLine("logs", "confirmed", 3)).toBe("남긴 누가기록이 아직 없어요");
    expect(bytesLabel(1482)).toBe("1,482B");
  });
});
