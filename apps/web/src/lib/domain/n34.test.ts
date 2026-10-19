import { describe, expect, it } from "vitest";
import { activityOf, applyFix, clauseAt, findForbidden, FORBIDDEN_RULES } from "./forbidden";
import { applyRuleFixes, autoCheck, fixableRows } from "./auto-check";
import { fixEnding, findIdentity } from "./writing";
import { splitByRanges, wordDiff } from "./diff";
import { pairsOf, similarCount, similarPairs } from "./similar";
import { bluntLine, bluntWords } from "./soften";

const BODY = "학생A는 빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정함. 서울대학교 주최 과학탐구대회에서 수상한 경험을 살려 실험 결과를 소논문 형식으로 정리하였다. 모둠 발표에서 측정값의 불확도를 그래프로 제시해 친구들의 이해를 도움.";
const who = { name: "학생A", studentNo: "20111", grade: 2, classNo: 1, number: 11 };
const range = { unit: "bytes" as const, max: 1500, min: 100, capped: false };

describe("금칙어 근거·고칠 말 (N34)", () => {
  it("걸린 말이 든 구와 고칠 말", () => {
    const hits = findForbidden(BODY);
    const school = hits.find((h) => h.ruleId === "school")!;
    expect(school.phrase).toBe("서울대학교 주최 과학탐구대회");
    expect(school.fix).toEqual({ from: "서울대학교 주최 과학탐구대회에서 수상한 경험", to: "과학 탐구 활동 경험" });
    expect(BODY.slice(school.index, school.index + school.word.length)).toBe("서울대학교");
    const paper = hits.find((h) => h.ruleId === "paper")!;
    expect(paper.phrase).toBe("소논문");
    expect(paper.fix).toEqual({ from: "소논문", to: "탐구 보고서" });
  });
  it("대학명만 있으면 '대학'으로, 학원·등급은 구째 빼기", () => {
    expect(findForbidden("서울대 교수의 강연을 듣고 정리함.")[0].fix).toEqual({ from: "서울대", to: "대학" });
    const t = "탐구 주제를 정함. 학원에서 배운 공식을 적용하여, 실험값을 비교함.";
    const h = findForbidden(t).find((x) => x.ruleId === "private")!;
    expect(h.fix).toEqual({ from: "학원에서 배운 공식을 적용하여, ", to: null });
    expect(applyFix(t, h.fix!)).toBe("탐구 주제를 정함. 실험값을 비교함.");
    const g = findForbidden("모의고사 2등급을 받음. 꾸준히 복습함.").find((x) => x.ruleId === "mock")!;
    expect(applyFix("모의고사 2등급을 받음. 꾸준히 복습함.", g.fix!)).toBe("꾸준히 복습함.");
  });
  it("구 · 대회 이름", () => {
    expect(clauseAt("가나함. 다라 학원 마바함. 사아함.", 8)).toBe("다라 학원 마바함. ");
    expect(activityOf("수학경진대회에서")).toBe("수학 탐구 활동");
    expect(activityOf("과학탐구대회")).toBe("과학 탐구 활동");
    expect(activityOf("행사", "물리학")).toBe("물리학 탐구 활동");
  });
  it("근거는 원문을 확인한 규칙에만 (출처·쪽)", () => {
    for (const r of FORBIDDEN_RULES) if (r.basis) expect(r.basis.source).toMatch(/^2026 기재요령 \d+쪽$/);
    expect(FORBIDDEN_RULES.find((r) => r.id === "sensitive")!.basis).toBeUndefined();
  });
});

describe("어미 고칠 말", () => {
  it("규칙으로 바꿀 수 있는 꼴만", () => {
    expect(fixEnding("결과를 정리하였다.")).toBe("결과를 정리함.");
    expect(fixEnding("실험을 설계했다")).toBe("실험을 설계함.");
    expect(fixEnding("관심 분야는 물리이다.")).toBe("관심 분야는 물리임.");
    expect(fixEnding("성실한 태도를 보였다.")).toBe("성실한 태도를 보임.");
    expect(fixEnding("개념을 익혔었다.")).toBe("개념을 익혔음.");
    expect(fixEnding("열심히 하자!")).toBeNull();
  });
});

