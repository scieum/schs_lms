import { describe, expect, it } from "vitest";
import {
  alignSentences, buildOriginalSentences, editRatio, guessSentences, noSourceSentences, overlap, parsePins, rankCandidates, removeSentence,
  splitSentences, verifySources, wordChange, type OriginalSentence, type SourceItem,
} from "./provenance";

const S1 = "빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정하고, 스넬 법칙과 비교해 오차 원인을 분석함.";
const S2 = "모둠 발표에서 측정값의 불확도를 그래프로 제시해 친구들의 이해를 도움.";
const S3 = "광섬유의 전반사 원리로 관심을 넓혀 관련 자료를 찾아 정리하는 탐구 태도를 보임.";
const log: SourceItem = { type: "log", ref: "l1", key: "log:l1", kind: "누가기록", where: "10월 2일", chip: "누가 10/2", text: "입사각을 5도씩 바꿔 가며 굴절각을 재고, 오차가 큰 까닭을 스스로 찾음" };
const q3: SourceItem = { type: "survey", ref: "q3", q: "Q3", key: "survey:q3#Q3", kind: "설문", where: "느낀 점", chip: "설문 Q3", text: "불확도를 그래프로 그려 발표했더니 친구들이 이해를 잘 했다" };
const far: SourceItem = { type: "piece", ref: "p1", key: "piece:p1", kind: "조각", where: "10/8", chip: "조각 · 메모", text: "체육대회 줄다리기에서 응원을 이끎" };

function original(): { content: string; sentences: OriginalSentence[] } {
  const content = [S1, S2, S3].join(" ");
  const sp = splitSentences(content);
  return {
    content,
    sentences: [
      { i: 0, start: sp[0].start, end: sp[0].end, sources: [{ type: "log", ref: "l1" }] },
      { i: 1, start: sp[1].start, end: sp[1].end, sources: [{ type: "survey", ref: "q3", q: "Q3" }] },
      { i: 2, start: sp[2].start, end: sp[2].end, sources: [] },
    ],
  };
}

describe("문장 나누기", () => {
  it("마침표 + 공백 · 줄바꿈으로 나누고 자리를 돌려준다", () => {
    const t = `${S1} ${S2}\n${S3}`;
    const sp = splitSentences(t);
    expect(sp.map((s) => s.text)).toEqual([S1, S2, S3]);
    expect(t.slice(sp[1].start, sp[1].end)).toBe(S2);
  });
  it("소수점은 나누지 않는다", () => {
    expect(splitSentences("오차가 3.5%로 줄어듦. 다시 측정함.")).toHaveLength(2);
  });
});

describe("두 번째 검사 (verifySources)", () => {
  it("문장과 2어절 넘게 겹치지 않는 근거는 뗀다", () => {
    expect(verifySources(S1, [log, far])).toEqual([log]);
    expect(verifySources(S3, [log, q3, far])).toEqual([]);
  });
  it("조사가 달라도 같은 어절로 본다", () => {
    expect(overlap("굴절각을 측정함", "굴절각 측정")).toBe(1);
    // 줄기 뒤가 조사·어미가 아니면 다른 말 (굴절 ≠ 굴절각)
    expect(verifySources("굴절 현상을 빛의 진행으로 이해함.", [{ text: "입사각을 바꿔 굴절각 측정" }])).toEqual([]);
  });
});

