import { describe, expect, it } from "vitest";
import { linkSentences, toConnective } from "./sentence-flow";

describe("문장 잇기 (2026-10-19 문장 끊김)", () => {
  it("명사형 끝을 연결어미로", () => {
    expect(toConnective("변인을 정함.")).toBe("변인을 정하고");
    expect(toConnective("변인을 정함.", 1)).toBe("변인을 정하며");
    expect(toConnective("관심이 높아짐.")).toBe("관심이 높아지고");
    expect(toConnective("태도를 보임.", 1)).toBe("태도를 보이며");
    expect(toConnective("모둠장을 맡음.")).toBe("모둠장을 맡고");
    expect(toConnective("모둠장을 맡음.", 1)).toBe("모둠장을 맡으며");
    expect(toConnective("카드뉴스를 만듦.")).toBe("카드뉴스를 만들고");
    expect(toConnective("변화를 이끌어 냄.", 1)).toBe("변화를 이끌어 내며");
  });
  it("확실하지 않은 꼴은 바꾸지 않음", () => {
    expect(toConnective("큰 도움.")).toBeNull();
    expect(toConnective("Excellent.")).toBeNull();
    expect(toConnective("")).toBeNull();
  });
  it("짧은 문장을 번갈아 이어 한 문장으로, 길면 끊음", () => {
    expect(linkSentences(["모둠장을 맡음.", "발표 자료를 만듦.", "그래프를 그림."])).toEqual(["모둠장을 맡고 발표 자료를 만들며 그래프를 그림."]);
    expect(linkSentences(["가".repeat(80) + "함.", "나".repeat(80) + "함."])).toHaveLength(2);
    expect(linkSentences(["큰 도움.", "정리함."])).toEqual(["큰 도움.", "정리함."]);
  });
});
