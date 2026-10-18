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
  it("검토 대기 → 검토하러 가기, 실패가 있으면 둘째 버튼", () => {
    expect(at({ status: "closed", ready: 0, review: 3, confirmed: 6, failed: 1 })).toMatchObject({ index: 3, next: { kind: "review", n: 3 }, secondary: { kind: "retry" } });
  });
  it("모두 확정 → 담임 전달", () => {
    expect(at({ status: "closed", ready: 0, confirmed: 10 })).toMatchObject({ index: 4, next: { kind: "done" } });
  });
});
