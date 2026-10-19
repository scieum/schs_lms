"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { autoCheck, fixableRows } from "@/lib/domain/auto-check";
import type { ClassCheckView, ClassViewRow } from "@/lib/domain/class-check";
import { resolveLength } from "@/lib/domain/length";
import { findIdentity } from "@/lib/domain/writing";
import type { LibraryArea } from "@/lib/domain/library";
import type { AiFixResult } from "@/lib/domain/variants";
import { cx } from "@/components/ui";
import { aiFixSetuk, classCheckSetuk, saveSetuk } from "@/app/(app)/teacher/setuk/actions";
import { aiFixDraft, classCheckDrafts, saveDraft } from "@/app/(app)/teacher/drafts/actions";
import { aiFixRecordAction, classCheckRecords, saveRecord } from "@/app/(app)/teacher/write/actions";
import { runPool } from "@/lib/domain/pool";
import { CLASS_WRITE_CONCURRENCY, type WriteRow } from "@/lib/domain/class-write";
import { useClassWriteRun, type ClassWriteRun } from "./class-write-run";
import type { ScopeArg } from "@/app/(app)/teacher/class-actions";

// 작업 화면 상태 (Figma N35): 학생 목록 · 편집 카드 옆에 여는 패널(반 전체 검사 · 문장 보관함)과
// 반 전체 AI 고치기 대기열(화면 상태 — 새로고침하면 사라짐, 패널을 닫아도 같은 탭에서는 계속 만든다).

export type ClassScope =
  | { kind: "setuk"; courseId: string; section: string | null }
  | { kind: "drafts"; programId: string }
  | { kind: "record"; area: string; clubId?: string | null };

/** write = 반 전체 글 쓰기 (Figma N42 ①) */
export type Panel = "check" | "library" | "write" | null;

/** 편집기가 보관함 패널에 알려 주는 것: 본문에 넣기 · 조각으로 넣기 · 지금 영역 */
export type Inserter = { insert: (text: string) => void; addPiece?: (entryId: string) => Promise<{ error?: string }>; area: LibraryArea; subject?: string | null };

export type FixItem = { id: string; status: "making" | "ready" | "put" | "kept" | "error"; before: string; after?: string; left?: number; issues?: number; error?: string };

type Ctx = {
  scope: ClassScope;
  panel: Panel;
  setPanel: (p: Panel) => void;
  view: ClassCheckView | null;
  checking: boolean;
  runCheck: () => void;
  inserter: Inserter | null;
  setInserter: (i: Inserter | null) => void;
  queue: FixItem[] | null;
  queueOpen: boolean;
  setQueueOpen: (b: boolean) => void;
  startFix: (rows: ClassViewRow[]) => void;
  put: (id: string) => Promise<void>;
  undo: (id: string) => Promise<void>;
  keep: (id: string) => void;
  reopen: (id: string) => void;
  /** 반 전체 글 쓰기 (N42): 세특 분반 · 담임 반 · 동아리만 (초안 검토는 없음) */
  write: ClassWriteRun | null;
};

const WsCtx = createContext<Ctx | null>(null);
export const useWorkspace = () => useContext(WsCtx);

const whoOf = (r: ClassViewRow) => ({ name: r.name, studentNo: r.no, grade: Number(r.no.slice(0, 1)), classNo: Number(r.no.slice(1, 3)), number: Number(r.no.slice(3)) });

async function check(scope: ClassScope): Promise<ClassCheckView> {
  if (scope.kind === "setuk") return classCheckSetuk({ courseId: scope.courseId, section: scope.section });
  if (scope.kind === "drafts") return classCheckDrafts({ programId: scope.programId });
  return classCheckRecords({ area: scope.area, clubId: scope.clubId });
}

async function fix(scope: ClassScope, r: ClassViewRow): Promise<AiFixResult> {
  const text = r.text ?? "";
  if (scope.kind === "setuk") return aiFixSetuk({ courseId: scope.courseId, studentId: r.id, text, unit: r.unit, max: r.max, batch: true });
  if (scope.kind === "drafts") return aiFixDraft({ jobId: r.id, text, batch: true });
  return aiFixRecordAction({ area: scope.area, studentId: r.id, clubId: scope.clubId, text, unit: r.unit, max: r.max, batch: true });
}

/** 본문에 넣기 = 기존 저장 액션으로 새 버전(임시 저장). 확정하지 않는다 */
async function save(scope: ClassScope, r: ClassViewRow, text: string): Promise<string | undefined> {
  const fd = new FormData();
  fd.set("content", text);
  fd.set("intent", "draft");
  if (scope.kind === "drafts") {
    fd.set("jobId", r.id);
    return (await saveDraft({}, fd)).error;
  }
  fd.set("studentId", r.id);
  fd.set("lengthUnit", r.unit);
  fd.set("lengthMax", String(r.max));
  if (scope.kind === "setuk") {
    fd.set("courseId", scope.courseId);
    return (await saveSetuk({}, fd)).error;
  }
  fd.set("area", scope.area);
  if (scope.clubId) fd.set("clubId", scope.clubId);
  return (await saveRecord({}, fd)).error;
}

