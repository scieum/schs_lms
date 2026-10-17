import { describe, expect, it } from "vitest";
import { countReady, readyNote } from "./neis-export";

describe("나이스 입력 묶음 세기", () => {
  const latest = new Map([
    ["a", { status: "confirmed", content: "가".repeat(10) }], // 30B
    ["b", { status: "confirmed", content: "가".repeat(600) }], // 1800B
    ["c", { status: "draft", content: "쓰는 중" }],
    ["d", { status: "confirmed", content: "  " }],
  ]);

  it("확정·초과·전체를 센다 (빈 확정본은 확정으로 치지 않는다)", () => {
    expect(countReady(["a", "b", "c", "d", "e"], latest, 1500)).toEqual({ total: 5, confirmed: 2, over: 1 });
  });

  it("남은 일을 짧게 알려 준다", () => {
    expect(readyNote({ total: 5, confirmed: 2, over: 1 })).toEqual([
      { tone: "bad", text: "초과 1" },
      { tone: "wait", text: "미확정 3" },
    ]);
    expect(readyNote({ total: 3, confirmed: 3, over: 0 })).toEqual([]);
  });
});
