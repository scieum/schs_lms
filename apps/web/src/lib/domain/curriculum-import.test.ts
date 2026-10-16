import { describe, expect, it } from "vitest";
import { parseCourseLines, prepareCourseImport } from "./curriculum-import";

describe("편제표 읽기 → 일괄 추가 준비", () => {
  it("2022 개정 과목 이름·교과로 맞추고, 원래 이름을 남긴다", () => {
    const [r] = prepareCourseImport([{ grade: 2, semester: 1, subject: "확률과통계", credits: 4 }], []);
    expect(r.error).toBeNull();
    expect(r.group).toBe("수학");
    expect(r.subject).toBe("확률과 통계");
    expect(r.renamedFrom).toBe("확률과통계");
  });
  it("모르는 과목은 읽은 교과 또는 교양으로 학교 지정", () => {
    const rs = prepareCourseImport(
      [{ grade: 3, semester: 2, subject: "해양 탐구", credits: 2, group: "과학" }, { grade: 3, semester: 2, subject: "속초학", credits: 1 }],
      [],
    );
    expect(rs.map((r) => [r.group, r.type])).toEqual([["과학", null], ["교양", null]]);
  });
  it("범위 밖·이미 있음·목록 안 중복은 오류", () => {
    const rs = prepareCourseImport(
      [
        { grade: 4, semester: 1, subject: "기하", credits: 4 },
        { grade: 2, semester: 1, subject: "기하", credits: 12 },
        { grade: 2, semester: 2, subject: "기하", credits: 4 },
        { grade: 2, semester: 1, subject: "정보", credits: 2 },
        { grade: 2, semester: 1, subject: "정 보", credits: 2 },
      ],
      [{ grade: 2, semester: 2, subject: "기하" }],
    );
    expect(rs.map((r) => r.error)).toEqual(["학년을 확인해 주세요", "학점은 1~10", "이미 편제표에 있어요", null, "목록에 두 번 있어요"]);
  });
  it("붙여넣은 글: 여러 형식", () => {
    expect(parseCourseLines("2 1 물리학Ⅰ 4\n2학년 2학기 확률과 통계 4학점\n3\t1\t정보\t2\n합계 30")).toEqual([
      { grade: 2, semester: 1, subject: "물리학Ⅰ", credits: 4 },
      { grade: 2, semester: 2, subject: "확률과 통계", credits: 4 },
      { grade: 3, semester: 1, subject: "정보", credits: 2 },
    ]);
  });
});
