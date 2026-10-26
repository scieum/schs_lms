import { describe, expect, it } from "vitest";
import { libraryDescription, libraryFor, libraryLine, libraryRubric, libraryTitle, type LibItem, type LibPlan } from "./assess-library";
import g1 from "./assess-library/2026-2-g1.json";
import g2 from "./assess-library/2026-2-g2.json";
import g3 from "./assess-library/2026-2-g3.json";
import { checkRubric, rubricTotal } from "./rubric";

const poem: LibItem = {
  title: "성찰하는 시 쓰기", weight: 15, max: 100, when: "9월",
  standards: [{ code: "10공국2-02-02", text: "" }, { code: "10공국2-05-02", text: "" }],
  overview: "자신의 경험과 삶을 성찰하여 시를 창작한다.", methods: ["서술·논술", "토의·토론"],
  criteria: [
    { area: "운율 형성", name: "운율", points: 20, perItem: null, levels: [{ points: 20, desc: "효과적으로 형성함." }, { points: 15, desc: "다소 부족함." }, { points: 5, desc: "확인하기 어려움." }] },
    { area: "갈래 특징", name: "시의 언어", points: 10, perItem: null, levels: [{ points: 10, desc: "효과적으로 사용함." }, { points: 5, desc: "미흡함." }] },
    { area: "작품해설", name: "해설", points: 30, perItem: null, levels: [{ points: 30, desc: "a" }, { points: 20, desc: "b" }, { points: 15, desc: "c" }, { points: 10, desc: "d" }] },
  ],
  notes: null,
};
const proof: LibItem = {
  ...poem, title: "수학적 증명", standards: [],
  criteria: [{ area: "증명", name: "증명, 설명능력", points: 20, perItem: 5, levels: [20, 16, 12, 8, 4, 2].map((p) => ({ points: p, desc: `${p}점 수준` })) }],
};
const plans: LibPlan[] = [
  { source: "2학년", year: 2026, semester: 2, grade: 2, subjects: [{ subject: "공통국어2", perfRatio: 30, items: [{ ...poem, title: "다른 학년" }] }] },
  { source: "1학년", year: 2026, semester: 2, grade: 1, subjects: [{ subject: "공통국어 2", perfRatio: 30, items: [poem, { ...poem, title: "책 대화하기" }] }, { subject: "공통수학2", perfRatio: 40, items: [proof] }] },
];

