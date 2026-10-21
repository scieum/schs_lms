"use client";
import { createContext, useActionState, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Lock, Sparkles, Users } from "lucide-react";
import { cx } from "@/components/ui";
import { checkLength, measure, UNIT_LABEL, type LengthRange, type LengthUnit } from "@/lib/domain/length";
import { appendBand, gateBand, type GateResult } from "@/lib/domain/length-gate";
import { bandText, parseTol, tolKey, traceLine, type ReviseKind } from "@/lib/domain/memo-gate";
import type { Importance, MergePiece } from "@/lib/domain/merge";
import type { AiDraftResult } from "@/lib/domain/writing";
import type { AiFixResult, VariantMode, VariantsActionResult } from "@/lib/domain/variants";
import type { GuideArea } from "@/lib/domain/guide-bank";
import type { LibraryArea } from "@/lib/domain/library";
import {
  applyOrder, decodePick, encodePick, filterPieces, mainLabel, moveId, pickedVisible, pickKey, sourceChips, STATUS_CHIP, studentPos, studentStep,
  type ComposeGroup, type ComposeStatus, type Period, type SourceFilter,
} from "@/lib/domain/compose";
import { ComposePieces, type ComposePiece } from "./compose-pieces";
import { TargetPicker, TolPicker } from "./gate-pickers";
import { GateProgress } from "./gate-progress";
import { useAiGate, type MergeOpts } from "./use-ai-gate";
import { ReviseBox } from "./revise-box";
import { RecordChecks, useBodyChecks, type Who } from "./record-checks";
import { HighlightTextarea, type Mark } from "./highlight-textarea";
import { VariantsPanel, VariantsToggle } from "./variants-panel";
import { BodyCard, CompetencyCheck, type TagResult } from "./competency-view";
import { paragraphCount, splitParagraphs } from "@/lib/domain/paragraphs";
import { BodyViewSwitch, useProvenance, type ProvInit } from "./provenance";
import { useGuideMarks, useGuideTarget } from "./guide-store";
import { GuideBookButton } from "./guide-panel";
import { LibraryToggle, useBodyLibrary } from "./library-save";
import { OverApproval } from "./over-approval";
import { SimilarNotice, SimilarSheet, useSimilar, type SimilarPeer, type SimilarSelf } from "./similar-sheet";
import { LevelPicker, useLevels } from "./level-picker";
import { ClassActionsBar } from "./class-actions-bar";
import { useWorkspace } from "./workspace";

// 글 짓기 (Figma N52 (b)(c)(d)(e)(g1)): 한 학생씩 — 머리 "글 짓기" ↔ [반 전체] [조각 모으기] · (담임) 탭 · 학생 넘기기 ·
// 왼쪽 380 조각 칸 | 오른쪽 글 칸(새로 쓰기 | 지금 글에 더하기 · 목표 · 오차 · 주 버튼 · 게이트 · 글 · 수정 요청 · 자동 검사 · 더보기) · 아래 줄.
// 세특 · 동아리 · 담임(행발 · 자율·자치 · 진로)이 같은 틀을 쓰고, 영역마다 다른 것은 ComposeAdapter 하나로 받는다.
// 동작은 옛 편집기(N40 ~ N49b) 그대로: 저장 · 확정(새 버전 · 적게 고친 확인 · 한도 초과 확인) · 모아 쓰기 + 게이트 · 더하기(append) · 맞추기 · 수정 요청 · 근거 · AI 원안.
// N48 단계 표시는 쓰지 않는다(고르기와 글이 나란히). 고른 조각 · 순서는 이 탭 sessionStorage, 꼭(중요도)은 이 기기 localStorage(N20 그대로).

export type SaveState = { error?: string; saved?: "draft" | "confirmed"; at?: string; needReason?: { ratio: number; nosource: number; n: number } };
type Praise = { level: string | null; evidence: string };

/** 영역마다 다른 것 (세특 · 기록) — 함수는 그 학생에 묶여 있다 */
export type ComposeAdapter = {
  group: ComposeGroup;
  /** sessionStorage `schs.compose.<scope>.<학생 id>` */
  pickScope: string;
  /** 오차 기억 이름 (N49) */
  gateScope: string;
  guideArea: GuideArea;
  reviseKind: Extract<ReviseKind, "record" | "behavior">;
  spellKind: "setuk" | "record";
  libraryArea: LibraryArea;
  subject?: string;
  /** 폼 숨은 칸 (courseId · studentId / area · studentId · clubId) */
  hidden: Record<string, string>;
  save: (state: SaveState, form: FormData) => Promise<SaveState>;
  /** 분량 설정 → 검사 범위 (세특 공통과목은 남은 만큼) */
  range: (len: { unit: LengthUnit; max: number }) => LengthRange;
  /** 나이스 한도 (게이트 · 목표 위쪽) */
  limit: (unit: LengthUnit) => number;
  /** 분량 줄 "NEIS 한도" 되돌리기 값 */
  neisLimit: (unit: LengthUnit) => number;
  load: () => Promise<MergePiece[]>;
  merge: (pieces: MergePiece[], unit: LengthUnit, max: number, tol: number, level: string | null, opts?: MergeOpts) => Promise<AiDraftResult>;
  fit: (text: string, unit: LengthUnit, max: number, tol?: number) => Promise<AiDraftResult>;
  revise: (text: string, request: string, unit: LengthUnit, max: number, tol: number) => Promise<AiDraftResult>;
  aiFix: (text: string, unit: LengthUnit, max: number, praise: Praise) => Promise<AiFixResult>;
  variants: (text: string, mode: VariantMode, unit: LengthUnit, max: number) => Promise<VariantsActionResult>;
  tag: (text: string) => Promise<TagResult>;
  addLibraryPiece?: (entryId: string) => Promise<{ error?: string }>;
};

