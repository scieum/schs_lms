import { describe, expect, it } from "vitest";
import { resolveLength } from "./length";
import {
  addDays, afterAttempt, buildQuestions, checkDraft, ddayLabel, effectiveStatus, FIXED_QUESTIONS, findIdentity, keywords, latestVersion,
  maskIdentity, matchFileName, programGates, programStage, quickSplit, reviewStatus, sampleDraft, studentStage, summarizeErrors,
  validateAnswers, validateRanges, errorAdvice, weekTodos, responseDigest, similarSentences, similarity, rephraseRule, type DraftJob, type DraftVersion,
} from "./program";
import type { Student } from "./types";

const st = (id: string, name: string, studentNo: string) =>
  ({ id, pseudonymId: id, studentNo, grade: 2, classNo: 3, number: 1, name, gender: "남", track: 1, careerGoal: null }) as Student;
const job = (p: Partial<DraftJob> = {}): DraftJob => ({
  id: "j", programId: "p", studentId: "s", state: "DONE", attempts: 1, error: null, unit: "bytes", max: 1500,
  manualRequestedAt: null, createdAt: "", updatedAt: "", ...p,
});
const ver = (status: DraftVersion["status"], at: string, jobId = "j"): DraftVersion => ({
  id: at, jobId, programId: "p", studentId: "s", content: "x", status, reason: null, source: "ai", authorId: null, createdAt: at,
});