const CONCURRENCY = CLASS_WRITE_CONCURRENCY;

export function WorkspaceProvider({ scope, children, initialPanel = null }: { scope: ClassScope; children: ReactNode; initialPanel?: Panel }) {
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [view, setView] = useState<ClassCheckView | null>(null);
  const [checking, setChecking] = useState(false);
  const [inserter, setInserterState] = useState<Inserter | null>(null);
  const [queue, setQueue] = useState<FixItem[] | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const rowsRef = useRef<Map<string, ClassViewRow>>(new Map());
  const runId = useRef(0);
  const writeScope = useMemo<ScopeArg | null>(() => (scope.kind === "setuk" ? { kind: "setuk", courseId: scope.courseId, section: scope.section } : scope.kind === "record" ? { kind: "record", area: scope.area, clubId: scope.clubId ?? null } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope.kind, scope.kind === "setuk" ? scope.courseId : "", scope.kind === "setuk" ? scope.section : "", scope.kind === "record" ? scope.area : "", scope.kind === "record" ? scope.clubId : ""]);
  const writeRun = useClassWriteRun(writeScope);

  const runCheck = useCallback(() => {
    const id = ++runId.current;
    setChecking(true);
    check(scope)
      .then((v) => { if (id === runId.current) setView(v); })
      .catch(() => { if (id === runId.current) setView({ ok: false, error: "검사하지 못했어요. 다시 눌러 주세요" }); })
      .finally(() => { if (id === runId.current) setChecking(false); });
  }, [scope]);

  const setInserter = useCallback((i: Inserter | null) => setInserterState(i), []);
  const patch = (id: string, p: Partial<FixItem>) => setQueue((q) => q && q.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const startFix = useCallback((rows: ClassViewRow[]) => {
    const targets = rows.filter((r) => r.text);
    rowsRef.current = new Map(targets.map((r) => [r.id, r]));
    setQueue(targets.map((r) => ({ id: r.id, status: "making", before: r.text!, issues: r.issues })));
    setQueueOpen(true);
    // N42: 동시 3 풀 (끝나는 대로 다음 학생)
    void runPool(targets, CONCURRENCY, async (r) => {
      const res = await fix(scope, r);
      if (!res.ok) { patch(r.id, { status: "error", error: res.error }); return; }
      const range = { ...resolveLength("세특", { unit: r.unit, max: r.max }), max: r.max };
      const c = autoCheck(res.text, range, findIdentity(res.text, whoOf(r)));
      const left = fixableRows(c).length + c.rows.filter((x) => x.key === "len" && x.label.startsWith("분량 초과")).length;
      patch(r.id, { status: "ready", after: res.text, left });
    }, { onError: (r) => patch(r.id, { status: "error", error: "고치지 못했어요" }) });
  }, [scope]);

  const put = useCallback(async (id: string) => {
    const r = rowsRef.current.get(id);
    const item = queue?.find((x) => x.id === id);
    if (!r || !item?.after) return;
    const err = await save(scope, r, item.after);
    patch(id, err ? { error: err } : { status: "put", error: undefined });
  }, [queue, scope]);

  const undo = useCallback(async (id: string) => {
    const r = rowsRef.current.get(id);
    const item = queue?.find((x) => x.id === id);
    if (!r || !item) return;
    const err = await save(scope, r, item.before);
    patch(id, err ? { error: err } : { status: "ready", error: undefined });
  }, [queue, scope]);

  const keep = useCallback((id: string) => patch(id, { status: "kept" }), []);
  const reopen = useCallback((id: string) => patch(id, { status: "ready" }), []);

  const write = writeScope ? writeRun : null;
  const value = useMemo<Ctx>(() => ({ scope, panel, setPanel, view, checking, runCheck, inserter, setInserter, queue, queueOpen, setQueueOpen, startFix, put, undo, keep, reopen, write }),
    [scope, panel, view, checking, runCheck, inserter, setInserter, queue, queueOpen, startFix, put, undo, keep, reopen, write]);
  return <WsCtx.Provider value={value}>{children}</WsCtx.Provider>;
}

/** 목록 행의 상태 칩: 반 전체 검사 패널이 열려 있으면 검사 결과 태그로 바꾼다 (닫으면 원래 작성 상태 칩) */
export function CheckStatus({ id, children }: { id: string; children: ReactNode }) {
  const ws = useWorkspace();
  // 반 전체 글 쓰기 중 (N42): ✓ 임시 · ✦ 쓰는 중 · 대기 · 실패 · 건너뜀
  const w = ws?.panel === "write" && ws.write && ws.write.phase !== "idle" ? ws.write.rows.find((r) => r.id === id) : undefined;
  if (w) return <WriteTag row={w} />;
  const row = ws?.panel === "check" && ws.view?.ok ? ws.view.rows.find((r) => r.id === id) : undefined;
  if (!row) return <>{children}</>;
  return <ResultTag status={row.status} />;
}

export const RESULT: Record<ClassViewRow["status"], { label: string; tag: string; dot: string }> = {
  block: { label: "확정 불가", tag: "bg-bad-soft text-bad", dot: "bg-bad" },
  warn: { label: "확인", tag: "bg-wait-soft text-[#9A6400]", dot: "bg-wait" },
  pass: { label: "통과", tag: "bg-ok-soft text-ok", dot: "bg-ok" },
  empty: { label: "빈 글", tag: "bg-soft text-mute", dot: "bg-hair" },
};

const WRITE_TAG: Record<WriteRow["state"], { label: string; tag: string }> = {
  done: { label: "✓ 임시", tag: "bg-ok-soft text-[#00A05D]" },
  running: { label: "✦ 쓰는 중", tag: "bg-new-soft text-[#0B8FB0]" },
  waiting: { label: "대기", tag: "bg-soft text-sub" },
  failed: { label: "실패", tag: "bg-bad-soft text-bad" },
  skipped: { label: "건너뜀", tag: "bg-soft text-mute" },
};

export function WriteTag({ row, long }: { row: Pick<WriteRow, "state">; long?: boolean }) {
  const t = WRITE_TAG[row.state];
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] font-bold", t.tag)}>{long && row.state === "done" ? "✓ 임시 저장" : t.label}</span>;
}

