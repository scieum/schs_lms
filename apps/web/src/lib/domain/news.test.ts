import { describe, expect, it } from "vitest";
import { NEWS, hideUntil, showNews, turnPage, type News } from "./news";

const slide = { art: "voice" as const, area: "a", title: ["t", "t"] as [string, string], steps: [], cta: { label: "l", href: "/" } };
const news: News = { id: "x", until: "2026-12-31", slides: [slide] };
const now = Date.parse("2026-10-26T09:00:00+09:00");

describe("신기능 안내 창 (N75 · N76)", () => {
  it("숨김 기록이 없으면 띄운다", () => {
    expect(showNews(news, "2026-10-26", null, now)).toBe(true);
  });
  it("일주일 숨기면 7일 동안 안 띄우고 그 뒤 다시 띄운다", () => {
    const until = hideUntil(now);
    expect(showNews(news, "2026-10-30", until, now + 4 * 864e5)).toBe(false);
    expect(showNews(news, "2026-11-02", until, now + 7 * 864e5)).toBe(true);
  });
  it("안내 기간이 지나거나 안내 · 장이 없으면 띄우지 않는다", () => {
    expect(showNews(news, "2027-01-01", null, now)).toBe(false);
    expect(showNews(null, "2026-10-26", null, now)).toBe(false);
    expect(showNews({ ...news, slides: [] }, "2026-10-26", null, now)).toBe(false);
  });
  it("깨진 기록은 없는 것으로 본다", () => {
    expect(showNews(news, "2026-10-26", NaN, now)).toBe(true);
  });
  it("장 넘기기는 처음 · 끝에서 멈춘다", () => {
    expect(turnPage(0, -1, 2)).toBe(0);
    expect(turnPage(0, 1, 2)).toBe(1);
    expect(turnPage(1, 1, 2)).toBe(1);
  });
  it("지금 안내: 녹음 · 나이스 입력 두 장", () => {
    expect(NEWS?.slides.map((s) => s.art)).toEqual(["voice", "neis"]);
    expect(NEWS?.slides[1].cta.href).toBe("/teacher/neis");
  });
});
