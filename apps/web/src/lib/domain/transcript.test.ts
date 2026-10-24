import { describe, expect, it } from "vitest";
import { cleanTranscript } from "./transcript";

describe("발표 받아쓰기 다듬기 (N73)", () => {
  it("끝없는 되풀이는 한 번만", () => {
    expect(cleanTranscript(`이 영상은 ${"영상이 ".repeat(40)}영상`)).toBe("이 영상은 영상이 영상");
    expect(cleanTranscript("감사합니다 감사합니다 감사합니다 감사합니다")).toBe("감사합니다");
    expect(cleanTranscript("좋은 질문 좋은 질문 좋은 질문 입니다")).toBe("좋은 질문 입니다");
  });

  it("두 번 되풀이는 발표 말투일 수 있어 그대로", () => {
    expect(cleanTranscript("네 네 맞습니다")).toBe("네 네 맞습니다");
  });

  it("지어낸 방송 끝맺음 말 빼기 · 실제 내용은 그대로", () => {
    const real = "저희 모둠은 탄소세와 재생 에너지 보조금을 비교해 보았습니다.";
    expect(cleanTranscript(`${real} 시청해주셔서 감사합니다.`)).toBe(real);
    expect(cleanTranscript(real)).toBe(real);
    expect(cleanTranscript("")).toBe("");
  });
});
