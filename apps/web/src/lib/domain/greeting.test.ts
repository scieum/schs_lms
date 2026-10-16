import { describe, expect, it } from "vitest";
import { dayPart, greeting, koreaHour } from "./greeting";

describe("홈 인사말", () => {
  it("시간대를 나눈다", () => {
    expect(dayPart(3)).toBe("새벽");
    expect(dayPart(8)).toBe("아침");
    expect(dayPart(12)).toBe("점심");
    expect(dayPart(15)).toBe("오후");
    expect(dayPart(19)).toBe("저녁");
    expect(dayPart(23)).toBe("밤");
  });

  it("한국 시간으로 계산한다", () => {
    expect(koreaHour(new Date("2026-10-16T00:30:00Z"))).toBe(9);
  });

  it("고른 문구에 호칭을 넣는다", () => {
    const g = greeting("김하연 선생님", new Date("2026-10-16T00:30:00Z"), () => 0);
    expect(g).toBe("좋은 아침이에요, 김하연 선생님");
    expect(greeting("박서준 학생", new Date("2026-10-16T13:00:00Z"), () => 0.99)).toContain("박서준 학생");
  });
});