export function ResultTag({ status }: { status: ClassViewRow["status"] }) {
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] font-bold", RESULT[status].tag)}>{RESULT[status].label}</span>;
}

/**
 * 작업 화면 칸: 목록 | 편집(또는 반 전체 검사 패널) | (근거 자료) | (보관함 패널: xl 이상은 오른쪽 420 카드, 그보다 좁으면 바텀시트).
 * 편집 카드는 패널이 열려도 숨기기만 한다(쓰던 글이 그대로 남게).
 */
export function WorkspaceGrid({ list, main, aside, checkPanel, libraryPanel, writePanel, kind }: {
  list: ReactNode; main: ReactNode; aside?: ReactNode; checkPanel: ReactNode; libraryPanel?: ReactNode; writePanel?: ReactNode; kind: "setuk" | "record";
}) {
  const ws = useWorkspace();
  // 반 전체 검사 · 반 전체 글 쓰기(N42)는 편집 카드 자리를 대신한다
  const writing = ws?.panel === "write" && !!writePanel;
  const check = ws?.panel === "check" || writing;
  // 모바일 시작 화면은 바텀시트 — 뒤 목록 · 편집 카드를 그대로 둔다
  const sheet = writing && ws?.write?.phase === "idle";
  const lib = ws?.panel === "library" && !!libraryPanel;
  const base = kind === "setuk" ? "md:grid-cols-[300px_minmax(0,1fr)]" : "md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_300px]";
  return (
    <div data-guide-grid className={cx("grid gap-4 md:gap-6", base, lib && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
      {/* N43 기재요령 패널이 열리면(1280 이상) 학생 목록을 숨긴다 — globals.css data-guide-hide */}
      <div data-guide-hide className={cx("min-w-0", check && !sheet && "max-md:hidden", lib && "xl:hidden")}>{list}</div>
      <div className={cx("min-w-0", check && (sheet ? "md:hidden" : "hidden"))}>{main}</div>
      {check && <div className={cx("min-w-0", !!aside && "lg:col-span-2")}>{writing ? writePanel : checkPanel}</div>}
      {lib && <div className="min-w-0 max-xl:contents">{libraryPanel}</div>}
      {aside && !check && <div className={cx("min-w-0 md:col-span-2 lg:col-span-1", lib && "xl:hidden")}>{aside}</div>}
    </div>
  );
}

/** 초안 검토처럼 칸이 이미 짜인 화면: 반 전체 검사 패널이 열리면 편집 칸 자리를 패널로 바꾼다 */
export function CheckSwap({ children, panel, className }: { children: ReactNode; panel: ReactNode; className?: string }) {
  const ws = useWorkspace();
  if (ws?.panel !== "check") return <>{children}</>;
  return <div className={cx("min-w-0", className)}>{panel}</div>;
}
