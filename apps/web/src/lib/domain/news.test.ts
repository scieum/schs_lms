import { describe, expect, it } from "vitest";
import { hideUntil, showNews, type News } from "./news";

const news: News = { id: "x", until: "2026-12-31", area: "a", title: ["t", "t"], steps: [], cta: { label: "l", href: "/" } };
const now = Date.parse("2026-10-26T09:00:00+09:00");

describe("신기능 안내 창 (N75)", () => {
  it("숨김 기록이 없으면 띄운다", () => {
    expect(showNews(news, "2026-10-26", null, now)).toBe(true);
  });
  it("일주일 숨기면 7일 동안 안 띄우고 그 뒤 다시 띄운다", () => {
    const until = hideUntil(now);
    expect(showNews(news, "2026-10-30", until, now + 4 * 864e5)).toBe(false);
    expect(showNews(news, "2026-11-02", until, now + 7 * 864e5)).toBe(true);
  });
  it("안내 기간이 지나거나 안내가 없으면 띄우지 않는다", () => {
    expect(showNews(news, "2027-01-01", null, now)).toBe(false);
    expect(showNews(null, "2026-10-26", null, now)).toBe(false);
  });
  it("깨진 기록은 없는 것으로 본다", () => {
    expect(showNews(news, "2026-10-26", NaN, now)).toBe(true);
  });
});