describe("평가계획서 라이브러리 (N78)", () => {
  it("과목 이름으로 찾고 같은 학년 · 학기 계획서가 앞", () => {
    const got = libraryFor(plans, { subject: "공통국어2", year: 2026, grade: 1, semester: 2 });
    expect(got.map((x) => x.title)).toEqual(["성찰하는 시 쓰기", "책 대화하기", "다른 학년"]);
    expect(got[0].key).not.toBe(got[1].key);
    expect(libraryFor(plans, { subject: "물리학", year: 2026, grade: 1, semester: 2 })).toEqual([]);
  });
  it("가장 많은 단계가 4 이상이면 A~E, 모자라는 아래 수준은 0점 · 빈칸", () => {
    const r = libraryRubric(poem)!;
    expect(r.scale).toBe("A-E");
    expect(r.criteria.map((c) => c.points)).toEqual([20, 10, 30]);
    expect(r.criteria[0].levels.map((l) => l.points)).toEqual([20, 15, 5, 0, 0]);
    expect(r.criteria[0].levels[3].desc).toBe("");
    expect(r.criteria[2].levels.map((l) => [l.label, l.points])).toEqual([["A", 30], ["B", 20], ["C", 15], ["D", 10], ["E", 0]]);
    expect(checkRubric(r)).toBeNull();
  });
  it("3단계 이하면 상중하", () => {
    const r = libraryRubric({ ...poem, criteria: poem.criteria.slice(0, 2) })!;
    expect(r.scale).toBe("상중하");
    expect(r.criteria[1].levels.map((l) => l.points)).toEqual([10, 5, 0]);
  });
  it("문항마다 같은 기준은 문항 수만큼 늘리고, 넘치는 단계는 마지막 칸에 잇는다", () => {
    const r = libraryRubric(proof)!;
    expect(r.criteria.map((c) => c.name)).toEqual(["1번 · 증명, 설명능력", "2번 · 증명, 설명능력", "3번 · 증명, 설명능력", "4번 · 증명, 설명능력", "5번 · 증명, 설명능력"]);
    expect(rubricTotal(r)).toBe(100);
    expect(r.criteria[0].levels.map((l) => l.points)).toEqual([20, 16, 12, 8, 2]);
    expect(r.criteria[0].levels[4].desc).toBe("4점 수준 / 2점 수준");
    expect(checkRubric(r)).toBeNull();
  });
  it("점수가 없는 단계는 기본 비율, 기준이 없으면 null", () => {
    const r = libraryRubric({ ...poem, criteria: [{ area: "이해", name: "이해 및 표현", points: 100, perItem: null, levels: [{ points: null, desc: "모두" }, { points: null, desc: "비교적" }, { points: null, desc: "제한적" }] }] })!;
    expect(r.criteria[0].levels.map((l) => l.points)).toEqual([100, 60, 30]);
    expect(libraryRubric({ ...poem, criteria: [] })).toBeNull();
  });
  it("성취기준은 그 과목 목록에 있는 코드만 (괄호 무시)", () => {
    const r = libraryRubric(poem, [{ code: "[10공국2-02-02]" }, { code: "[10공국2-01-01]" }])!;
    expect(r.standards).toEqual(["[10공국2-02-02]"]);
  });
  it("실제 계획서(1학년 2학기): 모든 수행평가가 맞는 루브릭이 되고, 기준 총점 = 만점 · 반영 비율 합 = 수행평가 비율", () => {
    const plan = g1 as LibPlan;
    expect(plan.subjects.length).toBe(10);
    for (const s of plan.subjects) {
      expect(s.items.reduce((a, x) => a + (x.weight ?? 0), 0), s.subject).toBe(s.perfRatio);
      for (const x of s.items) {
        expect(libraryTitle(x).length, x.title).toBeGreaterThan(1);
        const r = libraryRubric(x);
        expect(r, x.title).not.toBeNull();
        expect(checkRubric(r!), x.title).toBeNull();
        const pts = x.criteria.reduce((a, c) => a + (c.points ?? 0) * (c.perItem ?? 1), 0);
        if (x.criteria.every((c) => c.points != null) && x.max != null) expect(pts, x.title).toBe(x.max);
        expect(libraryDescription(x), x.title).not.toMatch(/perItem|인쇄됨|겹침/);
      }
    }
    const social = libraryFor([plan], { subject: "통합사회2", year: 2026, grade: 1, semester: 2 })[0];
    const r = libraryRubric(social)!;
    expect(r.criteria.map((c) => `${c.name} ${c.points}`)).toEqual(["1회 · 내용정리 20", "1회 · 탐구쓰기 30", "2회 · 내용정리 20", "2회 · 탐구쓰기 30"]);
  });
  it("실제 계획서(2학년 2학기): 25과목 · 루브릭 · 비율 합 · 기준 총점 (계획서 오류는 check 로 표시)", () => {
    const plan = g2 as LibPlan;
    expect(plan.subjects.length).toBe(25);
    for (const s of plan.subjects) {
      expect(s.items.reduce((a, x) => a + (x.weight ?? 0), 0), s.subject).toBe(s.perfRatio);
      for (const x of s.items) {
        const r = libraryRubric(x);
        expect(r, x.title).not.toBeNull();
        expect(checkRubric(r!), x.title).toBeNull();
        const pts = x.criteria.reduce((a, c) => a + (c.points ?? 0) * (c.perItem ?? 1), 0);
        if (!x.check) expect(pts, x.title).toBe(x.max);
        expect(x.criteria.length, x.title).toBeLessThanOrEqual(8);
      }
    }
    // 같은 학년 계획서가 먼저, 다른 학년은 뒤로
    const lit = libraryFor([g1 as LibPlan, plan], { subject: "문학", year: 2026, grade: 2, semester: 2 });
    expect(lit.map((x) => x.title)).toEqual(["책 서평쓰기", "책 대화 나누기"]);
    const calc = libraryRubric(libraryFor([plan], { subject: "미적분Ⅰ", year: 2026, grade: 2, semester: 2 })[0])!;
    expect(calc.criteria.map((c) => c.name)).toEqual(["극한과 연속 (5점 문항) (문항마다)", "극한과 연속 (2.5점 문항) (문항마다)", "미분법 (5점 문항) (문항마다)", "미분법 (2.5점 문항) (문항마다)"]);
  });
  it("실제 계획서(3학년 2학기): 39과목 · P/F 과목은 비율 없이도 루브릭이 됨", () => {
    const plan = g3 as LibPlan;
    expect(plan.subjects.length).toBe(39);
    for (const s of plan.subjects) {
      if (s.perfRatio != null) expect(s.items.reduce((a, x) => a + (x.weight ?? 0), 0), s.subject).toBe(s.perfRatio);
      for (const x of s.items) {
        const r = libraryRubric(x);
        expect(r, x.title).not.toBeNull();
        expect(checkRubric(r!), x.title).toBeNull();
        const pts = x.criteria.reduce((a, c) => a + (c.points ?? 0) * (c.perItem ?? 1), 0);
        if (!x.check && x.max != null) expect(pts, x.title).toBe(x.max);
      }
    }
    // 같은 이름 과목(영미문학읽기)은 학년이 맞는 계획서가 먼저
    const lit = libraryFor([g1 as LibPlan, g2 as LibPlan, plan], { subject: "영미문학읽기", year: 2026, grade: 3, semester: 2 });
    expect(lit[0].grade).toBe(3);
    expect(libraryFor([plan], { subject: "화학Ⅱ", year: 2026, grade: 3, semester: 2 }).map((x) => x.title)).toEqual(["반응 속도 자료 해석", "효소와 촉매 탐구 보고서", "반응 속도 실생활 예시 탐구"]);
  });
  it("한 줄 · 평가 내용", () => {
    expect(libraryLine(poem)).toBe("9월 · 반영 15% · 100점");
    expect(libraryLine({ when: null, weight: null, max: 100 })).toBe("100점");
    expect(libraryDescription(poem)).toBe("자신의 경험과 삶을 성찰하여 시를 창작한다.\n평가 방법: 서술·논술 · 토의·토론");
    expect(libraryDescription({ ...poem, overview: "가".repeat(600) }).length).toBe(500);
  });
});
