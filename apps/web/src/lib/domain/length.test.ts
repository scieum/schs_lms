import { describe, expect, it } from "vitest";
import { charCount, checkLength, cutServiceActivity, neisBytes, resolveLength, SERVICE_ACTIVITY_MAX_BYTES, serviceActivityCheck } from "./length";

describe("봉사 활동내용 50자 (N42 ④)", () => {
  it("50자 = 나이스 150B · 판정은 바이트", () => {
    expect(SERVICE_ACTIVITY_MAX_BYTES).toBe(150);
    expect(serviceActivityCheck("급식 배식 보조 및 어르신 말벗 활동")).toEqual({ chars: 20, bytes: 48, over: false });
    const long = "속초 해변 정화 활동에 참여하여 해양 쓰레기를 수거하고 관광객에게 분리배출 방법을 안내하는 캠페인을 진행함";
    expect(serviceActivityCheck(long).over).toBe(true);
    // 한글 50자 = 150B (넘지 않음) · 51자 = 153B (넘음)
    expect(serviceActivityCheck("가".repeat(50))).toEqual({ chars: 50, bytes: 150, over: false });
    expect(serviceActivityCheck("가".repeat(51)).over).toBe(true);
    // 영문·숫자·공백은 1B
    expect(serviceActivityCheck("AI 3D").bytes).toBe(5);
    expect(serviceActivityCheck(null)).toEqual({ chars: 0, bytes: 0, over: false });
  });
  it("규칙 줄이기(AI 꺼짐): 어절 경계에서 150B 안으로", () => {
    const long = "속초 해변 정화 활동에 참여하여 해양 쓰레기를 수거하고 관광객에게 분리배출 방법을 안내하는 캠페인을 진행함";
    const cut = cutServiceActivity(long);
    expect(neisBytes(cut)).toBeLessThanOrEqual(150);
    expect(long.startsWith(cut)).toBe(true);
    expect(cutServiceActivity("짧은 글")).toBe("짧은 글");
  });
});

describe("분량 세기", () => {
  it("NEIS 바이트 (2026 기재요령): 한글 3, 영문·공백 1, 엔터 1", () => {
    expect(neisBytes("탐구함")).toBe(9);
    expect(neisBytes("AI 탐구")).toBe(9);
    expect(neisBytes("가\n나")).toBe(7);
    expect(neisBytes("가\r\n나")).toBe(7);
    // 기호는 ASCII가 아니어도 1 (·, ※, “”, ①, …)
    expect(neisBytes("탐구·발표")).toBe(13);
    expect(neisBytes("※“①”…")).toBe(5);
    expect(neisBytes("漢字")).toBe(6);
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
