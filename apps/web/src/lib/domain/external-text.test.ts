import { describe, expect, it } from "vitest";
import { readTemplate, TEMPLATES } from "./excel-template";
import {
  cleanExternalText, cleanNote, draftOrigin, EXTERNAL_TEXT_MAX, externalAuditLine, externalCounts, planExternal, scanExternal, type ExistingDraft,
} from "./external-text";
import type { Student } from "./types";

const st = (id: string, grade: number, classNo: number, number: number, name: string) =>
  ({ id, pseudonymId: id, studentNo: `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade, classNo, number, name, gender: "남", track: 1, careerGoal: null }) as Student;
const students = [st("a", 2, 3, 1, "학생A"), st("b", 2, 3, 2, "학생B"), st("c", 2, 3, 3, "학생C"), st("d", 2, 3, 4, "학생D"), st("h", 2, 1, 8, "학생H")];
const head = [...TEMPLATES.external.legacy!];

describe("외부 글 양식 (N46)", () => {
  it("1행 제목이 양식과 같을 때만 읽는다 (N25)", () => {
    expect(readTemplate([head, ["20301", "2", "3", "1", "학생A", "글"]], "external")).toEqual([{ line: 2, cells: ["20301", "2", "3", "1", "학생A", "글"] }]);
    expect(readTemplate([["학번", "학년", "반", "번호", "이름"], ["20301"]], "external")).toBeNull();
    expect(readTemplate([[...head, "비고"]], "external")).toBeNull();
  });

  it("학생을 맞추고 못 찾음 · 빈 글 · 겹침 · 너무 긴 글을 줄 번호로 나눈다", () => {
    const existing = (id: string): ExistingDraft => (id === "b" ? "draft" : id === "c" ? "finalized" : "none");
    const body = readTemplate([
      head,
      ["20301", "2", "3", "1", "학생A", "  탐구 캠프에 참여함.\r\n발표함.  "],
      ["", "2", "3", "2", "학생B", "새 글."],
      ["20303", "", "", "", "학생C", "확정된 학생 글."],
      ["20399", "", "", "", "학생Q", "없는 학생."],
      ["20304", "2", "3", "4", "학생X", "이름이 다름."],
      ["20301", "", "", "", "학생A", "두 번째 줄."],
      ["20108", "", "", "", "학생H", "대상 아님."],
      ["20304", "", "", "", "학생D", ""],
      ["", "", "", "", "", "학생 칸이 빈 글"],
      ["20302", "", "", "", "", "x".repeat(EXTERNAL_TEXT_MAX + 1)],
    ], "external")!;
    const scan = scanExternal(body, students, { targetIds: ["a", "b", "c", "d"], existing });
    expect(scan.found.map((x) => [x.studentId, x.line, x.target, x.existing])).toEqual([
      ["a", 2, true, "none"], ["b", 3, true, "draft"], ["c", 4, true, "finalized"], ["h", 8, false, "none"],
    ]);
    expect(scan.found[0].text).toBe("탐구 캠프에 참여함.\n발표함.");
    expect(scan.unmatched.map((u) => u.line)).toEqual([5, 6, 10]);
    expect(scan.unmatched[0].text).toBe("20399 학생Q");
    expect(scan.duplicates).toEqual([7, 11]);
    expect(scan.empty).toEqual([9]);
    expect(scan.lines).toBe(10);
  });

  it("덮어쓰기: 초안이 있으면 새 버전, 확정은 언제나 그대로, 대상 아님은 고를 때만 더한다", () => {
    const found = [
      { studentId: "a", line: 2, text: "A", target: true, existing: "none" as const },
      { studentId: "b", line: 3, text: "B", target: true, existing: "draft" as const },
      { studentId: "r", line: 4, text: "R", target: true, existing: "rejected" as const },
      { studentId: "c", line: 5, text: "C", target: true, existing: "finalized" as const },
      { studentId: "h", line: 6, text: "H", target: false, existing: "none" as const },
    ];
    const over = planExternal(found, { overwrite: "overwrite", addNonTargets: true });
    expect(over.write.map((w) => [w.studentId, w.mode])).toEqual([["a", "new"], ["b", "overwrite"], ["r", "overwrite"], ["h", "new"]]);
    expect(over.addTargets).toEqual(["h"]);
    expect(over.keptFinal).toEqual(["c"]);
    const skip = planExternal(found, { overwrite: "skip", addNonTargets: false });
    expect(skip.write.map((w) => w.studentId)).toEqual(["a"]);
    expect(skip.skipped).toEqual(["b", "r"]);
    expect(skip.notTarget).toEqual(["h"]);
    expect(skip.addTargets).toEqual([]);
    const c = externalCounts({ found, unmatched: [{ line: 7, text: "x" }] }, over);
    expect(c).toMatchObject({ found: 5, unmatched: 1, notTarget: 1, withDraft: 3, finalized: 1, write: 4, fresh: 2, overwrite: 2, kept: 1 });
    expect(externalAuditLine("p1", over)).toBe("p1 new=2 over=2 keep=1 skip=0 add=1");
  });
});

describe("초안 출처 (N46)", () => {
  const v = (source: "ai" | "sample" | "manual" | "external", createdAt: string, originNote: string | null = null) => ({ source, createdAt, originNote });
  it("교사 수정은 건너뛰고 처음 만난 출처를 쓴다", () => {
    expect(draftOrigin([])).toBeNull();
    expect(draftOrigin([v("ai", "1"), v("manual", "2")])).toEqual({ origin: "ai", note: null });
    expect(draftOrigin([v("ai", "1"), v("external", "2", "○○ 연계 "), v("manual", "3")])).toEqual({ origin: "external", note: "○○ 연계" });
    expect(draftOrigin([v("external", "1"), v("sample", "2")])).toEqual({ origin: "ai", note: null });
    expect(draftOrigin([v("manual", "1")])).toEqual({ origin: "manual", note: null });
  });
  it("글·출처 정리", () => {
    expect(cleanExternalText(" 가 \r\n나\t\n ")).toBe("가\n나");
    expect(cleanNote("  ○○대학교\n 연계 ")).toBe("○○대학교 연계");
    expect(cleanNote("x".repeat(80))).toHaveLength(60);
  });
});
