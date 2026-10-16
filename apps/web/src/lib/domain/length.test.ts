import { describe, expect, it } from "vitest";
import { charCount, checkLength, neisBytes, resolveLength } from "./length";

describe("분량 세기", () => {
  it("NEIS 바이트: 한글 3, 영문·공백 1, 줄바꿈 2", () => {
    expect(neisBytes("탐구함")).toBe(9);
    expect(neisBytes("AI 탐구")).toBe(9);
    expect(neisBytes("가\n나")).toBe(8);
    expect(neisBytes("가\r\n나")).toBe(8);
  });
  it("글자 수는 공백 포함, 줄바꿈 제외", () => {
    expect(charCount("AI 탐구\n함")).toBe(6);
  });
});

describe("교사 분량 설정", () => {
  it("설정이 없으면 NEIS 한도, 하한은 60%", () => {
    expect(resolveLength("세특")).toEqual({ unit: "bytes", max: 1500, min: 900, capped: false });
  });
  it("교사가 정한 값을 쓴다", () => {
    expect(resolveLength("세특", { unit: "bytes", max: 1000 })).toMatchObject({ max: 1000, min: 600, capped: false });
    expect(resolveLength("창체-진로", { unit: "chars", max: 300 })).toMatchObject({ unit: "chars", max: 300, min: 180 });
  });
  it("NEIS 한도를 넘으면 한도로 낮추고 알린다 (C7)", () => {
    expect(resolveLength("세특", { unit: "bytes", max: 2000 })).toMatchObject({ max: 1500, capped: true });
    expect(resolveLength("세특", { unit: "chars", max: 600 })).toMatchObject({ max: 500, capped: true });
  });
  it("범위 검사", () => {
    const r = resolveLength("세특", { unit: "chars", max: 10 });
    expect(checkLength("가나다", r)).toMatchObject({ ok: false, reason: "too_short" });
    expect(checkLength("가나다라마바사", r)).toMatchObject({ ok: true, value: 7 });
    expect(checkLength("가나다라마바사아자차카", r)).toMatchObject({ ok: false, reason: "too_long" });
  });
});
