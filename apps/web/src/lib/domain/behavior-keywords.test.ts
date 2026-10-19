import { describe, expect, it } from "vitest";
import { addKeyword, cleanPicks, DEFAULT_MENU, makeKeyword, mergeMenu, pickedLabels, visibleItems } from "./behavior-keywords";
import { FEATURE_TRAITS } from "./trait-logs";

describe("행발 키워드 메뉴판 (N35 ④)", () => {
  it("기본 메뉴판: 다섯 묶음 · id 고정 · N28 특징 칩과 같은 낱말", () => {
    expect(DEFAULT_MENU.groups.map((g) => g.label)).toEqual(["학교생활 태도", "공동체·관계", "사고·학습", "자기관리", "성장"]);
    expect(DEFAULT_MENU.groups[0].items[0]).toEqual({ id: "attitude-1", label: "성실함" });
    const labels = DEFAULT_MENU.groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain(FEATURE_TRAITS.find((t) => t.id === "help")!.label);
    expect(labels).toContain("맡은 일 끝까지");
  });

  it("저장본 합치기: 순서 · 숨김 · 내 키워드, 기본 키워드는 지우지 않음", () => {
    const saved = {
      groups: [
        { id: "community", items: [{ id: "community-2", label: "경청" }, { id: "community-5", label: "x", hidden: true }, { id: "c-1", label: "급식 도우미", custom: true }] },
        { id: "unknown", items: [{ id: "c-9", label: "버려짐", custom: true }] },
      ],
    };
    const m = mergeMenu(DEFAULT_MENU, saved);
    const com = m.groups.find((g) => g.id === "community")!;
    expect(com.items.slice(0, 3).map((i) => i.label)).toEqual(["경청", "학급 일 도움", "급식 도우미"]);
    expect(com.items[1].hidden).toBe(true);
    expect(com.items).toHaveLength(8);
    expect(m.groups.flatMap((g) => g.items).some((i) => i.label === "버려짐")).toBe(false);
    expect(mergeMenu(DEFAULT_MENU, null)).toEqual(DEFAULT_MENU);
    expect(visibleItems(com).map((i) => i.label)).not.toContain("학급 일 도움");
    expect(visibleItems(com, ["학급 일 도움"]).map((i) => i.label)).toContain("학급 일 도움");
  });

  it("내 키워드: 12자 · 같은 이름 거절", () => {
    expect(makeKeyword("배려", DEFAULT_MENU)).toBeNull();
    expect(makeKeyword("  ", DEFAULT_MENU)).toBeNull();
    expect(makeKeyword("가나다라마바사아자차카타파", DEFAULT_MENU)?.label).toBe("가나다라마바사아자차카타");
    const { menu, item } = addKeyword(DEFAULT_MENU, "attitude", "1인 1역 꾸준함");
    expect(item).toMatchObject({ label: "1인 1역 꾸준함", custom: true });
    expect(menu.groups[0].items.at(-1)?.label).toBe("1인 1역 꾸준함");
    expect(makeKeyword("1인 1역 꾸준함", menu)).toBeNull();
    expect(makeKeyword("새 말", menu)?.id).not.toBe(item?.id);
  });

  it("고른 키워드: 메뉴판 순서 · 예전 말은 끝 · 정리", () => {
    expect(pickedLabels(DEFAULT_MENU, ["새로운 도전", "옛 키워드", "성실함", "배려"])).toEqual(["성실함", "배려", "새로운 도전", "옛 키워드"]);
    expect(cleanPicks(["성실함", "성실함", "", "[배려]", 3])).toEqual(["성실함", "배려", "3"]);
  });
});
