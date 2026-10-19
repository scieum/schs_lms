import { describe, expect, it } from "vitest";
import { ALL_FEATURES, FEATURE_COUNT } from "../landing-data";
import { FEATURE_GUIDE } from "./feature-guide";

// 기능 한눈에 보기 — 기능마다 설명 (N45): 목록과 설명이 1:1인지, 공개 페이지 문구 규칙을 지키는지
const names = ALL_FEATURES.flatMap((g) => g.rows.map((r) => r[0]));
const guides = Object.entries(FEATURE_GUIDE);

describe("기능마다 설명", () => {
  it("목록의 기능마다 설명이 하나씩 있다", () => {
    expect(names.length).toBe(FEATURE_COUNT);
    expect(names.filter((n) => !FEATURE_GUIDE[n])).toEqual([]);
    expect(guides.map(([n]) => n).filter((n) => !names.includes(n))).toEqual([]);
  });

  it("주소용 id 는 겹치지 않는 영어 kebab-case", () => {
    const ids = guides.map(([, g]) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    // 페이지에 이미 있는 id(영역 area-N 등)와 겹치지 않게
    for (const id of ids) expect(id.startsWith("area-")).toBe(false);
  });

  it("무엇 · 이럴 때 · 2–4단계 · 메뉴 경로가 다 있다", () => {
    for (const [n, g] of guides) {
      expect(g.what.length, n).toBeGreaterThan(10);
      expect(g.why.length, n).toBeGreaterThan(5);
      expect(g.steps.length, n).toBeGreaterThanOrEqual(2);
      expect(g.steps.length, n).toBeLessThanOrEqual(4);
      expect(g.where.length, n).toBeGreaterThanOrEqual(1);
    }
  });

  it("공개 페이지 문구: N 번호 · 성적·수능 최저 기능을 쓰지 않는다", () => {
    for (const [n, g] of guides) {
      const all = [g.what, g.why, ...g.steps, ...g.where, ...(g.safe ?? [])].join(" ");
      expect(all, n).not.toMatch(/\bN\d+\b/);
      expect(all, n).not.toMatch(/수능|최저/);
      if (n !== "성적 잠금") expect(all, n).not.toMatch(/성적/);
    }
  });

  it("그림은 상세페이지 핵심 기능 그림만 쓰고 한 번씩만", () => {
    const imgs = guides.map(([, g]) => g.img).filter(Boolean);
    expect(new Set(imgs).size).toBe(imgs.length);
  });
});
