import { describe, expect, it } from "vitest";
import { areaCounts, filterLibrary, insertAt, libraryAreaOf, normalizeTags, stripIdentity, tagCounts, type LibraryEntry } from "./library";

const e = (id: string, text: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id, area: "세특", subject: "물리학", text, tags: [], source: "body", useCount: 0, createdAt: `2026-10-${id.padStart(2, "0")}T00:00:00Z`, ...extra,
});

describe("문장 보관함 (N35 ②)", () => {
  it("이름·학번·주어 꼴을 지우고 지운 자리를 돌려준다", () => {
    const t = "김학생은 모둠 발표에서 측정값의 불확도를 그래프로 제시함.";
    const r = stripIdentity(t, ["김학생"], ["20111"]);
    expect(r.text).toBe("모둠 발표에서 측정값의 불확도를 그래프로 제시함.");
    expect(t.slice(r.removed[0].start, r.removed[0].end)).toBe("김학생은");
  });

  it("성 뺀 이름 · 학번 · 가린 이름 · 학년반번호", () => {
    expect(stripIdentity("민준이는 실험을 설계함.", ["김민준"]).text).toBe("실험을 설계함.");
    expect(stripIdentity("20111 학생의 보고서를 정리함.", [], ["20111"]).text).toBe("보고서를 정리함.");
    expect(stripIdentity("○○는 친구를 도움.", []).text).toBe("친구를 도움.");
    expect(stripIdentity("2학년 3반 1번 발표를 맡음.", []).text).toBe("발표를 맡음.");
    expect(stripIdentity("그래프를 그림.", ["김민준"]).removed).toEqual([]);
  });

  it("태그: # 떼기 · 12자 · 중복 · 5개", () => {
    expect(normalizeTags(["#발표", "발표", " 그래프 ", "", "#가나다라마바사아자차카타파하", "a", "b", "c"])).toEqual(["발표", "그래프", "가나다라마바사아자차카타", "a", "b"]);
    expect(normalizeTags("x")).toEqual([]);
  });

  it("찾기 · 영역 · 태그 · 정렬", () => {
    const list = [
      e("1", "실험 오차의 원인을 분석함.", { tags: ["실험"], useCount: 3 }),
      e("2", "학급 행사 일정을 챙김.", { area: "행발", tags: ["협력"] }),
      e("3", "가설을 세워 검증함.", { tags: ["실험", "탐구"], useCount: 1 }),
    ];
    expect(filterLibrary(list).map((x) => x.id)).toEqual(["3", "2", "1"]);
    expect(filterLibrary(list, { sort: "used" }).map((x) => x.id)).toEqual(["1", "3", "2"]);
    expect(filterLibrary(list, { sort: "abc" }).map((x) => x.id)).toEqual(["3", "1", "2"]);
    expect(filterLibrary(list, { area: "행발" }).map((x) => x.id)).toEqual(["2"]);
    expect(filterLibrary(list, { tag: "실험" }).map((x) => x.id)).toEqual(["3", "1"]);
    expect(filterLibrary(list, { q: "#탐구" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterLibrary(list, { q: "오차" }).map((x) => x.id)).toEqual(["1"]);
    expect(tagCounts(list)[0]).toEqual({ tag: "실험", n: 2 });
    expect(areaCounts(list)).toEqual({ 세특: 2, 창체: 0, 행발: 1, 동아리: 0 });
  });

  it("커서 자리에 넣기 · 영역", () => {
    expect(insertAt("가나. 다라.", "새 문장.", 3)).toEqual({ text: "가나. 새 문장. 다라.", caret: 9 });
    expect(insertAt("가나.", "새 문장.", null).text).toBe("가나. 새 문장.");
    expect(insertAt("", "새 문장.", 0).text).toBe("새 문장.");
    expect(libraryAreaOf("세특")).toBe("세특");
    expect(libraryAreaOf("자율·자치")).toBe("창체");
    expect(libraryAreaOf("동아리")).toBe("동아리");
    expect(libraryAreaOf("행발")).toBe("행발");
  });
});
