import { describe, expect, it } from "vitest";
import type { TeacherRole, Viewer } from "@/lib/domain/types";
import { activeHref, arrangeMenus, cleanLayout, HOMEROOM_MENU, layoutOf, moveGroup, moveItem, navFor, stepGroup, stepItem, tabsFor } from "./nav";

const teacher = (roles: TeacherRole[], homeroom: { grade: number; classNo: number } | null = null): Viewer => ({
  kind: "teacher", accountId: "t", mustChangePassword: false, teacher: { id: "t", name: "t", roles, homeroom, dept: null },
});
const labels = (v: Viewer) => navFor(v).map((g) => g.label);
const hrefs = (v: Viewer) => navFor(v).flatMap((g) => g.items.map((it) => it.href));

describe("교사 사이드바 묶음 (N52 → N53)", () => {
  it("교과 교사: 홈 · 업무 · 세특 · 동아리 · 특색활동 · 도구", () => {
    expect(labels(teacher(["subject", "program"]))).toEqual(["", "업무", "세특", "동아리", "특색활동", "협업", "도구"]);
  });
  it("도구: 나이스 입력 · 학생 리포트 · 문장 보관함 · 생기부 팁 (업무에서 뺌)", () => {
    const g = navFor(teacher(["subject"]));
    expect(g.find((x) => x.label === "도구")!.items.map((it) => it.href)).toEqual(["/teacher/neis", "/teacher/reports", "/teacher/library", "/teacher/tips", "/teacher/prompts", "/teacher/qna"]);
    expect(g.find((x) => x.label === "업무")!.items.map((it) => it.href)).toEqual(["/schedule", "/students", "/teacher/counseling", "/students/new"]);
  });
  it("담임: 담임 묶음이 생기고 홈은 우리 반 홈", () => {
    const v = teacher(["subject", "homeroom"], { grade: 1, classNo: 2 });
    expect(labels(v)).toEqual(["", "업무", "세특", "동아리", "특색활동", "협업", "도구", "담임"]);
    expect(navFor(v)[0].items[0].href).toBe("/homeroom");
    const hr = navFor(v).find((g) => g.label === "담임")!.items.map((it) => it.label);
    expect(hr).toEqual(["누가기록", "글 짓기", "받은 초안", "글 모아 보기"]);
  });
  it("담임 + 관리자: 우리 반 홈이 담임 묶음에 · 관리 묶음은 맨 끝", () => {
    const v = teacher(["subject", "homeroom", "admin"], { grade: 1, classNo: 2 });
    expect(labels(v).at(-1)).toBe("관리");
    expect(navFor(v).find((g) => g.label === "담임")!.items[0].label).toBe("우리 반 홈");
  });
  it("특색활동: 내 프로그램 · 새 프로그램 · 초안 검토(배지) · 프로그램 일정 · 봉사 확인서", () => {
    const v = teacher(["subject", "program"]);
    const g = navFor(v, { "/teacher/drafts": 12 }).find((x) => x.label === "특색활동")!;
    expect(g.items.map((it) => it.label)).toEqual(["내 프로그램", "새 프로그램", "초안 검토", "프로그램 일정", "봉사 확인서"]);
    expect(g.items.find((it) => it.href === "/teacher/drafts")!.badge).toBe(12);
    expect(navFor(v).find((x) => x.label === "업무")!.items.map((it) => it.href)).not.toContain("/teacher/service");
  });
  it("생기부 조각 · 옛 기록 쓰기 메뉴는 없다", () => {
    const all = hrefs(teacher(["subject", "homeroom", "admin"], { grade: 1, classNo: 2 }));
    for (const old of ["/teacher/pieces", "/teacher/write", "/teacher/setuk", "/homeroom/behavior", "/teacher/logs"]) expect(all).not.toContain(old);
  });
  it("관리만 처음에 접힌다 (업무는 맨 위라 펼침)", () => {
    const g = navFor(teacher(["subject", "admin"]));
    expect(g.filter((x) => x.fold).map((x) => x.label)).toEqual(["관리"]);
  });
});

describe("교사 모바일 탭 (N52)", () => {
  it("가운데는 홈, 앞 두 칸은 조각 · 글 짓기", () => {
    const t = tabsFor(teacher(["subject", "program"])).map((x) => x.label);
    expect(t).toEqual(["조각", "글 짓기", "홈", "특색", "메뉴"]);
  });
  it("담임만이면 조각 · 글 짓기가 담임 화면으로", () => {
    const t = tabsFor(teacher(["homeroom"], { grade: 1, classNo: 2 }));
    expect(t.map((x) => x.label)).toEqual(["조각", "글 짓기", "홈", "담임", "메뉴"]);
    expect(t[0].href).toBe("/homeroom/logs");
    expect(t[1].href).toBe("/homeroom/compose");
  });
  it("관리자 넷째 칸은 관리", () => {
    expect(tabsFor(teacher(["subject", "admin"]))[3].label).toBe("관리");
  });
  it("담임 탭 메뉴는 담임 묶음 + 우리 반 업무", () => {
    expect(HOMEROOM_MENU.map((g) => g.label)).toEqual(["담임", "우리 반 업무"]);
  });
});

