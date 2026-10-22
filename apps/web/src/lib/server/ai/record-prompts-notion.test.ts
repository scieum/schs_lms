import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { recordSystemPrompt } = await import("./record-prompts");
const { NOTION_SETUK } = await import("./setuk-prompts-notion");

describe("세특 프롬프트 = 노션 원문 그대로 (2026-10-22)", () => {
  it("교과 계열마다 원문이 통째로 들어가고, 과목 이름 · 앱 안내가 뒤에 붙는다", () => {
    const p = recordSystemPrompt("세특", "화학Ⅱ");
    expect(p.startsWith(NOTION_SETUK.과학)).toBe(true);
    expect(p).toContain("과목은 화학Ⅱ임.");
    expect(p).toContain("2단계 교수 수준 과학적 오류 검증.");
    expect(recordSystemPrompt("세특", "미적분Ⅰ").startsWith(NOTION_SETUK.수학)).toBe(true);
    expect(recordSystemPrompt("세특", "공통영어1")).toContain("4-1) 역량 도출 기준(영어과)");
    expect(recordSystemPrompt("세특", "인공지능 기초")).toContain("4-1) 역량 도출 기준(정보과)");
  });
  it("원문 그대로: 표 · 예시 · 원문 표기까지", () => {
    expect(NOTION_SETUK.국어).toContain("개념 간 혼동(서사/서정/극, 화자/화자자, 주제/주제의식 등) 여부.");
    expect(NOTION_SETUK.수학).toContain("의견 조율 과정을 거쳌 응용 문제까지");
    expect(NOTION_SETUK.사회).toContain("LV3 | 학생의 주도성이 강하게 드러나고");
    for (const t of Object.values(NOTION_SETUK)) expect(t.startsWith("0) 최상위 규칙(무조건 최우선 준수)")).toBe(true);
  });
  it("체육은 원문이 없어 기존 프롬프트", () => {
    expect(recordSystemPrompt("세특", "운동과 건강")).toContain("30년 경력 베테랑 고등학교 체육 교사");
  });
});
