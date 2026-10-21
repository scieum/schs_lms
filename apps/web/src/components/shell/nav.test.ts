import { describe, expect, it } from "vitest";
import type { TeacherRole, Viewer } from "@/lib/domain/types";
import { HOMEROOM_MENU, navFor, tabsFor } from "./nav";

const teacher = (roles: TeacherRole[], homeroom: { grade: number; classNo: number } | null = null): Viewer => ({
  kind: "teacher", accountId: "t", mustChangePassword: false, teacher: { id: "t", name: "t", roles, homeroom, dept: null },
});
const labels = (v: Viewer) => navFor(v).map((g) => g.label);
const hrefs = (v: Viewer) => navFor(v).flatMap((g) => g.items.map((it) => it.href));

describe("교사 사이드바 묶음 (N52)", () => {
  it("교과 교사: 홈 · 세특 · 동아리 · 특색활동 · 업무", () => {
    expect(labels(teacher(["subject", "program"]))).toEqual(["", "세특", "동아리", "특색활동", "업무"]);
  });
  it("담임: 담임 묶음이 생기고 홈은 우리 반 홈", () => {
    const v = teacher(["subject", "homeroom"], { grade: 1, classNo: 2 });
    expect(labels(v)).toEqual(["", "세특", "동아리", "담임", "특색활동", "업무"]);
    expect(navFor(v)[0].items[0].href).toBe("/homeroom");
    const hr = navFor(v).find((g) => g.label === "담임")!.items.map((it) => it.label);
    expect(hr).toEqual(["누가기록", "글 짓기", "받은 초안", "글 모아 보기"]);
  });
  it("담임 + 관리자: 우리 반 홈이 담임 묶음에 · 관리 묶음은 맨 끝", () => {
    const v = teacher(["subject", "homeroom", "admin"], { grade: 1, classNo: 2 });
    expect(labels(v).at(-1)).toBe("관리");
    expect(navFor(v).find((g) => g.label === "담임")!.items[0].label).toBe("우리 반 홈");
  });
  it("초안 검토는 프로그램 안 탭이라 메뉴에 없고, 배지는 프로그램에", () => {
    const v = teacher(["subject", "program"]);
    expect(hrefs(v)).not.toContain("/teacher/drafts");
    const prog = navFor(v, { "/teacher/programs": 12 }).flatMap((g) => g.items).find((it) => it.href === "/teacher/programs")!;
    expect(prog.badge).toBe(12);
  });
  it("생기부 조각 · 옛 기록 쓰기 메뉴는 없다", () => {
    const all = hrefs(teacher(["subject", "homeroom", "admin"], { grade: 1, classNo: 2 }));
    for (const old of ["/teacher/pieces", "/teacher/write", "/teacher/setuk", "/homeroom/behavior", "/teacher/logs"]) expect(all).not.toContain(old);
  });
  it("업무 · 관리는 처음에 접힌다", () => {
    const g = navFor(teacher(["subject", "admin"]));
    expect(g.filter((x) => x.fold).map((x) => x.label)).toEqual(["업무", "관리"]);
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
