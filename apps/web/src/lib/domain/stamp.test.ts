import { describe, expect, it } from "vitest";
import { fitGlyph, normalizeHex, stampCells, stampChars, stampFileName, stampFontsHref } from "./stamp";

describe("도장 만들기", () => {
  it("'인'은 3자 이하면 늘 붙고, '인' 빼기일 때만 뺀다 · 띄어쓰기 빼고 4자까지", () => {
    expect(stampChars("김하연")).toEqual(["김", "하", "연", "인"]);
    expect(stampChars(" 김 하연 ", true)).toEqual(["김", "하", "연"]);
    expect(stampChars("남궁하연")).toEqual(["남", "궁", "하", "연"]);
    expect(stampChars("가나다라마", true)).toHaveLength(4);
    expect(stampChars("")).toEqual([]);
  });

  it("4자는 왼쪽→오른쪽, 위→아래: 김하 / 연인 (모든 모양)", () => {
    for (const shape of ["원형", "사각", "타원"] as const) {
      const [김, 하, 연, 인] = stampCells(stampChars("김하연"), shape);
      expect(김.cx).toBeLessThan(0.5);
      expect(하.cx).toBeGreaterThan(0.5);
      expect(하.cy).toBe(김.cy);
      expect(연.cx).toBe(김.cx);
      expect(연.cy).toBeGreaterThan(김.cy);
      expect(인.cx).toBe(하.cx);
      expect(인.cy).toBe(연.cy);
    }
  });

  it("3자는 위 두 자 · 아래 한 자(가운데), 타원은 세로 한 줄", () => {
    const c = stampCells(["김", "하", "연"], "사각");
    expect(c[0].cy).toBe(c[1].cy);
    expect(c[2].cx).toBeCloseTo(0.5);
    expect(c[2].w).toBeCloseTo(c[0].w * 2);
    const o = stampCells(["김", "하", "연"], "타원");
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
