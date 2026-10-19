import { describe, expect, it } from "vitest";
import { toTsv, tsvCell } from "./tsv";

describe("시트용 복사 TSV (N42 ③)", () => {
  it("칸 구분 탭 · 줄 구분 CRLF · 1행 열 이름", () => {
    expect(toTsv(["학번", "이름", "글", "바이트"], [["20101", "학생A", "탐구함.", 9]])).toBe("학번\t이름\t글\t바이트\r\n20101\t학생A\t탐구함.\t9");
  });
  it("줄바꿈이 있으면 따옴표로 감싸고 \\n 으로 통일", () => {
    expect(tsvCell("첫 줄\r\n둘째 줄")).toBe('"첫 줄\n둘째 줄"');
    expect(tsvCell("가\r나")).toBe('"가\n나"');
  });
  it("따옴표는 두 번 쓰고 감싼다", () => {
    expect(tsvCell('“발표”와 "토론"')).toBe('"“발표”와 ""토론"""');
  });
  it("칸 안 탭은 공백 하나로 바꾼 뒤 감싼다", () => {
    expect(tsvCell("가\t나")).toBe('"가 나"');
  });
  it("빈 값 · null · 숫자 · 한글", () => {
    expect(tsvCell("")).toBe("");
    expect(tsvCell(null)).toBe("");
    expect(tsvCell(undefined)).toBe("");
    expect(tsvCell(1412)).toBe("1412");
    expect(tsvCell("빛의 굴절 실험에서 입사각을 바꾸며 측정함")).toBe("빛의 굴절 실험에서 입사각을 바꾸며 측정함");
    expect(toTsv(["a", "b"], [["", "x"]])).toBe("a\tb\r\n\tx");
  });
  it("학번은 글자 그대로 (앞 0 · 작은따옴표를 붙이지 않음)", () => {
    expect(tsvCell("010203")).toBe("010203");
  });
});
