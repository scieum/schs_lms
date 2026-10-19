import { describe, expect, it } from "vitest";
import {
  byClass, byGroup, byTeacher, filterArea, issueChips, progressTone, readArea, reportFileName, statusOf, tally, textIssues, type ReportRecord,
} from "./record-report";

const rec = (o: Partial<ReportRecord>): ReportRecord => ({
  area: "행발", grade: 2, classNo: 1, teacherId: "t1", scope: "행발 2-1", status: "미작성", issues: {}, updatedAt: null, ...o,
});

describe("학생부 점검 보고서 (N39)", () => {
  const records: ReportRecord[] = [
    rec({ status: "확정", updatedAt: "2026-10-10T00:00:00Z" }),
    rec({ status: "작성 중", issues: { over: true, forbidden: true }, updatedAt: "2026-10-12T00:00:00Z" }),
    rec({ status: "미작성" }),
    rec({ classNo: 2, teacherId: "t2", scope: "행발 2-2", status: "확정" }),
    rec({ area: "세특", classNo: 1, teacherId: "t3", scope: "물리학 2학년 1분반", status: "확정", group: { key: "c-4|1분반", label: "물리학 · 1분반", courseId: "c-4", section: "1분반" } }),
    rec({ area: "세특", classNo: 2, teacherId: "t3", scope: "물리학 2학년 1분반", status: "작성 중", issues: { spell: true }, group: { key: "c-4|1분반", label: "물리학 · 1분반", courseId: "c-4", section: "1분반" } }),
    rec({ area: "프로그램 초안", classNo: 2, teacherId: "t2", scope: "과학 탐구 발표", status: "확정", issues: { undelivered: true } }),
  ];

  it("건수: 미작성 · 작성 중 · 확정 · 확인 필요(다섯 가지 합) · 진행률", () => {
    const c = tally(records);
    expect([c.total, c.empty, c.writing, c.confirmed]).toEqual([7, 1, 2, 4]);
    expect([c.over, c.forbidden, c.spell, c.ungrounded, c.undelivered, c.check]).toEqual([1, 1, 1, 0, 1, 4]);
    expect(c.progress).toBe(57);
  });

  it("영역 거르기", () => {
    expect(filterArea(records, "all")).toHaveLength(7);
    expect(filterArea(records, "세특")).toHaveLength(2);
    expect(filterArea(records, "프로그램 초안").every((r) => r.area === "프로그램 초안")).toBe(true);
  });

  it("반별: 기록 없는 반도 학생 수가 있으면 줄", () => {
    const rows = byClass(filterArea(records, "행발"), { "2-1": 3, "2-2": 1, "2-3": 2 }, { "2-1": "김OO" });
    expect(rows.map((r) => r.key)).toEqual(["2-1", "2-2", "2-3"]);
    expect(rows[0]).toMatchObject({ homeroom: "김OO", students: 3 });
    expect(rows[0].counts).toMatchObject({ total: 3, confirmed: 1, over: 1, progress: 33 });
    expect(rows[2].counts.total).toBe(0);
  });

  it("세특은 과목·분반 줄", () => {
    const g = byGroup(records);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ label: "물리학 · 1분반", teacherId: "t3", students: 2 });
    expect(g[0].counts).toMatchObject({ confirmed: 1, writing: 1, spell: 1 });
  });

  it("선생님별: 진행률 낮은 순 · 맡은 것 · 마지막 작성", () => {
    const t = byTeacher(records);
    expect(t.map((x) => x.teacherId)).toEqual(["t1", "t3", "t2"]);
    expect(t[0]).toMatchObject({ records: 3, confirmed: 1, progress: 33, check: 2, last: "2026-10-12T00:00:00Z", scopes: ["행발 2-1"] });
    expect(t[2].scopes).toEqual(["행발 2-2", "과학 탐구 발표"]);
  });

  it("진행률 색", () => {
    expect([progressTone(77), progressTone(75), progressTone(62), progressTone(55), progressTone(41)]).toEqual(["ok", "ok", "key", "key", "wait"]);
  });

  it("상태와 글 검사 (결과만 남긴다)", () => {
    expect(statusOf("", true)).toBe("미작성");
    expect(statusOf("  ", false)).toBe("미작성");
    expect(statusOf("글", false)).toBe("작성 중");
    expect(statusOf("글", true)).toBe("확정");
    expect(textIssues("가".repeat(501), { maxBytes: 1500, identity: [] })).toEqual({ over: true, forbidden: false });
    expect(textIssues("탐구 결과를 소논문으로 정리함.", { maxBytes: 1500, identity: [] }).forbidden).toBe(true);
    expect(textIssues("실험을 설계함.", { maxBytes: 1500, identity: ["김민준"] }).forbidden).toBe(true);
    expect(textIssues("", { maxBytes: 1, identity: ["x"] })).toEqual({ over: false, forbidden: false });
  });

  it("주소 값 · 칩 · 파일 이름", () => {
    expect(readArea("setuk")).toBe("세특");
    expect(readArea("nope")).toBe("all");
    expect(issueChips(tally(records.slice(0, 2)))).toEqual([{ key: "over", label: "바이트", n: 1 }, { key: "forbidden", label: "실명", n: 1 }]);
    expect(reportFileName(2, "2026-10-19")).toBe("학생부점검_2학년_20261019.xlsx");
  });
});
