import { describe, expect, it } from "vitest";
import { filterMentions, isMentionKind, mentionQuery, showNames, type Mention } from "./ai-chat";

const list: Mention[] = [
  { kind: "학생", id: "k|a", label: "강예린", sub: "화학 2-1 · 20301" },
  { kind: "수업", id: "course:c1", label: "화학 2-1 · 3반", sub: "13명" },
  { kind: "프롬프트", id: "p1", label: "탐구 보고서형", sub: "세특 · 화학" },
];

describe("AI 작업창 @ 맥락 (N70)", () => {
  it("커서 앞 @말만 찾는다 (메일 주소 · 중간 @ 은 아님)", () => {
    expect(mentionQuery("이 학생 @강")).toBe("강");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("a@b.com")).toBeNull();
    expect(mentionQuery("@강예린 세특")).toBeNull();
  });
  it("이름 · 설명 · 종류로 거른다", () => {
    expect(filterMentions(list, "화학").map((m) => m.id)).toEqual(["k|a", "course:c1", "p1"]);
    expect(filterMentions(list, "학생").map((m) => m.id)).toEqual(["k|a"]);
    expect(filterMentions(list, "").length).toBe(3);
    expect(isMentionKind("협업방")).toBe(true);
    expect(isMentionKind("성적")).toBe(false);
  });
  it("가명ID는 화면에서만 이름을 붙인다 (S0120 같은 더 긴 것은 그대로)", () => {
    expect(showNames("S012는 실험을 설계함. S0120", { S012: "강예린" })).toBe("강예린(S012)는 실험을 설계함. S0120");
  });
});
