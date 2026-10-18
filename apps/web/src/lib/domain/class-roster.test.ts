import { describe, expect, it } from "vitest";
import { matchRoster, readRosterTable, splitPasted } from "./class-roster";
import type { Student } from "./types";

const st = (id: string, grade: number, classNo: number, number: number, name: string) =>
  ({ id, pseudonymId: id, studentNo: `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`, grade, classNo, number, name, gender: "남", track: 1, careerGoal: null }) as Student;

const students = [st("a", 2, 1, 3, "김민준"), st("b", 2, 4, 12, "이서연"), st("c", 2, 6, 5, "박지훈"), st("d", 3, 1, 3, "김민준")];

describe("이동반 명단 읽기", () => {
  it("나이스 엑셀처럼 머리글이 있는 표", () => {
    const rows = [["2026학년도 2학기 물리학 수강생 명단"], ["번호", "학번", "성명", "성별"], ["1", "20103", "김민준", "남"], ["2", "20412", "이서연", "여"], ["3", "29999", "없는학생", "남"]];
    const lines = readRosterTable(rows);
    expect(lines).toHaveLength(3);
    const r = matchRoster(lines, students, 2);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "b"]);
    expect(r.unmatched.map((l) => l.name)).toEqual(["없는학생"]);
  });
  it("학년·반·번호 열 + 같은 이름은 학년으로 구분", () => {
    const lines = readRosterTable([["학년", "반", "번호", "이름"], ["2", "6", "5", "박지훈"], ["2", "1", "3", "김민준"], ["2", "1", "3", "김민준"]]);
    const r = matchRoster(lines, students, 2);
    expect(r.matched.map((s) => s.id)).toEqual(["a", "c"]);
    expect(r.duplicates).toBe(1);
  });
  it("나이스 화면에서 복사해 붙여넣기 (머리글 없음)", () => {
    const lines = readRosterTable(splitPasted("1\t20605\t박지훈\n2\t20412\t이서연\n"));
    expect(lines.map((l) => l.studentNo)).toEqual(["20605", "20412"]);
    expect(matchRoster(lines, students).matched.map((s) => s.id)).toEqual(["b", "c"]);
  });
  it("학번과 이름이 다르면 맞추지 않음", () => {
    const r = matchRoster(readRosterTable([["학번", "성명"], ["20103", "홍길동"]]), students, 2);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
  });
  it("붙여넣기: 2-3-12 · 2학년 3반 12번 · 이름만", () => {
    const lines = readRosterTable(splitPasted("2-1-3 김민준\n2학년 4반 12번 이서연\n박지훈\n"));
    expect(lines.map((l) => [l.grade, l.classNo, l.number, l.name])).toEqual([[2, 1, 3, "김민준"], [2, 4, 12, "이서연"], [null, null, null, "박지훈"]]);
    expect(matchRoster(lines, students).matched.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("화면 학생 모양만 있어도 맞춤 (고를 수 있는 학생 안에서만)", () => {
    const pool = students.filter((s) => s.grade === 2).map(({ id, studentNo, grade, classNo, number, name }) => ({ id, studentNo, grade, classNo, number, name }));
    const r = matchRoster(readRosterTable([["학번", "이름"], ["20103", "김민준"], ["30103", "김민준"]]), pool);
    expect(r.matched.map((s) => s.id)).toEqual(["a"]);
    expect(r.unmatched.map((l) => l.studentNo)).toEqual(["30103"]);
  });
  it("나이스 출석부: 제목 줄 · 띄어 쓴 머리글(성  명) · 학과 칸", () => {
    const rows = [["교과시간별 출석부"], ["속초고등학교", "", "2026학년도 2학기"], ["연번", "학과", "학년", "반", "번호", "성  명"], ["1", "일반학과", "2", "1", "3", "김민준"], ["2", "일반학과", "2", "4", "12", "이서연"]];
    const lines = readRosterTable(rows);
    expect(lines.map((l) => l.name)).toEqual(["김민준", "이서연"]);
    expect(matchRoster(lines, students, 2).matched.map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("머리글이 없어도 학과·학교 이름은 학생 이름으로 읽지 않음", () => {
    const lines = readRosterTable([["교과시간별"], ["1", "일반학과", "20605", "박지훈"], ["속초고등학교"]]);
    expect(lines.map((l) => [l.studentNo, l.name])).toEqual([["20605", "박지훈"]]);
  });
  it("이름 뒤 (공동) 같은 덧붙임은 빼고 학번·이름으로 맞춤", () => {
    const lines = readRosterTable([["학번", "성명"], ["20103", "김민준(공동)"], ["20412", "이서연 [전입]"]]);
    expect(lines.map((l) => l.name)).toEqual(["김민준", "이서연"]);
    expect(matchRoster(lines, students, 2).matched.map((s) => s.id)).toEqual(["a", "b"]);
    expect(readRosterTable(splitPasted("20605 박지훈(공동)")).map((l) => l.name)).toEqual(["박지훈"]);
  });
});