describe("자동 검사 행 (N34)", () => {
  const c = autoCheck(BODY, range, findIdentity(BODY, who));
  it("막음 행: 구 · 근거 · 고칠 말 · 밑줄 자리", () => {
    const row = c.rows.find((r) => r.key === "ban-서울대학교")!;
    expect(row.level).toBe("block");
    expect(row.basis?.source).toBe("2026 기재요령 19쪽");
    expect(row.ranges).toEqual([{ start: BODY.indexOf("서울대학교"), end: BODY.indexOf("서울대학교") + "서울대학교 주최 과학탐구대회".length }]);
  });
  it("학번·실명은 빼기, 어미는 '~함.'", () => {
    const id = c.rows.find((r) => r.key === "id")!;
    expect(id.fix).toEqual({ from: "학생A는 ", to: null });
    expect(id.ranges[0]).toEqual({ start: 0, end: 3 });
    const end = c.rows.find((r) => r.key === "end")!;
    expect(end.fix).toEqual({ from: "정리하였다.", to: "정리함." });
    expect(BODY.slice(end.ranges[0].start, end.ranges[0].end)).toBe("정리하였다.");
  });
  it("규칙 고칠 말을 모두 적용하면 막음이 사라진다", () => {
    const fixed = applyRuleFixes(BODY, c.rows);
    expect(fixed.startsWith("빛의 굴절 실험에서")).toBe(true);
    expect(fixed).toContain("과학 탐구 활동 경험을 살려 실험 결과를 탐구 보고서 형식으로 정리함.");
    const again = autoCheck(fixed, range, findIdentity(fixed, who));
    expect(again.status).not.toBe("block");
    expect(fixableRows(again)).toHaveLength(0);
  });
  it("분량 행은 밑줄·고칠 말 없음", () => {
    const short = autoCheck("짧게 씀.", range, []);
    const len = short.rows.find((r) => r.key === "len")!;
    expect(len.ranges).toEqual([]);
    expect(len.fix).toBeUndefined();
  });
});

describe("전·후 비교 wordDiff", () => {
  it("빠진 어절과 들어온 어절", () => {
    const d = wordDiff("결과를 소논문 형식으로 정리하였다.", "결과를 탐구 보고서 형식으로 정리함.");
    expect(d.removed.map((r) => "결과를 소논문 형식으로 정리하였다.".slice(r.start, r.end))).toEqual(["소논문", "정리하였다."]);
    expect(d.added.map((r) => "결과를 탐구 보고서 형식으로 정리함.".slice(r.start, r.end))).toEqual(["탐구 보고서", "정리함."]);
    expect(d.changes).toBe(2);
  });
  it("같은 글이면 바뀐 곳 없음 · 조각 나누기", () => {
    expect(wordDiff("가 나 다", "가 나 다").changes).toBe(0);
    expect(splitByRanges("가나다라", [{ start: 1, end: 3 }])).toEqual([{ text: "가", on: false }, { text: "나다", on: true }, { text: "라", on: false }]);
  });
});

describe("비슷한 문장 similarPairs", () => {
  const A = "빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정하고 스넬 법칙과 비교해 오차 원인을 분석함. 과학 탐구 활동 경험을 살림.";
  const C = "입사각을 5도 간격으로 바꾸며 굴절각을 측정하고 스넬 법칙과 비교해 오차 원인을 분석함. 프리즘으로 빛의 분산을 관찰함.";
  const B = "용수철 진자의 주기를 측정하고 질량과의 관계를 그래프로 나타냄.";
  it("여섯 어절 넘게 이어진 곳을 한 구간으로", () => {
    const pairs = similarPairs([{ id: "a", text: A }, { id: "b", text: B }, { id: "c", text: C }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a).toBe("a");
    expect(pairs[0].b).toBe("c");
    expect(pairs[0].runs).toHaveLength(1);
    const r = pairs[0].runs[0];
    expect(A.slice(r.aStart, r.aEnd)).toBe("입사각을 5도 간격으로 바꾸며 굴절각을 측정하고 스넬 법칙과 비교해 오차 원인을 분석함");
    expect(C.slice(r.bStart, r.bEnd)).toBe("입사각을 5도 간격으로 바꾸며 굴절각을 측정하고 스넬 법칙과 비교해 오차 원인을 분석함");
    expect(r.words).toBe(12);
    expect(similarCount(pairs, "a")).toBe(1);
    expect(similarCount(pairs, "b")).toBe(0);
    expect(pairsOf(pairs, "c")[0].other).toBe("a");
  });
  it("다섯 어절까지는 세지 않는다", () => {
    expect(similarPairs([{ id: "a", text: "하나 둘 셋 넷 다섯 가" }, { id: "b", text: "하나 둘 셋 넷 다섯 나" }])).toHaveLength(0);
  });
  it("공통 활동 글은 빼고 센다", () => {
    const common = "과학의 날 행사에서 모둠별로 굴절 실험 부스를 운영함.";
    const pairs = similarPairs([{ id: "a", text: `${common} 혼자 더 조사함.` }, { id: "b", text: `${common} 친구를 도움.` }], { ignore: [common] });
    expect(pairs).toHaveLength(0);
  });
});

describe("순화 bluntWords", () => {
  it("퉁명스러운 말과 자리", () => {
    const t = "수업 중 자주 졸고 과제를 안 냄";
    const h = bluntWords(t);
    expect(h.map((x) => x.word)).toEqual(["졸고", "안 냄"]);
    expect(t.slice(h[1].start, h[1].end)).toBe("안 냄");
    expect(bluntLine(h)).toBe("‘졸고’ ‘안 냄’");
  });
  it("평범한 말은 걸리지 않는다", () => {
    expect(bluntWords("새 규칙을 제안함. 졸업 앨범 제작을 맡아 편안한 분위기를 만듦.")).toEqual([]);
  });
});
