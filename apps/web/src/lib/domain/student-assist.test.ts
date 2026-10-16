import { describe, expect, it } from "vitest";
import { judgeMinimum, type Grades, type MinRule } from "./scores";
import {
  careerKeywordsRule, checkDocs, followUpQuestions, frequentWords, minimumNeedLine, nextTopicsRule, orderTodos, type TodoInput,
} from "./student-assist";

const t = (key: string, kind: TodoInput["kind"], due: string, progress = ""): TodoInput => ({ key, kind, title: key, due, progress, href: `/x/${key}` });

describe("할 일 정리", () => {
  it("마감 가까운 순, 같은 날이면 설문 먼저, 3개까지", () => {
    const steps = orderTodos(
      [t("야자", "night", "2026-10-18"), t("서류", "docs", "2026-10-18"), t("설문", "survey", "2026-10-18", "1/4문항"), t("과목", "courses", "2026-10-30")],
      "2026-10-16",
    );
    expect(steps.map((s) => s.key)).toEqual(["설문", "서류", "야자"]);
    expect(steps[0].why).toBe("D-2 · 1/4문항");
  });
  it("지난 마감은 빼고, 오늘·내일은 말로", () => {
    const steps = orderTodos([t("지남", "survey", "2026-10-15"), t("오늘", "docs", "2026-10-16"), t("내일", "night", "2026-10-17")], "2026-10-16");
    expect(steps.map((s) => s.why)).toEqual(["오늘 마감", "내일 마감"]);
  });
});

describe("문항별 더 쓸 수 있는 것", () => {
  it("빈 답은 장면부터 묻는다", () => {
    expect(followUpQuestions("")).toHaveLength(2);
    expect(followUpQuestions("")[0]).toContain("장면");
  });
  it("답에 이미 있는 것(숫자·이유)은 묻지 않는다", () => {
    const asks = followUpQuestions("왜냐하면 궁금해서 3번 실험했다");
    expect(asks).toHaveLength(2);
    expect(asks.join()).not.toContain("숫자");
    expect(asks.join()).not.toContain("왜 그렇게");
  });
  it("모두 쓴 답에도 진로 질문은 남는다", () => {
    expect(followUpQuestions("왜냐하면 2번 했고 어려웠지만 내가 맡아 앞으로 더 알아볼 계획")).toEqual(["이 경험이 내 진로와 어떻게 이어지나요?"]);
  });
});

describe("서류 빠진 항목 점검", () => {
  it("종류가 하나면 아무 파일이나 낸 것으로, 본문이 있으면 빠진 항목", () => {
    const [c] = checkDocs(["탐구 보고서"], [{ name: "a.txt", text: "탐구 주제는 물의 정화. 실험 방법은 여과." }]);
    expect(c.uploaded).toBe(true);
    expect(c.missing).toEqual(["결과", "배운 점·후속"]);
    expect(c.checklist).toEqual([]);
  });
  it("여러 종류면 파일 이름으로 맞추고, 본문이 없으면 체크리스트", () => {
    const cs = checkDocs(["탐구 보고서", "소감문"], [{ name: "보고서_최종.pdf", text: null }]);
    expect(cs[0]).toMatchObject({ kind: "탐구 보고서", uploaded: true, missing: [] });
    expect(cs[0].checklist).toHaveLength(4);
    expect(cs[1]).toMatchObject({ kind: "소감문", uploaded: false });
  });
});

describe("목표 대학 최저 해석", () => {
  const rule = (p: Partial<MinRule> = {}): MinRule => ({
    id: "r", university: "A대", major: "B과", pool: ["ko", "ma", "en", "tam"], pick: 2, maxSum: 5, required: [], historyMax: null, inquiry: "best", note: null, ...p,
  });
  const g = (ko: number, ma: number, en: number, t1: number, t2: number): Grades => ({ ko, ma, en, hi: 3, t1, t2 });
  it("충족·근접·미충족", () => {
    expect(minimumNeedLine("A대", rule(), judgeMinimum(rule(), g(2, 3, 2, 2, 2)))).toContain("충족해요");
    expect(minimumNeedLine("A대", rule(), judgeMinimum(rule(), g(3, 3, 4, 4, 4)))).toContain("1등급만 올리면");
    expect(minimumNeedLine("A대", rule(), judgeMinimum(rule(), g(4, 4, 5, 5, 5)))).toContain("등급 합을 3 줄여야");
  });
  it("기준 없음", () => {
    expect(minimumNeedLine("A대", null, judgeMinimum(null, g(2, 2, 2, 2, 2)))).toContain("기준이 아직 없어요");
  });
});

describe("다음 학년 주제 · 키워드 (규칙)", () => {
  it("진로활동·교과세특 제목 먼저, 겹치면 하나", () => {
    expect(nextTopicsRule([{ area: "자율활동", title: "학급회의" }, { area: "진로활동", title: "환경 탐구" }, { area: "교과세특", title: "환경 탐구" }])).toEqual([
      "환경 탐구 — 한 단계 더 깊이",
      "학급회의 — 한 단계 더 깊이",
    ]);
  });
  it("두 번 이상 나온 낱말", () => {
    expect(frequentWords(["미세먼지를 측정함. 미세먼지 농도와 습도", "습도 변화를 분석함"])).toEqual(["미세먼지", "습도"]);
  });
  it("진로 문장 → 분야", () => {
    expect(careerKeywordsRule("사람들이 쓰기 편한 앱을 개발하고 싶어요")[0].field).toBe("컴퓨터·정보");
    expect(careerKeywordsRule("잘 모르겠어요")).toEqual([]);
  });
});
