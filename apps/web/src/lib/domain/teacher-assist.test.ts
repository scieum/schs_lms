import { describe, expect, it } from "vitest";
import {
  briefingRule, cleanCourseSuggestion, cleanHeaderMap, counselQuestionsRule, deptGroups, filterLabel, filterStudents, guessHeaders,
  matchRosterText, parseStudentQuery, polishLogRule, suggestCoursesRule, type RosterPerson,
} from "./teacher-assist";
import { composeKeywordMemo, parseKeywordMemo, plainMemo } from "./writing";

const people: RosterPerson[] = [
  { id: "a", name: "김민수", grade: 2, classNo: 3, number: 12, studentNo: "20312" },
  { id: "b", name: "이서연", grade: 2, classNo: 1, number: 5, studentNo: "20105" },
  { id: "c", name: "박지훈", grade: 1, classNo: 2, number: 7, studentNo: "10207" },
  { id: "d", name: "박지훈", grade: 3, classNo: 4, number: 1, studentNo: "30401" },
];

describe("오늘 브리핑 (규칙)", () => {
  it("실패 → 마감 → 검토 대기 → 상담 순, 3줄까지", () => {
    const r = briefingRule({ failed: 2, waiting: 5, noCounsel: 4, dueSoon: [{ id: "p1", title: "과학 탐구", dday: "D-2", missing: 3 }] });
    expect(r).toHaveLength(3);
    expect(r[0].text).toContain("생성 실패 초안 2건");
    expect(r[1].href).toBe("/teacher/programs/p1#remind");
    expect(r[2].text).toContain("검토 대기 초안 5건");
  });
  it("미응답이 없는 마감은 건너뛰고, 할 일이 없으면 빈 목록", () => {
    expect(briefingRule({ failed: 0, waiting: 0, noCounsel: 0, dueSoon: [{ id: "p", title: "x", dday: "D-1", missing: 0 }] })).toEqual([]);
  });
});

describe("누가기록 다듬기 (규칙)", () => {
  it("군말을 지우고 명사형 어미로", () => {
    expect(polishLogRule("어 실험 보고서 발표했다")).toBe("실험 보고서 발표함.");
  });
  it("3조각 이상은 2문장으로 묶는다", () => {
    const out = polishLogRule("자료 조사함. 실험 설계함. 결과 발표함.");
    expect(out.split(". ").length).toBe(2);
    expect(out.endsWith("함.")).toBe(true);
  });
  it("빈 메모는 빈 문자열", () => {
    expect(polishLogRule("  음  ")).toBe("");
  });
});

describe("부원 명단 붙여넣기", () => {
  it("학번 · 학년-반-번호 · 이름으로 찾는다", () => {
    const r = matchRosterText("20312\n2-1-5\n이서연\n박지훈\n홍길동", people);
    expect(r.matched).toEqual(["a", "b"]);
    expect(r.ambiguous).toEqual(["박지훈"]);
    expect(r.unknown).toEqual(["홍길동"]);
  });
  it("엑셀 탭 복사(학년·반·번호·이름)와 동명이인 좁히기", () => {
    const r = matchRosterText("1\t2\t7\t박지훈\n3학년 4반 박지훈", people);
    expect(r.matched).toEqual(["c", "d"]);
  });
  it("쉼표로 나열한 이름, 같은 학생은 한 번만", () => {
    expect(matchRosterText("김민수, 이서연, 김민수", people).matched).toEqual(["a", "b"]);
  });
});

describe("내 교과 추천 (규칙)", () => {
  const courses = [{ id: "c1", group: "과학" as const }, { id: "c2", group: "국어" as const }, { id: "c3", group: "과학" as const }];
  it("부서 이름 → 교과", () => {
    expect(deptGroups("과학과")).toEqual(["과학"]);
    expect(deptGroups("정보·컴퓨터")).toEqual(["기술·가정/정보"]);
    expect(deptGroups("교육과정부")).toEqual([]);
    expect(deptGroups(null)).toEqual([]);
  });
  it("교과의 편제표 과목을 담는다", () => {
    expect(suggestCoursesRule("과학과", [], courses)).toEqual({ groups: ["과학"], courseIds: ["c1", "c3"] });
  });
  it("AI 추천은 편제표·교과 목록 안으로 거른다", () => {
    expect(cleanCourseSuggestion({ groups: ["물리", "국어"], courseIds: ["c1", "zz", "c1"] }, courses)).toEqual({ groups: ["국어", "과학"], courseIds: ["c1"] });
  });
});

describe("상담 질문 (규칙)", () => {
  it("가장 최근 영역의 질문 3개, 기록이 없으면 진로", () => {
    expect(counselQuestionsRule([{ area: "진로", date: "2026-03-01" }, { area: "학습", date: "2026-05-01" }])[0]).toContain("공부 계획");
    expect(counselQuestionsRule([])).toHaveLength(3);
  });
});

describe("엑셀 열 맞추기", () => {
  it("양식 이름 + 느슨한 포함 관계", () => {
    expect(guessHeaders(["학년도", "학급(반)", "출석 번호", "학생 성명", "성 별"])).toEqual({ grade: 0, classNo: 1, number: 2, name: 3, gender: 4 });
  });
  it("AI 열 번호 검사: 범위 밖·중복·null 제거", () => {
    expect(cleanHeaderMap({ grade: 0, classNo: 0, number: 9, name: 2, gender: null }, 5)).toEqual({ grade: 0, name: 2 });
  });
});

describe("학생 말로 찾기", () => {
  it("2학년 3반 여학생", () => {
    expect(parseStudentQuery("2학년 3반 여학생")).toEqual({ filter: { grade: 2, classNo: 3, gender: "여" }, rest: "" });
  });
  it("2-3 남, 이름", () => {
    expect(parseStudentQuery("2-3 남").filter).toEqual({ grade: 2, classNo: 3, gender: "남" });
    expect(parseStudentQuery("김민").filter).toEqual({ name: "김민" });
  });
  it("못 읽은 말은 rest 로", () => {
    expect(parseStudentQuery("1학년 동아리 안 한 학생").rest).not.toBe("");
  });
  it("필터 적용·표시", () => {
    const list = people.map((p) => ({ ...p, gender: p.id === "b" ? "여" : "남" }));
    expect(filterStudents(list, { grade: 2, gender: "여" }).map((s) => s.id)).toEqual(["b"]);
    expect(filterLabel({ grade: 2, classNo: 3, gender: "여" })).toBe("2학년 · 3반 · 여학생");
  });
});

describe("키워드로 쓰기 (노션 입력 형식)", () => {
  const blocks = [
    { topic: "빗면 가속도", activity: "각도를 바꿔 측정함", keywords: "실험 설계" },
    { topic: "", activity: "오차 원인 발표", keywords: "" },
  ];
  it("칸 → (주제)/(활동)/(키워드) 글 → 칸", () => {
    const memo = composeKeywordMemo(blocks);
    expect(memo).toBe("(주제) 빗면 가속도\n(활동) 각도를 바꿔 측정함\n(키워드) 실험 설계\n\n(활동) 오차 원인 발표");
    expect(parseKeywordMemo(memo)).toEqual(blocks);
    expect(parseKeywordMemo("그냥 메모")).toBeNull();
  });
  it("예시 초안용 평범한 메모: 키워드는 빼고 주제로 잇는다", () => {
    expect(plainMemo(composeKeywordMemo(blocks))).toBe("빗면 가속도를 주제로 각도를 바꿔 측정함\n오차 원인 발표");
    expect(plainMemo("그냥 메모")).toBe("그냥 메모");
  });
});