describe("메뉴 순서 바꾸기 (N53)", () => {
  const v = teacher(["subject", "program"]);
  const base = navFor(v);
  const L = layoutOf(base);
  it("저장 없으면 처음 순서 그대로", () => {
    expect(arrangeMenus(base, null)).toBe(base);
  });
  it("묶음 순서 · 묶음 사이로 옮긴 메뉴가 반영되고 홈은 맨 위", () => {
    const moved = moveItem(moveGroup(L, "특색활동", 0), "/teacher/library", "세특", 4);
    const out = arrangeMenus(base, moved);
    expect(out.map((g) => g.label)).toEqual(["", "특색활동", "업무", "세특", "동아리", "협업", "도구"]);
    expect(out.find((g) => g.label === "세특")!.items.map((it) => it.label)).toEqual(["내 수업", "조각 모으기", "수행평가", "글 짓기", "문장 보관함", "글 모아 보기"]);
    expect(out.find((g) => g.label === "도구")!.items.map((it) => it.href)).not.toContain("/teacher/library");
  });
  it("저장 뒤 새로 생긴 메뉴 · 묶음은 처음 자리에, 없어진 묶음 메뉴는 처음 묶음으로", () => {
    const saved = [{ label: "동아리", items: ["/teacher/club"] }, { label: "담임", items: ["/schedule"] }];
    const out = arrangeMenus(base, saved);
    expect(out.map((g) => g.label)).toEqual(["", "동아리", "업무", "세특", "특색활동", "협업", "도구"]);
    expect(out.find((g) => g.label === "업무")!.items[0].href).toBe("/schedule");
    expect(out.find((g) => g.label === "동아리")!.items.length).toBe(4);
  });
  it("도구 묶음이 생기기 전에 저장한 순서: 나이스 입력 등은 도구로 돌아오고 도구는 특색활동 다음", () => {
    const old = [{ label: "특색활동", items: ["/teacher/programs"] }, { label: "업무", items: ["/teacher/neis", "/schedule", "/teacher/tips"] }, { label: "세특", items: ["/teacher/subjects"] }, { label: "동아리", items: ["/teacher/club"] }];
    const out = arrangeMenus(base, old);
    expect(out.map((g) => g.label)).toEqual(["", "특색활동", "협업", "도구", "업무", "세특", "동아리"]);
    expect(out.find((g) => g.label === "도구")!.items.map((it) => it.href)).toEqual(["/teacher/neis", "/teacher/reports", "/teacher/library", "/teacher/tips", "/teacher/prompts", "/teacher/qna"]);
    expect(out.find((g) => g.label === "업무")!.items[0].href).toBe("/schedule");
  });
  it("같은 묶음 안 옮기기 · 묶음 옮기기 자리 계산", () => {
    expect(moveItem(L, "/schedule", "업무", 3).find((g) => g.label === "업무")!.items.slice(0, 3)).toEqual(["/students", "/teacher/counseling", "/schedule"]);
    expect(moveGroup(L, "업무", 4).map((g) => g.label)).toEqual(["세특", "동아리", "특색활동", "업무", "협업", "도구"]);
  });
  it("↑ ↓: 끝에서는 옆 묶음으로 넘어간다", () => {
    const up = stepItem(L, "/teacher/subjects", -1);
    expect(up.find((g) => g.label === "업무")!.items.at(-1)).toBe("/teacher/subjects");
    const down = stepItem(L, "/students/new", 1);
    expect(down.find((g) => g.label === "세특")!.items[0]).toBe("/students/new");
    expect(stepItem(L, "/schedule", -1)).toBe(L);
    expect(stepGroup(L, "세특", -1).map((g) => g.label)).toEqual(["세특", "업무", "동아리", "특색활동", "협업", "도구"]);
  });
  it("저장 전 정리: 남의 메뉴 · 중복은 빼고, 처음과 같으면 null", () => {
    expect(cleanLayout(L, base)).toBeNull();
    const raw = [{ label: "관리", items: ["/admin"] }, { label: "세특", items: ["/schedule", "/schedule", "/admin"] }, "x"];
    expect(cleanLayout(raw, base)).toEqual([{ label: "세특", items: ["/schedule"] }]);
    expect(cleanLayout("nope", base)).toBeNull();
  });
});

describe("지금 화면 메뉴", () => {
  const hs = ["/teacher/programs", "/teacher/programs/new", "/teacher/programs?view=calendar", "/teacher/texts?tab=setuk", "/teacher/texts?tab=record&area=동아리"];
  const at = (path: string, q = "") => activeHref(path, new URLSearchParams(q), hs);
  it("쿼리까지 맞는 메뉴 하나만", () => {
    expect(at("/teacher/programs")).toBe("/teacher/programs");
    expect(at("/teacher/programs", "view=calendar")).toBe("/teacher/programs?view=calendar");
    expect(at("/teacher/programs/new")).toBe("/teacher/programs/new");
    expect(at("/teacher/programs/abc/drafts")).toBe("/teacher/programs");
    expect(at("/teacher/texts", "tab=record&area=동아리")).toBe("/teacher/texts?tab=record&area=동아리");
  });
});
