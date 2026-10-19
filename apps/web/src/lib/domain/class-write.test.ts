import { describe, expect, it } from "vitest";
import {
  capTargets, CLASS_WRITE_RESUME_MS, groupCounts, groupOf, isRateLimited, parseSavedRun, pickDefault, prunePicked, reasonOf, resumeTargets, selectable, sortRows, summarize, toggleGroup,
  type WriteCandidate, type WriteRow,
} from "./class-write";

// 시안 값: 물리학 1분반 — 메모 있고 글 없음 · 글 있음 · 메모 없음 · 확정
const list: WriteCandidate[] = [
  { id: "a", memos: 3, status: "empty" },
  { id: "b", memos: 2, status: "empty" },
  { id: "e", memos: 1, status: "draft" },
  { id: "f", memos: 3, status: "confirmed" },
  { id: "h", memos: 0, status: "empty" },
  { id: "j", memos: 0, status: "draft" },
];

describe("반 전체 글 쓰기 · 쓸 학생 고르기 (N42 ①)", () => {
  it("묶음: 확정 > 글 있음 > 메모 없음 > 메모 있고 글 없음", () => {
    expect(list.map(groupOf)).toEqual(["ready", "ready", "has_text", "locked", "no_memo", "has_text"]);
    expect(groupCounts(list)).toEqual({ ready: 2, has_text: 2, no_memo: 1, locked: 1 });
  });
  it("기본 선택 = 메모가 있고 글이 비었고 확정이 아닌 학생", () => {
    expect(pickDefault(list)).toEqual(["a", "b"]);
  });
  it("확정 학생은 고를 수 없다 · 글 있음은 다시 쓰기를 켜야 · 메모 없음은 고를 수 있다", () => {
    expect(selectable(list[3], true)).toBe(false);
    expect(selectable(list[2], false)).toBe(false);
    expect(selectable(list[2], true)).toBe(true);
    expect(selectable(list[4], false)).toBe(true);
    expect(reasonOf(list[3], false)).toBe("확정 · 고를 수 없음");
    expect(reasonOf(list[2], false)).toBe("글 있음 · 다시 쓰기 꺼짐");
    expect(reasonOf(list[4], false)).toBe("메모 없음");
    expect(reasonOf(list[0], false)).toBeNull();
  });
  it("묶음 칩: 넣기/빼기 · 확정 묶음은 누를 수 없음 · 다시 쓰기 꺼짐이면 글 있음은 안 들어감", () => {
    expect(toggleGroup(list, ["a", "b"], "ready", false)).toEqual([]);
    expect(toggleGroup(list, [], "no_memo", false)).toEqual(["h"]);
    expect(toggleGroup(list, ["a"], "locked", false)).toEqual(["a"]);
    expect(toggleGroup(list, ["a"], "has_text", false)).toEqual(["a"]);
    expect(toggleGroup(list, ["a"], "has_text", true)).toEqual(["a", "e", "j"]);
  });
  it("다시 쓰기를 끄면 글 있는 학생이 빠진다", () => {
    expect(prunePicked(list, ["a", "e", "j", "f"], false)).toEqual(["a"]);
  });
  it("학생 수 상한 40명", () => {
    const ids = Array.from({ length: 45 }, (_, i) => `s${i}`);
    expect(capTargets(ids)).toEqual({ ids: ids.slice(0, 40), cut: 5 });
  });
});

describe("진행 행 · 요약", () => {
  const rows: WriteRow[] = [
    { id: "1", state: "waiting" },
    { id: "2", state: "done", at: 10, outcome: { status: "done", bytes: 1412, max: 1500, versionId: "v1" } },
    { id: "3", state: "failed", outcome: { status: "failed", error: "x" } },
    { id: "4", state: "running" },
    { id: "5", state: "done", at: 20, outcome: { status: "done", bytes: 1236, max: 1500, versionId: "v2" } },
    { id: "6", state: "skipped", outcome: { status: "skipped", reason: "no_memo" } },
  ];
  it("쓰는 중 순서: 실패 → 쓰는 중 → 완료(최근 순) → 대기 → 건너뜀", () => {
    expect(sortRows(rows).map((r) => r.id)).toEqual(["3", "4", "5", "2", "1", "6"]);
  });
  it("끝 순서: 실패 · 건너뜀 먼저", () => {
    expect(sortRows(rows, true).map((r) => r.id).slice(0, 2)).toEqual(["3", "6"]);
  });
  it("요약 숫자 · 끝났는지", () => {
    const s = summarize(rows);
    expect(s).toMatchObject({ total: 6, done: 2, running: 1, waiting: 1, failed: 1, skipped: 1, noMemo: 1, finished: false });
    expect(summarize(rows.filter((r) => r.state !== "waiting" && r.state !== "running")).finished).toBe(true);
  });
  it("429 · 과부하 문구", () => {
    expect(isRateLimited("AI 사용량이 많아요. 잠시 뒤 다시 눌러 주세요")).toBe(true);
    expect(isRateLimited("AI 호출 실패 (529)")).toBe(true);
    expect(isRateLimited("AI 답을 읽지 못했어요")).toBe(false);
  });
});

describe("이어 쓰기 (sessionStorage · 서버 판단)", () => {
  const now = Date.parse("2026-10-19T10:00:00Z");
  it("30분이 지나면 배너 없음 · 깨진 값은 무시", () => {
    const run = { runId: "r", startedAt: new Date(now - 60_000).toISOString(), ids: ["a", "b"], rewrite: false, target: 1500 };
    expect(parseSavedRun(JSON.stringify(run), now)).toEqual(run);
    expect(parseSavedRun(JSON.stringify({ ...run, startedAt: new Date(now - CLASS_WRITE_RESUME_MS - 1).toISOString() }), now)).toBeNull();
    expect(parseSavedRun("{", now)).toBeNull();
    expect(parseSavedRun(null, now)).toBeNull();
  });
  it("남은 학생 = 처음 고른 학생 중 서버가 끝났다고 하지 않은 학생", () => {
    expect(resumeTargets({ ids: ["a", "b", "c"] }, ["b"])).toEqual(["a", "c"]);
  });
});