describe("설문", () => {
  it("고정 4문항 + 추가 0~2문항", () => {
    expect(buildQuestions([])).toHaveLength(4);
    const q = buildQuestions(["발표에서 어려웠던 점은?", " "]);
    expect(Array.isArray(q) && q.map((x) => x.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(typeof buildQuestions(["a", "b", "c"])).toBe("string");
  });
  it("제출은 문항마다 최소 글자, 임시 저장은 상한만", () => {
    const answers = { q1: "짧음" };
    expect(Object.keys(validateAnswers(FIXED_QUESTIONS, answers, true))).toHaveLength(4);
    expect(validateAnswers(FIXED_QUESTIONS, answers, false)).toEqual({});
    expect(validateAnswers(FIXED_QUESTIONS, { q1: "가".repeat(501) }, false).q1).toBeTruthy();
  });
  it("D-day 와 마감", () => {
    expect(ddayLabel("2026-10-20", "2026-10-16")).toBe("D-4");
    expect(ddayLabel("2026-10-16", "2026-10-16")).toBe("D-day");
    expect(ddayLabel("2026-10-15", "2026-10-16")).toBe("마감");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(effectiveStatus({ status: "open", endDate: "2026-10-15" }, "2026-10-16")).toBe("closed");
    expect(effectiveStatus({ status: "draft", endDate: "2026-10-15" }, "2026-10-16")).toBe("draft");
  });
});

describe("서류", () => {
  const list = [st("a", "김민준", "20312"), st("b", "이수아", "20315"), st("c", "수아", "20101")];
  it("파일 이름의 학번이 먼저, 이름은 한 명일 때만", () => {
    expect(matchFileName("20312_김민준_탐구보고서.pdf", list)).toEqual({ studentId: "a", by: "studentNo" });
    expect(matchFileName("과학탐구_김민준.jpg", list)).toEqual({ studentId: "a", by: "name" });
    expect(matchFileName("이수아_보고서.pdf", list)).toEqual({ studentId: "b", by: "name" });
    expect(matchFileName("scan_0012.pdf", list)).toBeNull();
    expect(matchFileName("203120_x.pdf", list)).toBeNull();
  });
  it("이름·학번 가림", () => {
    const people = [{ name: "김민준", studentNo: "20312" }];
    const m = maskIdentity("저는 20312 김민준이고 민준이라고 불러요", people);
    expect(m).toBe("저는 ##### ○○이고 ○○이라고 불러요");
    expect(findIdentity(m, people)).toEqual([]);
    expect(findIdentity("김민준은 20312", people)).toEqual(["실명", "학번"]);
  });
  it("쪽 구간 검사와 빠른 나누기", () => {
    expect(validateRanges([{ from: 1, to: 2, studentId: "a" }, { from: 3, to: 5, studentId: "b" }], 5)).toBeNull();
    expect(validateRanges([{ from: 1, to: 3, studentId: "a" }, { from: 3, to: 5, studentId: "b" }], 5)).toMatch(/겹쳐요/);
    expect(validateRanges([{ from: 1, to: 6, studentId: "a" }], 5)).toMatch(/안에서/);
    expect(validateRanges([{ from: 1, to: 2, studentId: null }], 5)).toMatch(/학생/);
    expect(validateRanges([{ from: 1, to: 1, studentId: "a" }, { from: 2, to: 2, studentId: "a" }], 5)).toMatch(/두 번/);
    expect(quickSplit(7, 3, ["a", "b"])).toEqual([
      { from: 1, to: 3, studentId: "a" }, { from: 4, to: 6, studentId: "b" }, { from: 7, to: 7, studentId: null },
    ]);
  });
});

describe("초안 파이프라인", () => {
  it("실패는 3회까지 다시 시도하고 ERROR(수동 작성 필요)", () => {
    expect(afterAttempt({ attempts: 0 }, true).state).toBe("DONE");
    expect(afterAttempt({ attempts: 0 }, false, "분량 초과")).toMatchObject({ state: "PENDING", attempts: 1 });
    const last = afterAttempt({ attempts: 2 }, false, "분량 초과");
    expect(last.state).toBe("ERROR");
    expect(last.error).toMatch(/수동 작성 필요/);
  });
  it("검토 상태와 마지막 버전", () => {
    const vs = [ver("draft", "1"), ver("rejected", "2"), ver("draft", "0", "other")];
    expect(latestVersion(vs, "j")?.status).toBe("rejected");
    expect(reviewStatus(undefined, undefined)).toBe("대기");
    expect(reviewStatus(job({ state: "RUNNING" }), undefined)).toBe("생성 중");
    expect(reviewStatus(job({ state: "ERROR" }), undefined)).toBe("생성 실패");
    expect(reviewStatus(job(), ver("draft", "1"))).toBe("검토 대기");
    expect(reviewStatus(job(), ver("finalized", "1"))).toBe("확정");
  });
  it("단계와 게이트", () => {
    expect(studentStage({ closed: false })).toBe("S1");
    expect(studentStage({ job: job({ state: "PENDING" }), closed: false })).toBe("S2");
    expect(studentStage({ job: job(), latest: ver("draft", "1"), closed: false })).toBe("S3");
    expect(studentStage({ job: job(), latest: ver("finalized", "1"), closed: false })).toBe("S4");
    expect(studentStage({ job: job(), latest: ver("finalized", "1"), closed: true })).toBe("S5");
    expect(programGates(["S3", "S4"], false)).toEqual(["통과", "통과", "진행", "진행"]);
    expect(programGates(["S1", "S2"], false)).toEqual(["진행", "진행", "대기", "대기"]);
    expect(programGates(["S5", "S5"], false)).toEqual(["통과", "통과", "통과", "통과"]);
    expect(programStage(["S4", "S2", "S3"])).toBe("S2");
    expect(summarizeErrors(["3회 재시도 실패 · 수동 작성 필요 (분량 초과)", "AI 호출 실패 (500)", null])).toHaveLength(2);
  });
});

describe("초안 자동 검사", () => {
  const range = resolveLength("세특", { unit: "chars", max: 100 });
  const people = [{ name: "김민준", studentNo: "20312" }];
  const evidence = [{ label: "설문 Q1", text: "해변 세 곳의 모래 시료에서 미세플라스틱을 현미경으로 관찰하고 지점별 차이를 그래프로 정리해 발표했어요. 후속 조사도 하고 싶어요" }];
  it("통과하는 초안", () => {
    const t = "해변 세 곳의 모래 시료를 채취하여 미세플라스틱 입자를 현미경으로 관찰함. 지점별 차이를 그래프로 정리하여 발표함. 후속 조사 계획을 세움.";
    const c = checkDraft(t, { range, people, evidence });
    expect(c.identity.ok && c.ending.ok && c.evidence.ok && c.length.ok).toBe(true);
    expect(c.allOk).toBe(true);
  });
  it("실명·어미·분량 오류", () => {
    const c = checkDraft("김민준은 실험을 했다. 좋았어요.", { range, people, evidence });
    expect(c.identity.found).toEqual(["실명"]);
    expect(c.ending.bad).toBe(2);
    expect(c.hardFail).toMatch(/실명/);
    expect(checkDraft("가".repeat(120) + "함.", { range, people, evidence }).hardFail).toBe("분량 초과");
  });
  it("프로그램 일반 설명만 쓴 초안은 근거 문장이 모자람", () => {
    const t = "과학 탐구 발표 프로그램에 참여함. 모둠별로 주제를 정해 실험을 수행함. 성실하게 참여하는 모습을 보임.";
    const c = checkDraft(t, { range, people, evidence });
    expect(c.specific.grounded).toBeLessThan(2);
    expect(c.specific.ok).toBe(false);
    expect(c.weak).toBe(true);
    expect(c.allOk).toBe(false);
  });
  it("낱말 뽑기", () => {
    expect(keywords("미세플라스틱을 현미경으로 관찰했어요")).toEqual(expect.arrayContaining(["미세플라스틱", "현미경"]));
  });
  it("예시 초안: 결정적이고 분량 안, 어미 '~함.'", () => {
    const input = {
      title: "과학 탐구 발표", area: "세특" as const, careerGoal: "환경공학",
      answers: ["미세플라스틱이 해양 생물에 미치는 영향을 조사했어요", "표본을 고르는 방법이 중요하다는 걸 배웠어요", "", ""],
      docs: [{ kind: "탐구 보고서", text: null }], range: resolveLength("세특", { unit: "bytes", max: 1500 }),
    };
    const a = sampleDraft(input);
    expect(a).toBe(sampleDraft(input));
    const c = checkDraft(a, { range: input.range, people, evidence: [] });
    expect(c.ending.ok).toBe(true);
    expect(c.length.reason).not.toBe("too_long");
  });
});

describe("AI 보강 규칙 대체", () => {
  it("실패 원인별 조치", () => {
    expect(errorAdvice([{ cause: "근거 부족", n: 2 }, { cause: "모름", n: 1 }])).toEqual([
      "근거 부족 2건 — 설문 미제출·서류 미연결 학생은 담당 교사에게 수동 작성을 요청해요",
      "모름 1건 — 초안 보기에서 오류 내용을 확인하고 직접 작성을 요청해요",
    ]);
  });
  it("이번 주 할 일: 실패·마감 임박이 먼저", () => {
    const base = { status: "open" as const, targets: 10, submitted: 10, review: 0, failed: 0, drafts: 0 };
    const t = weekTodos([
      { ...base, id: "a", title: "A", endDate: "2026-10-20", submitted: 6 },
      { ...base, id: "b", title: "B", endDate: "2026-12-01", review: 3, drafts: 3 },
      { ...base, id: "c", title: "C", endDate: "2026-12-01", failed: 1, drafts: 1 },
      { ...base, id: "d", title: "D", endDate: "2026-12-01", status: "draft" },
      { ...base, id: "e", title: "E", endDate: "2026-12-01", submitted: 0 },
    ], "2026-10-16");
    expect(t.map((x) => x.text)).toEqual(["C 생성 실패 1건", "B 검토 대기 3건", "A D-4 · 미응답 4명", "D 발행 전"]);
  });
  it("응답 분석: 공통 낱말·근거가 얇은 학생", () => {
    const long = "광합성 실험에서 빛의 세기를 바꿔 가며 산소 발생량을 측정했고 결과를 그래프로 정리했다 오차를 줄이려고 세 번 반복했다";
    const d = responseDigest([
      { pid: "S1", answers: [long, "광합성 그래프 해석이 어려웠다 다음엔 온도도 바꿔 보겠다 산소 발생량 비교 비커 전구 거리"] },
      { pid: "S2", answers: ["광합성 실험 재밌었다", "짧음"] },
      { pid: "S3", answers: ["광합성 관찰", "좋았다"] },
    ]);
    expect(d.themes[0]).toBe("광합성 (3명)");
    expect(d.thin.map((x) => x.pid)).toEqual(["S3", "S2"]);
    expect(d.highlights[0]?.pid).toBe("S1");
  });
  it("비슷한 문장 찾기", () => {
    const mine = "광합성 실험에서 빛의 세기에 따른 산소 발생량을 비교하여 그래프로 정리함. 발표에 성실히 참여함.";
    const hits = similarSentences(mine, [
      { label: "S2", text: "광합성 실험에서 빛의 세기에 따른 산소 발생량을 비교하여 표로 정리함." },
      { label: "S3", text: "역사 신문을 만들어 친구들과 공유함." },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ peer: "S2", sentence: "광합성 실험에서 빛의 세기에 따른 산소 발생량을 비교하여 그래프로 정리함." });
    expect(similarity("가나다라", "마바사아")).toBe(0);
  });
  it("문장 다르게 쓰기(규칙)", () => {
    expect(rephraseRule("실험 결과를 표로 정리했다.")).toEqual(["실험 결과를 표로 정리함.", "실험 결과를 표로 체계적으로 정리함."]);
    expect(rephraseRule("결과를 발표함.")).toEqual(["결과를 설명함."]);
  });
});
