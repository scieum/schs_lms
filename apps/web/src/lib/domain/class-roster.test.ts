import { describe, expect, it } from "vitest";
import { listLines, matchRoster } from "./class-roster";
import { readTemplate, TEMPLATES } from "./excel-template";
import type { Student } from "./types";

const st = (id: string, grade: number, classNo: number, number: number, name: string) =>
  ({ id, pseudonymId: id, studentNo: `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade, classNo, number, name, gender: "남", track: 1, careerGoal: null }) as Student;

const students = [st("a", 2, 1, 3, "김민준"), st("b", 2, 4, 12, "이서연"), st("c", 2, 6, 5, "박지훈"), st("d", 3, 1, 3, "김민준")];
const HEAD = [...TEMPLATES.list.legacy!];
/** 명단 양식 표 → 명단 줄 (양식이 아니면 null) */
const read = (rows: string[][]) => {
  const body = readTemplate(rows, "list");
  return body && listLines(body);
};

describe("명단 양식 읽기", () => {
  it("양식(학번·학년·반·번호·이름)만 읽는다", () => {
    const lines = read([HEAD, ["20103", "", "", "", "김민준"], ["20412", "", "", "", "이서연"], ["29999", "", "", "", "없는학생"]])!;
    expect(lines).toHaveLength(3);
    const r = matchRoster(lines, students, 2);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "b"]);
    expect(r.unmatched.map((l) => l.name)).toEqual(["없는학생"]);
  });
  it("양식이 아니면 null: 나이스 출석부 · 다른 머리글 · 머리글 없음 · 제목 순서 바뀜", () => {
    expect(read([["교과시간별 출석부"], ["연번", "학과", "학년", "반", "번호", "성  명"], ["1", "일반학과", "2", "1", "3", "김민준"]])).toBeNull();
    expect(read([["번호", "학번", "성명"], ["1", "20103", "김민준"]])).toBeNull();
    expect(read([["20605", "박지훈"]])).toBeNull();
    expect(read([["학번", "학년", "반", "번호", "성명"], ["20103", "2", "1", "3", "김민준"]])).toBeNull();
    expect(read([["이름", "학번", "학년", "반", "번호"]])).toBeNull();
  });
  it("제목 앞뒤 공백은 괜찮고, 빈 줄은 건너뛴다", () => {
    const lines = read([[" 학번", "학년 ", "반", "번호", "이름", ""], [], ["", "2", "6", "5", "박지훈"]])!;
    expect(lines.map((l) => [l.studentNo, l.grade, l.classNo, l.number, l.name])).toEqual([[null, 2, 6, 5, "박지훈"]]);
  });
  it("학년·반·번호 + 같은 이름은 학년으로 구분, 중복 줄은 한 번만", () => {
    const lines = read([HEAD, ["", "2", "6", "5", "박지훈"], ["", "2", "1", "3", "김민준"], ["", "2", "1", "3", "김민준"]])!;
    const r = matchRoster(lines, students, 2);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "c"]);
    expect(r.duplicates).toBe(1);
  });
  it("학번과 이름이 다르면 맞추지 않음", () => {
    const r = matchRoster(read([HEAD, ["20103", "", "", "", "홍길동"]])!, students, 2);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
  });
  it("이름만 있으면 고를 수 있는 학생 중 한 명뿐일 때만", () => {
    const r = matchRoster(read([HEAD, ["", "", "", "", "박지훈"], ["", "", "", "", "김민준"]])!, students);
    expect(r.matched.map((s) => s.id)).toEqual(["c"]);
    expect(r.unmatched.map((l) => l.name)).toEqual(["김민준"]);
  });
  it("화면 학생 모양만 있어도 맞춤 (고를 수 있는 학생 안에서만)", () => {
    const pool = students.filter((s) => s.grade === 2).map(({ id, studentNo, grade, classNo, number, name }) => ({ id, studentNo, grade, classNo, number, name }));
    const r = matchRoster(read([HEAD, ["20103", "", "", "", "김민준"], ["30103", "", "", "", "김민준"]])!, pool);
    expect(r.matched.map((s) => s.id)).toEqual(["a"]);
    expect(r.unmatched.map((l) => l.studentNo)).toEqual(["30103"]);
  });
  it("이름 뒤 (공동) 같은 덧붙임은 빼고 학번·이름으로 맞춤", () => {
    const lines = read([HEAD, ["20103", "", "", "", "김민준(공동)"], ["20412", "", "", "", "이서연 [전입]"]])!;
    expect(lines.map((l) => l.name)).toEqual(["김민준", "이서연"]);
    expect(matchRoster(lines, students, 2).matched.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("명단 양식 — 학번 하나로 (2026-10-22)", () => {
  it("새 양식(학번 · 이름)은 학년 · 반 · 번호를 학번에서 펼친다", () => {
    const body = readTemplate([[...TEMPLATES.list.columns], ["20103", "김민준"], ["30103", "김민준"]], "list")!;
    expect(body[0].cells).toEqual(["20103", "2", "1", "3", "김민준"]);
    const r = matchRoster(listLines(body), students, 2);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "d"]);
  });
});
