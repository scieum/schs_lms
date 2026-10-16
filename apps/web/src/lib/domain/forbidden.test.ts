import { describe, expect, it } from "vitest";
import { bannedOnly, findForbidden, forbiddenBlock } from "./forbidden";

describe("생기부 금칙어", () => {
  it("논문·학교명·교외 기관·부모 직업을 찾는다", () => {
    const t = "소논문을 작성하여 학회지에 투고함. 서울대 교수의 강연을 듣고 연구소를 방문함. 아버지의 직업인 의사를 꿈꿈.";
    const words = findForbidden(t).map((h) => h.word);
    expect(words).toEqual(expect.arrayContaining(["소논문", "학회지", "투고", "서울대", "연구소", "아버지의 직업"]));
    expect(forbiddenBlock(t)).toMatch(/확정할 수 없어요/);
  });
  it("가족 언급은 경고(check)만, 확정은 막지 않는다", () => {
    const t = "할머니의 텃밭 가꾸기를 도우며 토양 산성도를 측정함.";
    const hits = findForbidden(t);
    expect(hits.map((h) => h.category)).toContain("가족 관계");
    expect(bannedOnly(hits)).toHaveLength(0);
    expect(forbiddenBlock(t)).toBeNull();
  });
  it("모의고사·등급·인증시험·사교육", () => {
    const words = findForbidden("모의고사 2등급을 받고 TOEIC 900점, 학원에서 심화 학습함.").map((h) => h.word);
    expect(words).toEqual(expect.arrayContaining(["모의고사", "2등급", "TOEIC", "학원"]));
  });
  it("평범한 세특 문장은 통과", () => {
    expect(findForbidden("해변 모래 시료에서 미세플라스틱을 현미경으로 관찰하고 지점별 차이를 그래프로 정리함.")).toHaveLength(0);
    expect(findForbidden("학생회장으로서 학급 회의를 이끌며 의견을 조율함.")).toHaveLength(0);
  });
});
