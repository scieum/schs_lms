// 나이스 북마클릿 대조 (v0.2.8, Figma N39 ①)의 순수 함수 시험: apps/neis-bookmarklet/fill.js 의 compareText · nextValue
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Cmp = { status: string; kind?: string; prefix?: string; wantPart?: string; gotPart?: string; missingBytes?: number; byteDiff?: number; wantBytes: number; neisBytes: number; firstDiff?: number };
const win: { __schsNeis?: { compareText: (a: string, b: string) => Cmp; nextValue: (b: string, c: string, m: string) => string } } = {};
new Function("window", readFileSync(path.resolve(__dirname, "../../../neis-bookmarklet/fill.js"), "utf8"))(win);
const { compareText, nextValue } = win.__schsNeis!;

describe("나이스 대조 compareText", () => {
  it("같으면 same (줄바꿈 \\r\\n · 끝 공백 무시)", () => {
    expect(compareText("가나다\n라마", "가나다\r\n라마  ").status).toBe("same");
  });

  it("나이스 쪽이 앞부분만 → cut · 덜 들어간 바이트", () => {
    const want = "실험 결과를 그래프로 정리하고 오차 원인을 토론함.";
    const r = compareText(want, "실험 결과를 그래프로 정리하고 오차 ");
    // 나이스 쪽 끝 공백은 무시하므로 다른 부분은 " 원인을 토론함."
    expect(r).toMatchObject({ status: "diff", kind: "cut", wantPart: " 원인을 토론함.", gotPart: "" });
    expect(r.missingBytes).toBe(3 * 6 + 3);
    expect(r.byteDiff).toBe(r.missingBytes);
    // 앞부분은 "…" + 끝 18자
    expect(r.prefix).toBe("…험 결과를 그래프로 정리하고 오차");
  });

  it("가운데가 다르거나 더 길면 edited (나이스에서 고친 글)", () => {
    expect(compareText("탐구함.", "탐구하였음.")).toMatchObject({ status: "diff", kind: "edited", prefix: "탐구", wantPart: "함.", gotPart: "하였음." });
    expect(compareText("탐구함.", "탐구함. 추가").kind).toBe("edited");
  });

  it("짧은 앞부분은 … 없이", () => {
    expect(compareText("가나다라", "가나").prefix).toBe("가나");
  });

  it("기대값: 덮어쓰기 = 확정본, 이어쓰기 = 이전 글 + 공백 + 확정본", () => {
    expect(nextValue("이전 글", "확정본", "replace")).toBe("확정본");
    expect(nextValue("이전 글  ", "확정본", "append")).toBe("이전 글 확정본");
    expect(nextValue("  ", "확정본", "append")).toBe("확정본");
  });
});
