import { describe, expect, it } from "vitest";
import { fitGlyph, normalizeHex, stampCells, stampChars, stampFileName, stampFontsHref } from "./stamp";

describe("도장 만들기", () => {
  it("글자는 띄어쓰기 빼고 4자까지, '인'은 3자 이하일 때만", () => {
    expect(stampChars(" 김 속초 ", false)).toEqual(["김", "속", "초"]);
    expect(stampChars("김속초", true)).toEqual(["김", "속", "초", "인"]);
    expect(stampChars("남궁속초", true)).toEqual(["남", "궁", "속", "초"]);
    expect(stampChars("가나다라마", false)).toHaveLength(4);
    expect(stampChars("", true)).toEqual([]);
  });

  it("4자는 오른쪽 줄 위→아래, 다음 왼쪽 줄", () => {
    const c = stampCells(["김", "속", "초", "인"], "원형");
    const [a, b, d, e] = c;
    expect(a.cx).toBeGreaterThan(0.5);
    expect(b.cx).toBe(a.cx);
    expect(b.cy).toBeGreaterThan(a.cy);
    expect(d.cx).toBeLessThan(0.5);
    expect(e.cy).toBe(b.cy);
  });

  it("3자는 오른쪽 성 한 자 · 왼쪽 두 자, 타원은 세로 한 줄", () => {
    const c = stampCells(["김", "속", "초"], "사각");
    expect(c[0].cx).toBeGreaterThan(0.5);
    expect(c[0].h).toBeCloseTo(c[1].h * 2);
    const o = stampCells(["김", "속", "초"], "타원");
    expect(new Set(o.map((x) => x.cx)).size).toBe(1);
    expect(stampCells(["김"], "원형")[0]).toMatchObject({ cx: 0.5, cy: 0.5 });
  });

  it("글자 늘이기는 한쪽으로 1.35배까지", () => {
    const { sx, sy } = fitGlyph({ w: 10, h: 10 }, { w: 100, h: 20 }, 1);
    expect(sy).toBeCloseTo(2);
    expect(sx).toBeCloseTo(2.7);
  });

  it("색 값 · 파일 이름 · 글꼴 주소", () => {
    expect(normalizeHex("d32f2f")).toBe("#D32F2F");
    expect(normalizeHex("#d32")).toBe("#DD3322");
    expect(normalizeHex("red")).toBeNull();
    expect(stampFileName("김속초", 600)).toBe("도장_김속초_600.png");
    expect(stampFileName("  ", 300)).toBe("도장_도장_300.png");
    expect(stampFontsHref()).toContain("family=Noto+Serif+KR:wght@700");
  });
});
