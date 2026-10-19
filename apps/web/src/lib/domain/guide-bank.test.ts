import { describe, expect, it } from "vitest";
import { findInText, GUIDE, GUIDE_FAQ, guideEntry, keepCited, nearGuide, scrubQuestion, searchGuide, sectionOrder, sectionPages } from "./guide-bank";
import { FORBIDDEN_RULES } from "./forbidden";

describe("기재요령 인용 모음 형식 (N43)", () => {
  it("항목마다 쪽 · 원문 · 질문 · 판정", () => {
    const ids = new Set<string>();
    for (const e of GUIDE.entries) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.page).toBeGreaterThanOrEqual(1);
      expect(e.pdfPage).toBeGreaterThanOrEqual(e.page);
      expect(e.quote.trim().length, e.id).toBeGreaterThan(3);
      expect(e.questions.length, e.id).toBeGreaterThanOrEqual(1);
      expect(["불가", "가능", "조건"]).toContain(e.verdict);
      expect(e.short).toMatch(/요\.?$/);
    }
    expect(GUIDE.entries.length).toBeGreaterThanOrEqual(30);
  });
  it("PDF 대조를 마쳤다 (verify-guide-bank.mjs)", () => {
    expect(GUIDE.verified?.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(GUIDE.verified?.entries).toBe(GUIDE.entries.length);
  });
  it("find 는 있는 규칙만 가리킨다", () => {
    const known = new Set([...FORBIDDEN_RULES.map((r) => r.id), "contest", "cert", "english"]);
    for (const e of GUIDE.entries) for (const f of e.find ?? []) expect(known.has(f), `${e.id}:${f}`).toBe(true);
  });
  it("N34 금칙어 근거는 같은 id의 원문", () => {
    for (const r of FORBIDDEN_RULES) {
      if (!r.basis) continue;
      const e = guideEntry(r.basis.id!)!;
      expect(e.quote).toBe(r.basis.quote);
      expect(r.basis.source).toBe(`2026 기재요령 ${e.page}쪽`);
    }
  });
});

describe("규칙 검색 searchGuide", () => {
  it("자주 묻는 질문 칩은 기대한 원문이 1위", () => {
    for (const f of GUIDE_FAQ) expect(searchGuide(f.q)[0]?.entry.id, f.q).toBe(f.id);
  });
  it("말이 조금 달라도 찾는다", () => {
    expect(searchGuide("진로활동 특기사항 몇 글자까지 써요")[0].entry.id).toBe("len-career");
    expect(searchGuide("아버지가 의사인 것 써도 되나요")[0].entry.id).toBe("parent");
    expect(searchGuide("토익 점수")[0].entry.id).toBe("lang-test");
    expect(searchGuide("행발 몇 자")[0].entry.id).toBe("len-behavior");
  });
  it("대회명은 교외 대회 · 기관 이름 두 원문", () => {
    expect(searchGuide("대회명 써도 돼요?").map((h) => h.entry.id).slice(0, 2)).toEqual(["award", "name"]);
  });
  it("원문에 없는 질문은 [] (지어내지 않음)", () => {
    expect(searchGuide("급식 메뉴 써도 돼요?")).toEqual([]);
    expect(searchGuide("드론 촬영 써도 돼요?")).toEqual([]);
    expect(searchGuide("")).toEqual([]);
  });
  it("자격증은 원문(19쪽)이 있어 찾는다", () => {
    expect(searchGuide("드론 자격증 써도 돼요?")[0].entry.id).toBe("cert");
  });
  it("지금 영역 항목을 먼저", () => {
    expect(sectionOrder("세특").map((s) => s.section).slice(0, 2)).toEqual(["작성 시 유의사항", "교과학습발달상황"]);
    expect(sectionOrder("행발")[1].section).toBe("행동특성 및 종합의견");
    expect(sectionPages("분량")).toMatch(/쪽$/);
  });
  it("비슷한 주제는 문턱 아래 항목만", () => {
    for (const e of nearGuide("드론 촬영 써도 돼요?")) expect(searchGuide("드론 촬영 써도 돼요?").some((h) => h.entry.id === e.id)).toBe(false);
  });
});

describe("이 글에서 찾기 findInText", () => {
  const text = "빗면 실험에서 오차 원인을 찾아 다시 측정함. 이후 강원대학교 주최 과학탐구대회에 참가하여 같은 주제를 발표함.";
  it("대회 · 대학 이름을 본문 자리로", () => {
    const award = findInText(guideEntry("award")!, text);
    expect(award.map((r) => r.word)).toContain("과학탐구대회");
    const name = findInText(guideEntry("name")!, text);
    expect(name[0].word).toMatch(/강원대학교/);
    for (const r of [...award, ...name]) expect(text.slice(r.start, r.end)).toBe(r.word);
  });
  it("영문 · 부모 직업", () => {
    expect(findInText(guideEntry("english")!, "PPT로 발표하고 Python 코드를 짬.").map((r) => r.word)).toEqual(["PPT", "Python"]);
    expect(findInText(guideEntry("parent")!, "아버지의 직업인 의사를 보며 진로를 정함.").length).toBeGreaterThan(0);
    expect(findInText(guideEntry("parent")!, "실험을 성실히 함.")).toEqual([]);
  });
  it("겹치는 자리는 하나만", () => {
    const r = findInText({ find: ["award", "contest"] }, "교외 대회에 나감");
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].end);
  });
});

describe("AI 정리 인용 거르기 keepCited", () => {
  it("후보 밖 인용 · 인용 없는 문장은 버린다", () => {
    const out = keepCited([
      { text: "교외 대회는 쓸 수 없어요 [1].", cites: ["award"] },
      { text: "드론 자격증은 써도 돼요.", cites: [] },
      { text: "지어낸 규칙이에요.", cites: ["made-up"] },
      { text: "대학 이름도 쓰지 않아요.", cites: ["name", "award"] },
    ], ["award", "name"]);
    expect(out.map((s) => s.cites)).toEqual([["award"], ["name", "award"]]);
    expect(out[0].text).toBe("교외 대회는 쓸 수 없어요.");
  });
  it("남는 문장이 없으면 빈 배열", () => {
    expect(keepCited([{ text: "아무 말", cites: ["x"] }], ["award"])).toEqual([]);
  });
});

describe("질문 가리기 scrubQuestion", () => {
  it("학생 이름 · 학번은 보내지 않는다", () => {
    expect(scrubQuestion("한지민 20111 부모 직업 써도 돼요?", ["한지민", "김"])).toBe("학생 학번 부모 직업 써도 돼요?");
  });
});
