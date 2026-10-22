import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { scrub } = await import("./ai-context");

describe("AI 작업창 — 보내기 전 가리기 (C2)", () => {
  it("붙인 학생 이름은 가명ID, 다른 학생 이름 · 학번은 가린다", () => {
    const people = [{ name: "강도현", studentNo: "30101" }, { name: "김서윤", studentNo: "30102" }] as never[];
    const out = scrub("강도현 세특 써 줘. 김서윤(30102)과 같은 조였음", { aliases: { S101: "강도현" }, people });
    expect(out).toBe("S101 세특 써 줘. 학생(학번)과 같은 조였음");
  });
});
