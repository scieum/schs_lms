import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canEditQuestion, checkAnswer, checkQuestion, filterQna, qnaCounts, SEED_QNA, type QnaPost } from "./qna";

const ask = (over: Partial<QnaPost>): QnaPost => ({ ...SEED_QNA[0], id: "x", answer: null, authorId: "t1", authorName: "가 선생님", answeredBy: null, answeredAt: null, createdAt: "2026-10-25T00:00:00Z", ...over });

describe("문의 게시판", () => {
  it("처음 문답 · 운영 SQL(0035 · seed_qna_*.sql)에도 같은 글", () => {
    expect(SEED_QNA).toHaveLength(4);
    const dir = new URL("../../../supabase/", import.meta.url);
    const sql = [readFileSync(new URL("migrations/0035_qna.sql", dir), "utf8"),
      ...readdirSync(dir).filter((f) => /^seed_qna_.*\.sql$/.test(f)).map((f) => readFileSync(new URL(f, dir), "utf8"))].join("\n");
    for (const p of SEED_QNA) {
      expect(sql).toContain(`'${p.id}'`);
      expect(sql).toContain(p.answer!.split("\n")[0]);
    }
    expect(qnaCounts(SEED_QNA)["조각 · 글 짓기"]).toBe(3);
  });

  it("질문 · 답 길이 검사", () => {
    expect(checkQuestion({ category: "없음", title: "제목", question: "질문입니다요" })).toMatch(/분류/);
    expect(checkQuestion({ category: "나이스", title: "제", question: "질문입니다요" })).toMatch(/제목/);
    expect(checkQuestion({ category: "나이스", title: "제목", question: "짧" })).toMatch(/질문/);
    expect(checkQuestion({ category: "나이스", title: "제목", question: "질문입니다요" })).toBeNull();
    expect(checkAnswer(" ")).toMatch(/답/);
    expect(checkAnswer("네, 돼요")).toBeNull();
  });

  it("거르기: 답 여부 · 분류 · 찾기 · 최신 위", () => {
    const list = [...SEED_QNA, ask({ category: "나이스" })];
    expect(filterQna(list, { state: "답변 대기" }).map((p) => p.id)).toEqual(["x"]);
    expect(filterQna(list, { state: "답변 완료" })).toHaveLength(4);
    expect(filterQna(list, { category: "나이스" })).toHaveLength(1);
    expect(filterQna(list, { text: "휴지통 지울" }).map((p) => p.id)).toEqual(["qna-piece-delete"]);
    expect(filterQna(list, {})[0].id).toBe("x");
  });

  it("고치기 · 지우기: 답 전 본인 · 관리자", () => {
    expect(canEditQuestion(ask({}), { id: "t1", admin: false })).toBe(true);
    expect(canEditQuestion(ask({ answer: "답" }), { id: "t1", admin: false })).toBe(false);
    expect(canEditQuestion(ask({}), { id: "t2", admin: false })).toBe(false);
    expect(canEditQuestion(SEED_QNA[0], { id: "t2", admin: true })).toBe(true);
  });
});
