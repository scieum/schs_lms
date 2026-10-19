import { describe, expect, it } from "vitest";
import { programStage, type StageCounts } from "./program-stage";

const base: StageCounts = { status: "open", targets: 15, evidence: 10, ready: 10, running: 0, failed: 0, review: 0, confirmed: 0 };
const at = (o: Partial<StageCounts>) => programStage({ ...base, ...o }, "D-4");

describe("프로그램 흐름 단계", () => {
  it("발행 전 → 발행하기", () => {
    expect(at({ status: "draft" })).toMatchObject({ index: 0, next: { kind: "publish" } });
  });
  it("받는 중: 미응답이 있으면 알리기 + 지금 마감, 다 냈으면 마감", () => {
    expect(at({})).toMatchObject({ index: 0, next: { kind: "remind", n: 5 }, secondary: { kind: "close" } });
    expect(at({ evidence: 15, ready: 15 })).toMatchObject({ index: 0, next: { kind: "close" } });
  });
  it("마감 → 초안 만들기", () => {
    expect(at({ status: "closed" })).toMatchObject({ index: 1, next: { kind: "generate", n: 10 } });
  });
  it("초안: 만드는 중 / 실패 다시 만들기", () => {
    expect(at({ status: "closed", running: 3, ready: 0 })).toMatchObject({ index: 2, next: { kind: "running" } });
    expect(at({ status: "closed", failed: 1, ready: 0, review: 0 })).toMatchObject({ index: 2, next: { kind: "retry", n: 1 } });
  });
  it("실패가 남아 있으면 ③ 초안: 검토 먼저, 실패는 둘째 버튼", () => {
    expect(at({ status: "closed", ready: 0, review: 3, confirmed: 6, failed: 1 })).toMatchObject({ index: 2, next: { kind: "review", n: 3 }, secondary: { kind: "retry" } });
  });
  it("다 만들고 확정이 남으면 ④ 검토·확정", () => {
    expect(at({ status: "closed", ready: 0, review: 3, confirmed: 7 })).toMatchObject({ index: 3, next: { kind: "review", n: 3 } });
  });
  it("모두 확정 → 담임 전달", () => {
    expect(at({ status: "closed", ready: 0, confirmed: 10 })).toMatchObject({ index: 4, next: { kind: "done" } });
  });
});

describe("외부 글 프로그램 단계 (N46)", () => {
  const ext: StageCounts = { ...base, external: true, evidence: 0, ready: 0 };
  it("글이 없으면 ① 외부 글 넣기 (알림·마감·초안 만들기 없음)", () => {
    const s = programStage(ext, "D-3");
    expect(s.index).toBe(0);
    expect(s.next).toEqual({ kind: "external", label: "외부 글 넣기" });
  });
  it("검토할 글이 있으면 검토가 먼저, 남은 학생은 둘째 버튼", () => {
    const s = programStage({ ...ext, evidence: 12, review: 12 }, "D-3");
    expect(s.index).toBe(3);
    expect(s.next.kind).toBe("review");
    expect(s.secondary).toEqual({ kind: "external", label: "외부 글 넣기" });
    expect(s.line).toBe("외부 글 12/15명 · 확정 0");
  });
  it("모두 확정하면 담임 전달", () => {
    expect(programStage({ ...ext, status: "closed", evidence: 15, confirmed: 15 }, "마감").index).toBe(4);
  });
});
