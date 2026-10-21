import { describe, expect, it } from "vitest";
import { matchImport } from "./texts-import";

const students = [{ id: "a", studentNo: "20301", name: "가나다" }, { id: "b", studentNo: "20302", name: "라마바" }];
const row = (line: number, ...cells: string[]) => ({ line, cells });

describe("갖고 있던 생기부 글 올리기 (N66)", () => {
  it("학번 · 이름이 맞으면 넣고, 줄바꿈은 한 문단 · 빈 글은 건너뜀", () => {
    const out = matchImport([row(2, "20301", "가나다", "첫 줄.\n둘째 줄."), row(3, "20302", "라마바", "")], students, new Map([["a", "예전 글"]]), 1500);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ studentId: "a", text: "첫 줄. 둘째 줄.", problem: null, replaces: true, over: false });
  });
  it("지금 글과 같으면(양식에 채운 그대로) 건너뜀", () => {
    expect(matchImport([row(2, "20301", "가나다", "그대로 글.")], students, new Map([["a", "그대로 글."]]), 1500)).toEqual([]);
  });
  it("다른 반 · 이름 다름 · 두 번은 넣지 않음, 한도 넘으면 표시만", () => {
    const long = "가".repeat(600);
    const out = matchImport([row(2, "29999", "누구", "글"), row(3, "20301", "가나라", "글"), row(4, "20302", "라마바", long), row(5, "20302", "라마바", "또")], students, new Map(), 1500);
    expect(out.map((r) => r.problem)).toEqual(["이 반 학생이 아니에요", "이름이 달라요", null, "같은 학생이 두 번 있어요"]);
    expect(out[2].over).toBe(true);
  });
});
