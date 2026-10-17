import { describe, expect, it } from "vitest";
import { measure } from "./length";
import type { Student, Viewer } from "./types";
import {
  badEndings,
  canWriteRecord,
  checkRecord,
  findIdentity,
  fitToMax,
  latestRecordByStudent,
  memoFragments,
  recordMax,
  recordStatus,
  resolveRecordLength,
  sampleDraft,
  scrubIdentity,
  toNeisSentence,
  type RecordDraft,
} from "./writing";

const kim = { id: "s-1", pseudonymId: "S001", studentNo: "20312", grade: 2, classNo: 3, number: 12, name: "김민준", gender: "남", track: 1, careerGoal: "산업디자인" } as Student;
const teacher = (homeroom: { grade: number; classNo: number } | null): Viewer => ({
  kind: "teacher",
  accountId: "t",
  mustChangePassword: false,
  teacher: { id: "t", name: "교사", roles: ["subject"], homeroom, dept: null },
});

describe("분량", () => {
  it("NEIS 한도(2026 기재요령): 행발 900B, 나머지 1500B, 글자 단위는 3으로 나눈다", () => {
    expect(recordMax("진로", "bytes")).toBe(1500);
    expect(recordMax("행발", "bytes")).toBe(900);
    expect(recordMax("진로", "chars")).toBe(500);
    expect(recordMax("행발", "chars")).toBe(300);
    expect(recordMax("동아리", "chars")).toBe(500);
  });
  it("한도를 넘는 설정은 한도로 낮추고 알린다", () => {
    const r = resolveRecordLength("자율·자치", { unit: "bytes", max: 3000 });
    expect(r).toMatchObject({ max: 1500, capped: true });
    expect(resolveRecordLength("진로").max).toBe(1500);
  });
});

describe("실명·학번 가리기", () => {
  it("이름·학번·반 번호를 찾는다", () => {
    expect(findIdentity("김민준 학생은 2학년 3반 12번이며 학번 20312임.", kim)).toHaveLength(3);
    expect(findIdentity("2-3-12 민준이는 성실함.", kim)).toHaveLength(2);
    expect(findIdentity("실험을 설계함.", kim)).toHaveLength(0);
  });
  it("지우면 문장만 남는다", () => {
    const r = scrubIdentity("김민준 학생은 실험을 주도함. 20312 성실함.", kim);
    expect(r.removed).toBe(2);
    expect(r.text).toBe("실험을 주도함. 성실함.");
    expect(findIdentity(r.text, kim)).toHaveLength(0);
  });
  it("AI에 보낼 때는 가명ID로 바꾼다", () => {
    expect(scrubIdentity("김민준이 발표함.", kim, "S001").text).toBe("S001이 발표함.");
  });
  it("학번보다 긴 숫자 속 일부는 건드리지 않는다", () => {
    expect(findIdentity("측정값 120312 기록함.", kim)).toHaveLength(0);
  });
});

describe("NEIS 어미", () => {
  it("~함·~임·~됨으로 끝나지 않는 문장을 찾는다", () => {
    expect(badEndings("실험을 설계함. 결과를 정리했다. 성실한 학생임.")).toEqual(["결과를 정리했다."]);
    expect(badEndings("")).toEqual([]);
  });
  it("문장을 NEIS 어미로 다듬는다", () => {
    expect(toNeisSentence("결과를 정리했다.")).toBe("결과를 정리함.");
    expect(toNeisSentence("모둠 활동에 적극적이다")).toBe("모둠 활동에 적극적임.");
    expect(toNeisSentence("실험 설계 주도")).toBe("실험 설계 주도함.");
    expect(toNeisSentence("관찰력이 돋보임")).toBe("관찰력이 돋보임.");
  });
});

describe("예시 초안 (AI 키 없을 때)", () => {
  const range = { unit: "bytes" as const, max: 1500 };
  it("메모 조각과 누가기록을 이어 붙여 ~함. 으로 만든다", () => {
    const t = sampleDraft({ memo: "실험 설계 주도, 오차 원인 분석", logs: ["진로 탐색 주간에 인터뷰 영상을 보고 관심 분야를 정리함."], careerGoal: null, range });
    expect(t).toBe("실험 설계 주도함. 오차 원인 분석함. 진로 탐색 주간에 인터뷰 영상을 보고 관심 분야를 정리함.");
    expect(badEndings(t)).toEqual([]);
  });
  it("같은 입력이면 같은 결과, 한도를 넘지 않는다", () => {
    const long = Array.from({ length: 80 }, (_, i) => `활동 ${i}에 참여함`).join("\n");
    const a = sampleDraft({ memo: long, logs: [], range });
    expect(a).toBe(sampleDraft({ memo: long, logs: [], range }));
    expect(measure(a, "bytes")).toBeLessThanOrEqual(1500);
  });
  it("메모는 줄·쉼표·가운뎃점으로 나눈다", () => {
    expect(memoFragments("- 성실\n배려심 · 리더십, 꼼꼼")).toEqual(["성실", "배려심", "리더십", "꼼꼼"]);
  });
  it("fitToMax 는 뒤 문장부터 뺀다", () => {
    expect(fitToMax("가나다함. 라마바함.", { unit: "chars", max: 6 })).toBe("가나다함.");
  });
});

describe("자동 검사·상태·권한", () => {
  it("분량·실명·어미를 한 번에 본다", () => {
    const range = resolveRecordLength("행발", { unit: "chars", max: 5 });
    expect(checkRecord("성실함.", range, kim).ok).toBe(true);
    const c = checkRecord("김민준 성실했다.", range, kim);
    expect(c).toMatchObject({ identity: 1, badEndings: 1, ok: false });
  });
  it("학생마다 마지막 버전, 상태 이름", () => {
    const r = (at: string, status: RecordDraft["status"]) => ({ id: at, area: "행발", studentId: "a", authorId: "t", year: 2026, semester: null, content: "x", unit: "bytes", max: 1500, status, createdAt: at }) as RecordDraft;
    const m = latestRecordByStudent([r("2026-10-01", "confirmed"), r("2026-10-03", "draft")]);
    expect(recordStatus(m.get("a"))).toBe("작성 중");
    expect(recordStatus(undefined)).toBe("미작성");
  });
  it("행발·자율·진로는 담임 반만, 동아리는 내 동아리 부원만", () => {
    const hr = teacher({ grade: 2, classNo: 3 });
    expect(canWriteRecord(hr, "행발", kim)).toBe(true);
    expect(canWriteRecord(teacher({ grade: 2, classNo: 1 }), "행발", kim)).toBe(false);
    expect(canWriteRecord(teacher(null), "진로", kim)).toBe(false);
    expect(canWriteRecord(teacher(null), "동아리", kim, { advisorId: "t", memberIds: new Set(["s-1"]) })).toBe(true);
    expect(canWriteRecord(teacher(null), "동아리", kim, { advisorId: "x", memberIds: new Set(["s-1"]) })).toBe(false);
  });
});
