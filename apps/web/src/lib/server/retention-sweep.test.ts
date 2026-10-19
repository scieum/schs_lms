// 자동 파기 묶음 시험 (N39): 지울 날이 지난 원본·읽은 글만 지우고, 기록·감사 로그에는 건수만 남는지.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RETENTION } from "@/lib/domain/retention";

vi.mock("server-only", () => ({}));

type Mat = { id: string; programId: string; filePath: string; text: string | null; purgedAt?: string | null; textPurgedAt?: string | null };
const state = {
  programs: [] as { id: string; title: string; ownerId: string; endDate: string; status: string }[],
  materials: [] as Mat[],
  service: [] as { id: string; date: string; filePath: string; purgedAt?: string | null }[],
  holds: [] as { target: string; until: string }[],
  runs: [] as { ranAt: string; programs: number; files: number; texts: number; items: unknown[] }[],
  audit: [] as [string | null, string, string | null][],
  purged: { files: [] as string[], texts: [] as string[], service: [] as string[] },
};

vi.mock("./repo", () => ({
  repo: {
    getRetentionSettings: async () => structuredClone(DEFAULT_RETENTION),
    getTermEnds: async () => ({ t1: "07-31", t2: "01-31" }),
    listRetentionHolds: async () => state.holds,
    listPrograms: async () => state.programs,
    listServiceRecords: async () => state.service,
    listMaterials: async (pid: string) => state.materials.filter((m) => m.programId === pid),
    listDraftJobs: async () => [],
    listDraftVersions: async () => [],
    purgeMaterialFiles: async (ids: string[]) => { state.purged.files.push(...ids); return ids.length; },
    purgeMaterialTexts: async (ids: string[]) => { state.purged.texts.push(...ids); return ids.length; },
    purgeServiceFiles: async (ids: string[]) => { state.purged.service.push(...ids); return ids.length; },
    addRetentionRun: async (r: { programs: number; files: number; texts: number; items: unknown[] }) => { const row = { ...r, ranAt: new Date().toISOString(), id: "x", actorId: null, trigger: "cron" }; state.runs.unshift(row); return row; },
    listRetentionRuns: async () => state.runs,
    audit: async (a: string | null, b: string, c: string | null) => { state.audit.push([a, b, c]); },
  },
}));

const { runRetentionSweep, loadRetentionBundles, sweepIfStale } = await import("./retention-sweep");

beforeEach(() => {
  state.programs = [
    { id: "p1", title: "수학 탐구 주간", ownerId: "t1", endDate: "2026-05-10", status: "closed" }, // 1학기 → 원본 2026-08-30 · 글 2026-10-29
    { id: "p2", title: "과학 탐구 발표", ownerId: "t2", endDate: "2026-10-23", status: "open" }, // 2학기 → 2027-03-02
  ];
  state.materials = [
    { id: "m1", programId: "p1", filePath: "p1/m1", text: "읽은 글" },
    { id: "m2", programId: "p1", filePath: "p1/m2", text: null },
    { id: "m3", programId: "p2", filePath: "p2/m3", text: "읽은 글" },
  ];
  state.service = [{ id: "sv1", date: "2026-04-11", filePath: "s/sv1" }, { id: "sv2", date: "2026-10-01", filePath: "s/sv2" }];
  state.holds = [];
  state.runs = [];
  state.audit = [];
  state.purged = { files: [], texts: [], service: [] };
});

describe("자동 파기 (N39)", () => {
  it("지울 날이 지난 원본만 지우고, 읽은 글은 글 날까지 둔다", async () => {
    const r = await runRetentionSweep("cron", null, "2026-10-19");
    expect(state.purged.files.sort()).toEqual(["m1", "m2"]);
    expect(state.purged.texts).toEqual([]);
    expect(state.purged.service).toEqual(["sv1"]);
    expect(r).toMatchObject({ programs: 2, files: 3, texts: 0 });
    // 감사 로그는 건수만 (파일 이름·학생 이름 없음)
    expect(state.audit).toEqual([[null, "retention.purge", "프로그램 2개 · 원본 3개 · 글 0건 파기 (자동)"]]);
  });

  it("읽은 글 날(학기 마감 후 90일)이 지나면 글도 지운다", async () => {
    await runRetentionSweep("admin", "t-admin", "2026-10-30");
    expect(state.purged.texts).toEqual(["m1"]);
  });

  it("한 번 미루면 그 날까지 두고, 지울 게 없어도 실행 기록은 남긴다", async () => {
    state.holds = [{ target: "p1", until: "2026-11-30" }, { target: "service:2026-1", until: "2026-11-30" }];
    const r = await runRetentionSweep("cron", null, "2026-10-19");
    expect(r.programs).toBe(0);
    expect(state.purged.files).toEqual([]);
    expect(state.runs).toHaveLength(1);
    expect(state.audit).toEqual([]);
  });

  it("묶음: 프로그램 · 봉사 확인서 학기", async () => {
    const { bundles } = await loadRetentionBundles();
    expect(bundles.map((b) => [b.label, b.rawDue, b.textDue])).toEqual([
      ["수학 탐구 주간 · 1학기", "2026-08-30", "2026-10-29"],
      ["과학 탐구 발표 · 2학기", "2027-03-02", "2027-05-01"],
      ["봉사 확인서 · 1학기", "2026-08-30", null],
      ["봉사 확인서 · 2학기", "2027-03-02", null],
    ]);
  });

  it("관리자 방문: 마지막 실행이 24시간 안이면 다시 안 돈다", async () => {
    await runRetentionSweep("cron", null, "2026-10-19");
    expect(await sweepIfStale("t-admin", "2026-10-19")).toBeNull();
  });
});