export type ComposeStudent = { id: string; no: string; name: string; status: ComposeStatus };
export type ComposeLink = { label: string; href: string; on: boolean };

const noSub = () => () => {};
const NO_PEERS: SimilarPeer[] = [];
const NO_TEXT: string[] = [];
const weightKey = (id: string) => `schs.piece-weight.${id}`;

const PARAS_KEY = "schs-compose-paras";
/** 문단 보기에서 고친 글 → 한 문단 (끝 띄어쓰기는 그대로 — 치는 중 공백이 사라지지 않게) */
const joinLight = (v: string) => v.replace(/[ \t]*\n+[ \t]*/g, " ");

export function ComposeWorkspace({
  adapter, word, students, current, hrefBase, classes, classLabel, tabs, collectHref, collectLabel = "조각 모으기",
  initial, unit: initialUnit, max: initialMax, confirmed, who, prov, aiOn, openCheck = false, startMode = "new", today,
  similar, shared, keywordBoard, after,
}: {
  adapter: ComposeAdapter;
  /** 글 칸 머리 "세특 글" */
  word: string;
  students: ComposeStudent[];
  current: string;
  /** 학생 주소 앞부분 (?course=…&section=… 까지) */
  hrefBase: string;
  /** [반 ▾] 목록 (세특 분반 · 동아리 · 담임 반) */
  classes: ComposeLink[];
  classLabel: string;
  /** 담임 탭 행발 | 자율·자치 | 진로 */
  tabs?: ComposeLink[];
  collectHref: string;
  /** 머리 오른쪽 버튼 글 (담임은 "누가기록") */
  collectLabel?: string;
  initial: string;
  unit: LengthUnit;
  max: number;
  confirmed: boolean;
  who: Who;
  prov?: ProvInit;
  aiOn: boolean;
  openCheck?: boolean;
  startMode?: "new" | "append";
  /** 오늘 (YYYY-MM-DD, 서버 기준 서울) */
  today: string;
  /** 세특 비슷한 문장 (N34 ④) */
  similar?: { self: SimilarSelf; peers: SimilarPeer[]; ignore: string[] };
  /** 공통과목 1·2 합산 */
  shared?: { other: 1 | 2; bytes: number; capMax: number };
  /** 행발 키워드 메뉴판 (N35 ④) — 더보기 안 접힌 칸 */
  keywordBoard?: (ctx: { onApply: (t: string, r?: AiDraftResult) => void; bodyEmpty: boolean }) => ReactNode;
  /** 맨 아래 (차시별 활동 · 공통 활동 접힌 머리) */
  after?: ReactNode;
}) {
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<SaveState, FormData>(adapter.save, {});
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const body = useRef<HTMLTextAreaElement>(null);
  const [len, setLen] = useState({ unit: initialUnit, max: initialMax });
  const range = adapter.range(len);
  const unit = range.unit;
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  const length = checkLength(text, range);
  const over = length.reason === "too_long";
  const [allowOver, setAllowOver] = useState(false);
  const hasBody = !!text.trim();
  const limit = adapter.limit(unit);

  // ---------- 조각 (왼쪽) ----------
  const [loaded, setLoaded] = useState<MergePiece[] | null>(null);
  const [stored, setStored] = useState<{ excluded: string[]; order: string[] }>({ excluded: [], order: [] });
  const key = pickKey(adapter.pickScope, current);
  useEffect(() => {
    let alive = true;
    adapter.load().then((ps) => {
      if (!alive) return;
      let raw: string | null = null;
      try { raw = sessionStorage.getItem(key); } catch { /* 기억 못 하면 전부 고름 */ }
      setStored(decodePick(raw, ps.map((p) => p.id)));
      setLoaded(ps);
    }).catch(() => alive && setLoaded([]));
    return () => { alive = false; };
    // 학생이 바뀌면 부모가 key 로 새로 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remember = (next: { excluded: string[]; order: string[] }) => {
    setStored(next);
    try { sessionStorage.setItem(key, encodePick(next)); } catch { /* 이번에만 쓴다 */ }
  };
  // 꼭 넣기 (N20 중요도 3): 이 기기에 기억
  const [weights, setWeights] = useState<Record<string, Importance>>({});
  const weightOf = (id: string): Importance => {
    if (weights[id]) return weights[id];
    try { const v = Number(localStorage.getItem(weightKey(id))); if (v === 1 || v === 3) return v; } catch { /* 보통 */ }
    return 2;
  };
  const setWeight = (id: string, w: Importance) => {
    setWeights((cur) => ({ ...cur, [id]: w }));
    try { localStorage.setItem(weightKey(id), String(w)); } catch { /* 이번에만 */ }
  };
  // 처음은 새 것부터 (시안 10.14 → 09.03, 날짜 없는 것 = 지금) — 교사가 위/아래로 바꾼 순서가 있으면 그대로
  const base = useMemo(() => [...(loaded ?? [])].sort((a, b) => (a.date ?? "9999") < (b.date ?? "9999") ? 1 : (a.date ?? "9999") > (b.date ?? "9999") ? -1 : 0), [loaded]);
  const all: ComposePiece[] = applyOrder(base, stored.order).map((p) => ({ ...p, weight: weightOf(p.id) }));
  const selected = new Set(all.map((p) => p.id).filter((id) => !stored.excluded.includes(id)));
  const setSelected = (s: Set<string>) => remember({ ...stored, excluded: all.filter((p) => !s.has(p.id)).map((p) => p.id) });
  const move = (id: string, dir: -1 | 1) => remember({ ...stored, order: moveId(all.map((p) => p.id), id, dir) });
  const [source, setSource] = useState<SourceFilter>("전체");
  const [period, setPeriod] = useState<Period>("전체");
  const chips = sourceChips(all, adapter.group);
  const src = chips.some((c) => c.key === source) ? source : "전체";
  const visible = filterPieces(all, { source: src, period, today });
  const picked = pickedVisible(visible, selected);

  // ---------- 검사 · 근거 (옛 ③ 그대로) ----------
  const sim = useSimilar(current, text, similar?.peers ?? NO_PEERS, similar?.ignore ?? NO_TEXT);
  const simMarks = useMemo<Mark[]>(() => sim.flatMap((s) => s.mine.map((g) => ({ ...g, tone: "similar" as const }))), [sim]);
  const replaceRef = useRef<(next: string, msg: string) => void>(() => {});
  const pv = useProvenance({ init: prov, text, replace: (n, m) => replaceRef.current(n, m), spell: { kind: adapter.spellKind, studentId: current }, focusBody: () => body.current?.focus() });
  const lv = useLevels();
  const level = adapter.group === "setuk" ? lv?.levels[current] ?? null : null;
  const evidence = useMemo(() => (loaded ?? []).map((p) => p.text).join(" / "), [loaded]);
  const praise = useMemo(() => ({ level, evidence }), [level, evidence]);
  const more = useMemo(() => ({ ...pv.more, praise }), [pv.more, praise]);
  const bc = useBodyChecks({ text, setText, range, who, context: adapter.subject, extraMarks: simMarks, openFirst: openCheck, more });
  useEffect(() => { replaceRef.current = bc.replace; });
  const toBody = () => setTimeout(() => body.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 40);
  useGuideTarget(text, adapter.guideArea, toBody);
  const gm = useGuideMarks(text);
  const marks = useMemo(() => (gm.marks.length ? [...bc.marks, ...gm.marks] : bc.marks), [bc.marks, gm.marks]);
  const { needFromServer } = pv;
  useEffect(() => { needFromServer(state.needReason); }, [state.needReason, needFromServer]);
  const lib = useBodyLibrary({ text, body, area: adapter.libraryArea, subject: adapter.subject, onInsert: (next) => bc.replace(next, "넣었어요"), addPiece: adapter.addLibraryPiece });

  // ---------- 문단 나누기 (N56): 보기만 나눈다. 저장 · 바이트 · 나이스는 늘 한 문단(text) ----------
  const storedParas = useSyncExternalStore(noSub, () => { try { return localStorage.getItem(PARAS_KEY); } catch { return null; } }, () => null);
  const [ownParas, setOwnParas] = useState<boolean | null>(null);
  const paras = ownParas ?? storedParas === "on";
  const pickParas = (on: boolean) => { setOwnParas(on); try { localStorage.setItem(PARAS_KEY, on ? "on" : "off"); } catch { /* 이번에만 */ } };
  // 문단 보기에서 고친 글(줄바꿈 그대로) — 한 문단으로 붙인 것이 text 와 같을 때만 쓴다 (AI가 바꾼 글이면 새로 나눈다)
  const [view, setView] = useState<string | null>(null);
  const shown = paras ? (view !== null && joinLight(view) === text ? view : splitParagraphs(text)) : text;
  const onBody = (v: string) => { if (paras) { setView(v); setText(joinLight(v)); } else setText(v); };

  // ---------- 목표 · 오차 (N49) ----------
  const [target, setTarget] = useState(limit);
  const max = Math.min(limit, Math.max(1, target || limit));
  const tk = tolKey(adapter.gateScope, unit);
  const storedTol = useSyncExternalStore(noSub, () => { try { return localStorage.getItem(tk); } catch { return null; } }, () => null);
  const [ownTol, setOwnTol] = useState<number | null>(null);
  const tol = ownTol ?? parseTol(storedTol, unit);
  const pickTol = (t: number) => { setOwnTol(t); try { localStorage.setItem(tk, String(t)); } catch { /* 이번에만 */ } };
  const band = gateBand({ unit, target: max, tol, limit });
  const bandLabel = bandText(band, unit);

  const gate = useAiGate({
    text, unit, limit, target: max, scope: adapter.gateScope,
    fit: (t, m, tl) => adapter.fit(t, unit, m, tl),
    merge: (ps, m, tl) => adapter.merge(ps, unit, m, tl, level),
    apply: (t, r) => { bc.replace(t, "다시 맞췄어요"); pv.adopt(r); },
    onMoreMemos: () => router.push(collectHref),
  });

  // ---------- 새로 쓰기 | 지금 글에 더하기 (N49b) ----------
  const [modePick, setMode] = useState<"new" | "append">(startMode);
  const mode = modePick === "append" && hasBody ? "append" : "new";
  const kept = hasBody ? measure(text.trim(), unit) : 0;
  const room = mode === "append" ? appendBand(band, kept) : null;
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(0);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState("");
  const req = useRef(0);
  const [, start] = useTransition();
  const canRun = picked.length > 0 && !busy && (mode === "new" || !!room);
  const run = () => {
    if (!canRun) return;
    const id = ++req.current;
    const ps: MergePiece[] = picked.map((p) => ({ id: p.id, source: p.source, date: p.date, text: p.text, weight: p.weight }));
    const appending = mode === "append";
    const chosen = appending ? [{ id: "body", source: "본문" as const, date: null, text: text.trim(), weight: 3 as const }, ...ps] : ps;
    setError("");
    setTrace("");
    setBusy(true);
    setRunning(ps.length);
    start(async () => {
      let r: AiDraftResult;
      try {
        r = await gate.track((x, m, tl, o) => adapter.merge(x, unit, m, tl, level, o))(chosen, max, tol, appending ? { append: true } : undefined);
      } catch {
        r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 직접 써 주세요" };
      }
      if (id !== req.current) return; // 그만 쓰기
      setBusy(false);
      if (!r.ok) { setError(r.error); return; }
      if (hasBody) bc.replace(r.text, appending ? "이어 썼어요" : "새로 썼어요");
      else setText(r.text);
      pv.adopt(r);
      gate.remember(r.text, r.gate);
      setTrace([traceLine(r.gate, unit), r.notice?.replace(/메모/g, "조각")].filter(Boolean).join(" · "));
      // 더한 뒤에는 글 전체 · 게이트를 보여 준다
      if (appending) setMode("new");
    });
  };
  const stop = () => { req.current++; setBusy(false); };

  // ---------- 더보기 (근거 · 다른 버전 · 역량 보기 · 기재요령 · 보관함 · 성취수준 · 키워드 메뉴판) ----------
  const [moreOpen, setMoreOpen] = useState(false);
  const [competency, setCompetency] = useState(false);
  const [variants, setVariants] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [keywords, setKeywords] = useState(false);
  const [compare, setCompare] = useState(false);
  const applyDraft = (t: string, r?: AiDraftResult) => {
    if (hasBody) bc.replace(t, "넣었어요"); else setText(t);
    pv.adopt(r);
    gate.remember(t, r?.ok ? r.gate : undefined);
  };

  // ---------- 학생 넘기기 · 저장 안 한 글 (N33 확인 시트) ----------
  const ids = students.map((s) => s.id);
  const pos = studentPos(ids, current);
  const me = students.find((s) => s.id === current);
  const hrefOf = (id: string) => `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}student=${id}`;
  const prevId = studentStep(ids, current, -1);
  const nextId = studentStep(ids, current, 1);
  const baseline = state.saved ? submitted : initial;
  const dirty = text.trim() !== baseline.trim() && text.trim() !== initial.trim();
  const [leave, setLeave] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveErr, setLeaveErr] = useState("");
  const go = (href: string) => { if (dirty) { setLeaveErr(""); setLeave(href); } else router.push(href); };
  const saveAndGo = async () => {
    const form = formRef.current;
    if (!form || !leave) return;
    const fd = new FormData(form);
    fd.set("intent", "draft");
    setLeaving(true);
    let r: SaveState;
    try { r = await adapter.save({}, fd); } catch { r = { error: "저장하지 못했어요. 다시 눌러 주세요" }; }
    setLeaving(false);
    if (r.error) { setLeaveErr(r.error); return; }
    const to = leave;
    setLeave(null);
    router.push(to);
  };

  const ws = useWorkspace();
  const [classBar, setClassBar] = useState(false);
  const showBar = classBar || ws?.panel === "write" || ws?.panel === "check";
  const confirmPrimary = mode !== "append";
  const confirmOff = pending || (over && !allowOver) || !hasBody || bc.check.status === "block";

  const status = me?.status ?? "미작성";
  const header = (
    <header className="flex items-end gap-2 px-4 pb-2 pt-5 md:px-10 md:pt-8">
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold md:text-[28px]">글 짓기</h1>
      {ws?.write && (
        <button type="button" onClick={() => setClassBar(!classBar)} aria-expanded={showBar}
          className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-2.5 text-[13px] font-medium md:h-9 md:px-3.5 md:text-[14px]",
            showBar ? "border-key bg-key-soft text-key-strong" : "border-line bg-[#fff] text-ink hover:bg-soft")}>
          <Users size={15} aria-hidden /> 반 전체 <ChevronDown size={14} className={cx(showBar && "rotate-180")} aria-hidden />
        </button>
      )}
      <button type="button" onClick={() => go(collectHref)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-[#fff] px-2.5 text-[13px] font-medium text-ink hover:bg-soft md:h-9 md:px-3.5 md:text-[14px]">
        <Layers size={15} aria-hidden /> {collectLabel}
      </button>
    </header>
  );

  const switcher = (
    <StudentSwitcher classes={classes} classLabel={classLabel} students={students} current={current} pos={pos} status={status}
      onGo={go} hrefOf={hrefOf} prevHref={prevId ? hrefOf(prevId) : null} nextHref={nextId ? hrefOf(nextId) : null} />
  );

  const modeToggle = (
    <div role="radiogroup" aria-label="쓰는 방법" className="grid w-full grid-cols-2 rounded-control border border-line bg-[#fff] p-[3px] md:w-[308px]">
      {(["new", "append"] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={m === "append" && !hasBody} onClick={() => setMode(m)}
          className={cx("h-8 whitespace-nowrap rounded-[6px] text-[13px] disabled:opacity-40", mode === m ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>
          {m === "new" ? "새로 쓰기" : "지금 글에 더하기"}
        </button>
      ))}
    </div>
  );

  const mainBtn = busy ? (
    <GateProgress title="AI가 쓰는 중" onStop={stop} line={`고른 조각 ${running}개 · ${bandLabel} 안에 맞춰요`}
      steps={[
        { name: mode === "append" ? "① 조각으로 이어 쓰기" : "① 조각 모아 쓰기", value: "쓰는 중", state: "current" },
        { name: "② 빠진 조각 넣기", value: `조각 ${running}개`, state: "todo" },
        { name: "③ 분량 맞추기", value: bandLabel, state: "todo" },
      ]} />
  ) : (
    <button type="button" onClick={run} disabled={!canRun}
      className={cx("inline-flex h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-4 text-[15px] font-bold md:h-10 md:w-auto md:self-start md:text-[14px]",
        !canRun ? "bg-line text-mute" : mode === "new" && hasBody ? "bg-key-soft text-key-strong hover:bg-[#e3e7ff]" : "bg-key text-white hover:bg-key-strong")}>
      <Sparkles size={15} aria-hidden /> {mainLabel(picked.length, mode, hasBody)}
    </button>
  );

  const recordPane = (
    <section aria-label={word} className="surface flex min-w-0 flex-col gap-3.5 rounded-card px-4 py-4 md:gap-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{word}</h2>
        {modeToggle}
      </div>
      {mode === "append" && (
        <div className="flex flex-col gap-1 rounded-inner border border-line bg-soft px-3.5 py-3">
          <span className="flex items-center gap-1.5">
            <Lock size={14} className="shrink-0 text-sub" aria-hidden />
            <span className="min-w-0 flex-1 text-[13px] font-bold">지금 글 · 그대로 둬요</span>
            <span className="shrink-0 text-[12px] tabular-nums text-mute">{kept.toLocaleString()}{u}</span>
          </span>
          <span className="line-clamp-2 text-[13px] text-sub break-keep">{text.trim()}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="grid grid-cols-2 gap-2 md:flex [&>div>button]:w-full [&>div>button]:justify-between max-md:[&>div>button]:h-10">
          <TargetPicker unit={unit} target={max} limit={limit} onChange={setTarget} />
          <TolPicker unit={unit} target={max} tol={tol} limit={limit} onChange={pickTol} />
        </div>
        {mode === "new" && <span className="inline-flex h-6 items-center self-start whitespace-nowrap rounded-chip bg-key-soft px-2 text-[12px] font-bold tabular-nums text-key-strong md:self-auto">{bandLabel} 안에 맞춰요</span>}
      </div>
      {mode === "append" && (room ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-sub break-keep">
          <span>지금 글 <b className="tabular-nums text-ink">{kept.toLocaleString()}{u}</b> 그대로 + 고른 조각으로 약 <b className="tabular-nums text-ink">{room.target.toLocaleString()}{u}</b> 더 써요</span>
          <span className="inline-flex h-6 items-center whitespace-nowrap rounded-chip bg-key-soft px-2 font-bold tabular-nums text-key-strong">→ {bandLabel}</span>
        </p>
      ) : (
        <p className="rounded-control bg-[#FFF1EA] px-3 py-2 text-[12px] font-bold text-[#E8622C] break-keep" role="status">
          지금 글이 이미 {kept.toLocaleString()}{u}예요 · 더할 자리가 없어요
        </p>
      ))}
      {mainBtn}
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      {trace && !busy && <p className="text-[12px] font-medium tabular-nums text-sub break-keep">{trace}</p>}

      <form id={formId} ref={formRef} action={action} onSubmit={() => setSubmitted(text)} className={cx("flex flex-col gap-3.5 md:gap-4", mode === "append" && "hidden")}>
        {Object.entries(adapter.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {pv.inputs()}
        {hasBody && <div aria-hidden className="h-px bg-line" />}
        <div>
          {hasBody && gate.chips}
          {gm.line}
          {hasBody && (
            <div className="flex items-center gap-2 pb-2 pt-1">
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] font-medium text-sub">
                문단 나누기
                <input type="checkbox" role="switch" className="peer sr-only" checked={paras} onChange={(e) => pickParas(e.target.checked)} />
                <span aria-hidden className={cx("relative h-5 w-9 rounded-full transition-colors", paras ? "bg-key" : "bg-faint")}>
                  <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", paras ? "left-[18px]" : "left-0.5")} />
                </span>
              </label>
              {paras && <span className="text-[12px] font-bold text-key-strong">{paragraphCount(shown)}문단</span>}
              <span className="flex-1" />
              <span className="truncate text-[12px] text-mute">{paras ? <><span className="md:hidden">나이스엔 한 문단</span><span className="hidden md:inline">보기 편하게만 · 나이스에는 한 문단으로 들어가요</span></> : "한 문단"}</span>
            </div>
          )}
          <BodyCard bare head={false} toggle={hasBody} view={{ on: competency, set: setCompetency }} text={text} tag={adapter.tag}>
            {/* 문단 보기일 때 보내는 글은 한 문단 (hidden content) */}
            {paras && <input type="hidden" name="content" value={text} />}
            {pv.body(<HighlightTextarea
              ref={body}
              name={paras ? undefined : "content"}
              value={shown}
              onChange={onBody}
              marks={paras ? [] : marks}
              onPickMark={bc.setOpen}
              focusKey={gm.focusKey ?? bc.open}
              maxLength={5000}
              placeholder="아직 쓴 글이 없어요"
              boxClassName="rounded-inner bg-bg focus-within:ring-2 focus-within:ring-key"
              textClassName={cx("px-4 py-3.5 text-[15px] leading-[26px]", hasBody ? "min-h-[120px]" : "min-h-[160px]")}
              aria-label={word}
              selectionTool={lib.selectionTool}
              onSelectionChange={lib.onSelectionChange}
            />)}
            {lib.mobileSave && <div className="mt-2">{lib.mobileSave}</div>}
          </BodyCard>
        </div>
        {hasBody && !competency && <CompetencyCheck text={text} onOpen={() => setCompetency(true)} />}
        {hasBody && (
          <ReviseBox kind={adapter.reviseKind} text={text} unit={unit} limit={limit} band={gate.bandLabel}
            disabled={aiOn ? undefined : "AI가 꺼져 있어 수정 요청을 보낼 수 없어요. 직접 고쳐 주세요"}
            run={(request) => adapter.revise(text, request, unit, gate.band.target, gate.band.tol)}
            onApply={(t, g?: GateResult) => { bc.replace(t, "고친 글로 바꿨어요"); gate.remember(t, g, null); }} />
        )}
        <SimilarNotice state={sim} onOpen={() => setCompare(true)} />
        {shared && (
          <p className="rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] text-key-strong">
            공통과목은 1·2학기 합산 500자 · {shared.other}학기 {shared.bytes.toLocaleString()}바이트 → 이 학기 최대 {shared.capMax.toLocaleString()}{UNIT_LABEL[unit]}
          </p>
        )}
        <div className={cx(!hasBody && "hidden")}>
          <RecordChecks text={text} range={range} check={bc.check} recheck={bc.recheck} open={bc.open} onOpen={bc.setOpen} onReplace={bc.onReplace}
            onReplaceAll={bc.onReplaceAll} spellAi={pv.spellLine} renderOpen={pv.renderOpen}
            aiFix={{ run: (t) => adapter.aiFix(t, unit, range.max, praise), onApply: (t) => bc.replace(t, "고친 글을 넣었어요") }}
            length={{ unit: len.unit, max: len.max, limit: adapter.neisLimit(len.unit), onChange: setLen }}
            fit={{ run: () => adapter.fit(text, unit, range.max), onApply: (t) => { setText(t); gate.remember(t); } }} />
        </div>

        {/* 더보기: 옛 편집기 기능 그대로 (근거 N38 · 다른 버전 N34 · 기재요령 N43 — 역량은 N56 역량 확인 칸으로 나옴 · 보관함 · 성취수준 N35 · 행발 키워드 메뉴판 N35) */}
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}
            className="flex h-8 items-center gap-1 self-start whitespace-nowrap text-[13px] font-medium text-sub hover:text-ink">
            더보기 <ChevronDown size={14} className={cx(moreOpen && "rotate-180")} aria-hidden />
          </button>
          {moreOpen && (
            <div className="flex flex-col gap-3">
              <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0">
                <div className="flex w-max items-center gap-1.5 md:w-auto md:flex-wrap">
                  <BodyViewSwitch {...pv.switchProps} />
                  {hasBody && <VariantsToggle on={variants} onClick={() => setVariants(!variants)} />}
                  <LibraryToggle />
                  {lv && adapter.group === "setuk" && (
                    <button type="button" onClick={() => setLevelOpen(!levelOpen)} aria-expanded={levelOpen}
                      className={cx("inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[13px] font-medium", levelOpen ? "bg-key-soft text-key-strong" : "text-sub hover:bg-soft")}>
                      성취수준 <b className="font-bold">{level ?? "안 고름"}</b>
                    </button>
                  )}
                  {keywordBoard && (
                    <button type="button" onClick={() => setKeywords(!keywords)} aria-expanded={keywords}
                      className={cx("inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[13px] font-medium", keywords ? "bg-key-soft text-key-strong" : "text-sub hover:bg-soft")}>
                      키워드 메뉴판
                    </button>
                  )}
                  <GuideBookButton area={adapter.guideArea} />
                </div>
              </div>
              {levelOpen && lv && <LevelPicker scale={lv.scale} value={level} onChange={(l) => { void lv.set([{ studentId: current, level: l }]); }} />}
              {variants && hasBody && (
                <VariantsPanel unit={unit} max={range.max} onClose={() => setVariants(false)}
                  run={(m) => adapter.variants(text, m, unit, range.max)}
                  onPick={(t) => { setVariants(false); bc.replace(t, "본문을 바꿨어요"); }} />
              )}
              {keywords && keywordBoard?.({ onApply: applyDraft, bodyEmpty: !hasBody })}
            </div>
          )}
        </div>

        {over && <OverApproval value={length.value} max={range.max} unit={UNIT_LABEL[unit]} checked={allowOver} onChange={setAllowOver} />}
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && (
          <p className="text-sm text-ok" role="status">{state.saved === "confirmed" ? "확정했어요" : "임시 저장했어요"} · 새 버전으로 남았어요</p>
        )}
        {pv.ratioLine && <div className="@container">{pv.ratioLine}</div>}
      </form>
    </section>
  );

  // 아래 줄 (N52 597:1201): PC [‹ 이전 학생] … [임시 저장] [✓ 확정] … [다음 학생 ›] · 모바일은 탭 막대 위에 붙음
  const bottom = (
    <div data-sticky-cta className="z-20 flex items-center gap-2 bg-[#fff] max-md:sticky max-md:bottom-[calc(env(safe-area-inset-bottom)+66px)] max-md:-mx-4 max-md:border-t max-md:border-line max-md:px-4 max-md:py-3 md:surface md:rounded-card md:p-3">
      <button type="button" onClick={() => prevId && go(hrefOf(prevId))} disabled={!prevId} aria-label="이전 학생"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control border border-hair bg-[#fff] text-[14px] font-medium text-ink hover:bg-soft disabled:opacity-40 md:h-10 md:w-auto md:px-3.5">
        <ChevronLeft size={16} aria-hidden /><span className="max-md:hidden">이전 학생</span>
      </button>
      <span className="flex-1 max-md:hidden" />
      <button type="submit" form={formId} name="intent" value="draft" disabled={pending}
        className="inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3 text-[15px] font-medium text-ink hover:bg-soft disabled:opacity-50 md:h-10 md:w-[120px] md:flex-none md:text-[14px]">
        임시 저장
      </button>
      <button type="submit" form={formId} name="intent" value="confirmed" onClick={pv.guardConfirm} disabled={confirmOff}
        className={cx("inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3 text-[15px] font-bold md:h-10 md:w-[160px] md:flex-none md:text-[14px]",
          confirmOff ? "bg-line text-mute" : confirmPrimary ? "bg-key text-white hover:bg-key-strong" : "border border-hair bg-[#fff] font-medium text-ink hover:bg-soft")}>
        <Check size={16} strokeWidth={2.5} aria-hidden /> {confirmed ? "다시 확정" : "확정"}
      </button>
      <span className="flex-1 max-md:hidden" />
      <button type="button" onClick={() => nextId && go(hrefOf(nextId))} disabled={!nextId} aria-label="다음 학생"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control border border-hair bg-[#fff] text-[14px] font-medium text-ink hover:bg-soft disabled:opacity-40 md:h-10 md:w-auto md:px-3.5">
        <span className="max-md:hidden">다음 학생</span><ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );

  return (
    <>
      {header}
      <div className="flex flex-col gap-3.5 px-4 pb-10 pt-4 md:gap-5 md:px-10 md:pb-16 md:pt-6">
        {showBar && <ClassActionsBar title={classLabel} total={students.length} counts={{
          confirmed: students.filter((s) => s.status === "확정").length, draft: students.filter((s) => s.status === "작성 중").length, empty: students.filter((s) => s.status === "미작성").length,
        }} />}
        {tabs && tabs.length > 1 && (
          <nav aria-label="글 고르기" className="flex gap-1 overflow-x-auto rounded-card border border-line bg-[#fff] p-1 [scrollbar-width:none]">
            {tabs.map((t) => (
              <button key={t.href} type="button" onClick={() => !t.on && go(t.href)} aria-current={t.on ? "page" : undefined}
                className={cx("h-9 flex-[1_0_auto] whitespace-nowrap rounded-control px-3 text-[14px] md:h-[37px]", t.on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        {switcher}
        <ComposeSwap>
          <div className="flex flex-col gap-3.5 md:gap-5">
            <div className="grid gap-3.5 md:gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
              <ComposePieces all={all} visible={visible} selected={selected} setSelected={setSelected} onWeight={setWeight} onMove={move}
                chips={chips} source={src} setSource={setSource} period={period} setPeriod={setPeriod} collectHref={collectHref} loading={loaded === null} />
              {recordPane}
            </div>
            {bottom}
          </div>
        </ComposeSwap>
        {after}
      </div>
      {bc.snack}
      {pv.dialog}
      {leave && <LeaveSheet busy={leaving} error={leaveErr} onSave={saveAndGo} onSkip={() => { const to = leave; setLeave(null); router.push(to); }} onClose={() => setLeave(null)} />}
      {compare && similar && sim.length > 0 && (
        <SimilarSheet self={similar.self} text={text} unit={unit} state={sim} onClose={() => setCompare(false)}
          onRewriteSelf={() => { setCompare(false); toBody(); setTimeout(() => body.current?.focus(), 60); }} />
      )}
    </>
  );
}

// ---------- 반 전체 패널 자리 바꾸기 (N35 · N42 그대로) ----------

const PanelsCtx = createContext<{ check: ReactNode; write: ReactNode; library: ReactNode } | null>(null);

/** 반 전체 검사 · 반 전체 글 쓰기 · 보관함 패널을 글 짓기 칸 자리에 (편집 칸은 숨기기만 — 쓰던 글이 남게) */
export function ComposePanels({ check, write, library, children }: { check: ReactNode; write: ReactNode; library: ReactNode; children: ReactNode }) {
  const v = useMemo(() => ({ check, write, library }), [check, write, library]);
  return <PanelsCtx.Provider value={v}>{children}</PanelsCtx.Provider>;
}

function ComposeSwap({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const p = useContext(PanelsCtx);
  const writing = ws?.panel === "write" && !!p?.write;
  const check = (ws?.panel === "check" && !!p?.check) || writing;
  // 모바일 반 전체 글 쓰기 시작은 바텀시트 — 뒤 글 짓기 칸을 그대로 둔다
  const sheet = writing && ws?.write?.phase === "idle";
  const lib = ws?.panel === "library" && !!p?.library;
  return (
    <div className={cx("grid gap-4 md:gap-5", lib && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
      <div className={cx("min-w-0", check && (sheet ? "md:hidden" : "hidden"))}>{children}</div>
      {check && <div className="min-w-0">{writing ? p!.write : p!.check}</div>}
      {lib && <div className="min-w-0 max-xl:contents">{p!.library}</div>}
    </div>
  );
}

// ---------- 학생 넘기기 (N52 596:1412) ----------

function useAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

function StudentSwitcher({ classes, classLabel, students, current, pos, status, onGo, hrefOf, prevHref, nextHref }: {
  classes: ComposeLink[]; classLabel: string; students: ComposeStudent[]; current: string; pos: { index: number; total: number }; status: ComposeStatus;
  onGo: (href: string) => void; hrefOf: (id: string) => string; prevHref: string | null; nextHref: string | null;
}) {
  const [cls, setCls] = useState(false);
  const [names, setNames] = useState(false);
  const closeCls = useMemo(() => () => setCls(false), []);
  const closeNames = useMemo(() => () => setNames(false), []);
  const clsRef = useAway(cls, closeCls);
  const nameRef = useAway(names, closeNames);
  const me = students.find((s) => s.id === current);
  const step = (href: string | null, label: string, icon: ReactNode) => (
    <button type="button" onClick={() => href && onGo(href)} disabled={!href} aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-control border border-hair bg-[#fff] text-ink hover:bg-soft disabled:opacity-40">{icon}</button>
  );
  const chip = <span className={cx("inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-2 text-[12px] font-bold", STATUS_CHIP[status])}>{status}</span>;
  return (
    <div className="surface flex flex-col gap-2 rounded-card p-2 md:flex-row md:items-center">
      <div ref={clsRef} className="relative md:shrink-0">
        <button type="button" onClick={() => classes.length > 1 && setCls(!cls)} aria-expanded={cls} aria-haspopup="listbox"
          className="flex h-10 w-full items-center gap-2 whitespace-nowrap rounded-control bg-soft px-3 text-[14px] font-bold md:w-auto">
          <span className="min-w-0 flex-1 truncate text-left">{classLabel}</span>
          {classes.length > 1 && <ChevronDown size={15} className={cx("shrink-0 text-sub", cls && "rotate-180")} aria-hidden />}
        </button>
        {cls && (
          <div role="listbox" aria-label="반 고르기" className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-[320px] w-full min-w-[220px] overflow-y-auto rounded-card border border-line bg-[#fff] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)] md:w-auto">
            {classes.map((c) => (
              <button key={c.href} type="button" role="option" aria-selected={c.on} onClick={() => { setCls(false); if (!c.on) onGo(c.href); }}
                className={cx("flex h-10 w-full items-center gap-2 whitespace-nowrap rounded-control px-2.5 text-left text-[14px]", c.on ? "bg-key-soft font-bold text-key-strong" : "font-medium hover:bg-soft")}>
                <span className="flex-1">{c.label}</span>{c.on && <Check size={15} strokeWidth={2.5} aria-hidden />}
              </button>
            ))}
          </div>
        )}
      </div>
      <span aria-hidden className="hidden h-6 w-px shrink-0 bg-line md:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {step(prevHref, "이전 학생", <ChevronLeft size={18} />)}
        <div ref={nameRef} className="relative min-w-0 md:flex-none max-md:flex-1">
          <button type="button" onClick={() => setNames(!names)} aria-expanded={names} aria-haspopup="listbox"
            className="flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-control px-2 text-[16px] font-bold hover:bg-soft">
            <span className="min-w-0 truncate tabular-nums">{me ? `${me.no} ${me.name}` : "학생"}</span>
            <ChevronDown size={16} className={cx("shrink-0 text-sub", names && "rotate-180")} aria-hidden />
          </button>
          {names && (
            <div role="listbox" aria-label="학생 고르기" className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-[360px] w-[280px] max-w-[calc(100vw-48px)] overflow-y-auto rounded-card border border-line bg-[#fff] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
              {students.map((s) => (
                <button key={s.id} type="button" role="option" aria-selected={s.id === current} onClick={() => { setNames(false); if (s.id !== current) onGo(hrefOf(s.id)); }}
                  className={cx("flex h-10 w-full items-center gap-2 rounded-control px-2.5 text-left", s.id === current ? "bg-key-soft text-key-strong" : "hover:bg-soft")}>
                  <span className="w-12 shrink-0 text-[12px] tabular-nums text-mute">{s.no}</span>
                  <span className={cx("min-w-0 flex-1 truncate text-[14px]", s.id === current ? "font-bold" : "font-medium")}>{s.name}</span>
                  <span className={cx("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-chip px-1.5 text-[11px] font-bold", STATUS_CHIP[s.status])}>{s.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-medium tabular-nums text-mute">{pos.index} / {pos.total}</span>
        <span className="max-md:hidden">{step(nextHref, "다음 학생", <ChevronRight size={18} />)}</span>
        <span className="flex-1 max-md:hidden" />
        <span className="md:pr-2">{chip}</span>
        <span className="md:hidden">{step(nextHref, "다음 학생", <ChevronRight size={18} />)}</span>
      </div>
    </div>
  );
}

// ---------- 저장 안 한 글 (N33 확인 시트) ----------

function LeaveSheet({ busy, error, onSave, onSkip, onClose }: { busy: boolean; error: string; onSave: () => void; onSkip: () => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-navy/50 md:items-center md:px-6" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="compose-leave-title" onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-4 rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:w-[420px] md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex flex-col gap-1.5">
          <h2 id="compose-leave-title" className="text-[17px] font-bold md:text-[18px]">임시 저장하고 넘어갈까요?</h2>
          <p className="text-[14px] text-sub break-keep">저장하지 않은 글이 있어요</p>
        </div>
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex flex-col gap-2 md:flex-row-reverse">
          <button ref={first} type="button" onClick={onSave} disabled={busy}
            className="h-12 w-full whitespace-nowrap rounded-control bg-key text-[15px] font-bold text-white hover:bg-key-strong disabled:opacity-50 md:h-10 md:flex-1 md:text-[14px]">
            {busy ? "저장하는 중…" : "저장하고 넘기기"}
          </button>
          <button type="button" onClick={onSkip} disabled={busy}
            className="h-12 w-full whitespace-nowrap rounded-control border border-hair bg-[#fff] text-[15px] font-medium text-ink hover:bg-soft md:h-10 md:flex-1 md:text-[14px]">
            그냥 넘기기
          </button>
        </div>
      </div>
    </div>
  );
}
