import { describe, expect, it } from "vitest";
import {
  careerPicks, checkApplication, deadlineLabel, fieldOf, isClosed, offeringStats, problemMessage, seatLabel, seatState,
  sectionSuggestions, type Offering,
} from "./offering";

const o = (id: string, subject: string, credits: number, capacity = 30, sections = 1, field = "수학"): Offering =>
  ({ id, roundId: "r", subject, field, credits, capacity, sections, courseId: null });

const list = [o("a", "미적분Ⅱ", 4), o("b", "기하", 4), o("c", "미술 창작", 2, 25, 1, "예술"), o("d", "정보", 2, 25, 1, "기술"), o("e", "물리학Ⅱ", 4, 30, 1, "과학")];
const round = { deadline: "2026-10-30", maxCredits: 10 };
const before = new Date("2026-10-16T03:00:00Z");

describe("자리", () => {
  it("정원 × 반 수", () => {
    expect(seatState(o("x", "x", 2, 30, 2), 34)).toEqual({ count: 34, seats: 60, left: 26, over: false, full: false });
    expect(seatState(o("x", "x", 2), 34).over).toBe(true);
    expect(seatState(o("x", "x", 2), 30).full).toBe(true);
  });
  it("잔여석 표시", () => {
    expect(seatLabel(0)).toEqual({ text: "마감", low: true });
    expect(seatLabel(1)).toEqual({ text: "잔여 1석", low: true });
    expect(seatLabel(20)).toEqual({ text: "잔여 20석", low: false });
  });
  it("교과 이름을 짧은 분야로", () => {
    expect(fieldOf("기술·가정/정보")).toBe("기술");
    expect(fieldOf("제2외국어/한문")).toBe("외국어");
    expect(fieldOf("수학")).toBe("수학");
  });
});

describe("마감", () => {
  it("마감일 한국 시간 24시까지 열려 있다", () => {
    expect(isClosed("2026-10-30", new Date("2026-10-30T14:59:00Z"))).toBe(false);
    expect(isClosed("2026-10-30", new Date("2026-10-30T15:00:00Z"))).toBe(true);
    expect(deadlineLabel("2026-10-30")).toBe("10.30");
  });
});

describe("신청 검사", () => {
  const base = { round, offerings: list, mine: [] as string[], counts: {} as Record<string, number>, now: before };

  it("학점 한도 안이면 통과", () => {
    expect(checkApplication({ ...base, picked: ["b", "c", "d"] })).toEqual([]);
  });
  it("학점 한도를 넘으면 실패", () => {
    const p = checkApplication({ ...base, picked: ["a", "b", "c", "d"] });
    expect(p).toEqual([{ kind: "credits", total: 12, max: 10 }]);
    expect(problemMessage(p[0])).toMatch(/최대 10학점/);
  });
  it("자리가 찬 과목은 새로 담을 수 없다", () => {
    expect(checkApplication({ ...base, picked: ["a"], counts: { a: 30 } })).toEqual([{ kind: "full", subject: "미적분Ⅱ" }]);
  });
  it("이미 신청해 둔 과목은 정원이 넘어도 지킨다", () => {
    expect(checkApplication({ ...base, picked: ["a"], mine: ["a"], counts: { a: 34 } })).toEqual([]);
  });
  it("마감 뒤에는 실패", () => {
    expect(checkApplication({ ...base, picked: ["b"], now: new Date("2026-11-01T00:00:00Z") })).toContainEqual({ kind: "closed" });
  });
  it("없는 과목·같은 과목 두 번", () => {
    expect(checkApplication({ ...base, picked: ["zz"] })).toContainEqual({ kind: "unknown" });
    const dup = [...list, o("f", "기하", 4)];
    expect(checkApplication({ ...base, offerings: dup, picked: ["b", "f"] })).toContainEqual({ kind: "duplicate", subject: "기하" });
  });
  it("같은 id 를 두 번 보내도 한 번으로 센다", () => {
    expect(checkApplication({ ...base, picked: ["b", "b", "c"] })).toEqual([]);
  });
});

describe("관리자 숫자·반 늘리기", () => {
  const counts = { a: 34, b: 29, c: 18, e: 61 };
  it("개설 수·신청률·초과 수", () => {
    expect(offeringStats(list, counts, 41, 50)).toEqual({ total: 5, rate: 82, over: 2 });
    expect(offeringStats([], {}, 0, 0).rate).toBe(0);
  });
  it("초과 과목마다 더 열어야 할 반 수", () => {
    const s = sectionSuggestions(list, counts);
    expect(s.map((x) => [x.offering.id, x.add])).toEqual([["a", 1], ["e", 2]]);
  });
});

describe("진로 맞춤 과목 (규칙)", () => {
  it("산업디자인 → 미술 창작·기하", () => {
    expect(careerPicks("산업디자인", list)).toEqual(["c", "b", "d"]);
  });
  it("열려 있는 과목만, 진로가 없으면 없음", () => {
    expect(careerPicks("기계공학", list)).toEqual(["e", "a", "b"]);
    expect(careerPicks(null, list)).toEqual([]);
    expect(careerPicks("요리사", list)).toEqual([]);
  });
});