describe("문장 맞추기 (alignSentences)", () => {
  it("그대로면 근거를 물려받고, 근거 없는 문장은 그대로 근거 없음", () => {
    const a = alignSentences(original(), original().content);
    expect(a.map((s) => s.sources.length)).toEqual([1, 1, 0]);
    expect(noSourceSentences(a).map((s) => s.i)).toEqual([2]);
  });
  it("순서가 바뀌어도 문장마다 맞춘다", () => {
    const a = alignSentences(original(), `${S2} ${S1}`);
    expect(a[0].sources[0].ref).toBe("q3");
    expect(a[1].sources[0].ref).toBe("l1");
  });
  it("두 문장을 합치면 근거를 모은다", () => {
    const merged = `${S1.replace(/함\.$/, "하고,")} ${S2}`;
    const a = alignSentences(original(), merged);
    expect(a).toHaveLength(1);
    expect(a[0].sources.map((s) => s.ref).sort()).toEqual(["l1", "q3"]);
  });
  it("한 문장을 쪼개면 둘 다 근거를 물려받는다", () => {
    const a = alignSentences(original(), "빛의 굴절 실험에서 입사각을 5도 간격으로 바꾸며 굴절각을 측정함. 스넬 법칙과 비교해 오차 원인을 분석함.");
    expect(a.map((s) => s.sources[0]?.ref)).toEqual(["l1", "l1"]);
  });
  it("원안에 없던 문장은 직접(own)", () => {
    const a = alignSentences(original(), `${S1} 질문이 생기면 수업이 끝난 뒤에도 답을 끝까지 확인하려는 태도가 돋보임.`);
    expect(a[1].own).toBe(true);
    expect(noSourceSentences(a)).toHaveLength(0);
  });
  it("교사가 정한 것(pinned)이 먼저: 내가 본 일이에요 · 근거로 잇기", () => {
    const own = alignSentences(original(), original().content, [{ text: S3, sources: [], own: true }]);
    expect(own[2]).toMatchObject({ own: true, pinned: true });
    const linked = alignSentences(original(), original().content, [{ text: S3, sources: [{ type: "piece", ref: "p9" }] }]);
    expect(linked[2].sources[0].ref).toBe("p9");
  });
});

describe("원안 만들기", () => {
  it("표에 없는 표지는 버리고, 두 번째 검사를 거친다", () => {
    const pool = new Map([[log.key, log], [q3.key, q3], [far.key, far]]);
    const s = buildOriginalSentences(`${S1} ${S2} ${S3}`, [
      { text: S1, keys: [log.key, "piece:없음"] }, { text: S2, keys: [q3.key] }, { text: S3, keys: [far.key] },
    ], pool);
    expect(s.map((x) => x.sources.map((r) => r.ref))).toEqual([["l1"], ["q3"], []]);
    expect(s.every((x) => !x.own)).toBe(true);
  });
  it("지금 본문 조각에서만 온 문장은 교사 글(own)", () => {
    const body: SourceItem = { ...far, key: "body", text: S3 };
    const s = buildOriginalSentences(`${S1} ${S3}`, [{ text: S1, keys: [log.key] }, { text: S3, keys: ["body"] }], new Map([[log.key, log], ["body", body]]), { ownKeys: ["body"] });
    expect(s[1].own).toBe(true);
  });
  it("AI 없이(예시 초안)는 규칙으로 근거를 붙인다", () => {
    const s = guessSentences(`${S1} ${S3}`, [log, q3, far]);
    expect(s[0].sources[0].ref).toBe("l1");
    expect(s[1].sources).toEqual([]);
  });
});

describe("수정 비율 (editRatio)", () => {
  it("그대로면 0, 공백·문장부호만 바뀌어도 0", () => {
    expect(editRatio(S1, S1)).toBe(0);
    expect(editRatio("측정함. 분석함.", "측정함, 분석함")).toBe(0);
  });
  it("(빠진 + 보탠 어절) ÷ (원안 + 지금 어절) × 100, 반올림", () => {
    expect(wordChange("가 나 다 라", "가 나 마 라 바")).toEqual({ removed: 1, added: 2, a: 4, b: 5 });
    expect(editRatio("가 나 다 라", "가 나 마 라 바")).toBe(33);
  });
  it("모두 바꾸면 100, 빈 글끼리는 0", () => {
    expect(editRatio("가 나", "다 라")).toBe(100);
    expect(editRatio("", "")).toBe(0);
  });
});

describe("근거 고르기 · 문장 지우기", () => {
  it("겹치는 어절이 많은 순 (같으면 원래 순서)", () => {
    expect(rankCandidates(S2, [far, log, q3]).map((x) => x.ref)).toEqual(["q3", "p1", "l1"]);
  });
  it("문장 하나만 지운다", () => {
    const t = `${S1} ${S2} ${S3}`;
    const sp = splitSentences(t);
    expect(removeSentence(t, sp[1])).toBe(`${S1} ${S3}`);
  });
  it("받은 pins 는 모양을 거른다", () => {
    expect(parsePins([{ text: "가", sources: [{ type: "bad", ref: "x" }, { type: "log", ref: "l1" }] }, { nope: 1 }])).toEqual([{ text: "가", sources: [{ type: "log", ref: "l1" }] }]);
  });
});
