"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Download, Lock, Sparkles, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import {
  capTargets, CLASS_WRITE_LIMIT, elapsedLabel, etaLabel, groupCounts, groupOf, pickDefault, prunePicked, reasonOf, selectable, sortRows, summarize, toggleGroup,
  type RowState, type WriteGroup,
} from "@/lib/domain/class-write";
import type { RosterStudent } from "@/app/(app)/teacher/class-actions";
import { LevelBadge } from "./level-picker";
import { PickBox } from "./pick-bar";
import { ClassWriteRow } from "./class-write-row";
import { useWorkspace } from "./workspace";

// 반 전체 글 쓰기 패널 (Figma N42 ① (a) 492:27751 · (b) 492:28111 · (c) 492:28422 / 모바일 494:28736 · 494:28926 · 494:29051).
// PC 는 편집 카드 자리 · 모바일 시작은 바텀시트, 쓰는 중 · 끝은 카드. 자동 확정 없음 — 쓴 글은 학생마다 임시 저장.

/** 끝 화면 "엑셀로 받기" → 동작 줄의 엑셀 모달을 연다 */
export const OPEN_EXCEL_EVENT = "n42:open-excel";

const studentHref = (base: string, id: string) => `${base}${base.includes("?") ? (base.endsWith("?") || base.endsWith("&") ? "" : "&") : "?"}student=${id}`;

export function ClassWritePanel({ hrefBase, word }: { hrefBase: string; word: string }) {
  const ws = useWorkspace();
  const w = ws?.write;
  useEffect(() => { void w?.loadRoster(); }, [w]);
  if (!ws || !w) return null;
  return (
    <section className={cx("@container surface flex flex-col gap-4 rounded-card p-5 md:p-6", w.phase === "idle" && "max-md:contents")} aria-label="반 전체 글 쓰기">
      {w.phase === "idle" ? <Start hrefBase={hrefBase} word={word} /> : <Progress hrefBase={hrefBase} />}
    </section>
  );
}

function Head({ tag, right, sub }: { tag?: ReactNode; right: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Sparkles size={18} className="shrink-0 text-new" />
      <h2 className="whitespace-nowrap text-[17px] font-bold">반 전체 글 쓰기</h2>
      {tag}
      {sub && <span className="min-w-0 truncate text-[13px] text-mute">{sub}</span>}
      <span className="flex-1" />
      {right}
    </div>
  );
}

const CloseX = ({ onClick, label = "반 전체 글 쓰기 닫기" }: { onClick: () => void; label?: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className="flex size-7 shrink-0 items-center justify-center text-mute"><X size={18} /></button>
);

// ---------- (a) 시작 ----------

const GROUPS: { g: WriteGroup; label: (n: number) => string; dot: string }[] = [
  { g: "ready", label: (n) => `메모 있고 글 없음 ${n}`, dot: "bg-key" },
  { g: "has_text", label: (n) => `글 있음 ${n}`, dot: "bg-wait" },
  { g: "no_memo", label: (n) => `메모 없음 ${n}`, dot: "bg-hair" },
  { g: "locked", label: (n) => `확정 ${n} · 빼요`, dot: "bg-ok" },
];

function TextTag({ s }: { s: RosterStudent }) {
  if (s.status === "confirmed") return <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-chip bg-ok-soft px-1.5 py-0.5 text-[12px] font-bold text-[#00A05D]"><Lock size={10} />확정</span>;
  if (s.status === "draft") return <span className="shrink-0 whitespace-nowrap rounded-chip bg-wait-soft px-1.5 py-0.5 text-[12px] font-bold text-[#9A6400]">임시<span className="hidden @lg:inline"> {s.bytes.toLocaleString()}B</span></span>;
  return <span className="shrink-0 whitespace-nowrap rounded-chip bg-soft px-1.5 py-0.5 text-[12px] font-medium text-mute">빈 글</span>;
}

function Start({ hrefBase, word }: { hrefBase: string; word: string }) {
  void hrefBase;
  const ws = useWorkspace()!;
  const w = ws.write!;
  const roster = w.roster;
  const list = useMemo(() => (roster?.ok ? roster.students : []), [roster]);
  const [rewrite, setRewrite] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [more, setMore] = useState(false);
  const max = roster?.ok ? roster.maxBytes : 1500;
  const [target, setTarget] = useState<number | null>(null);
  const tgt = target ?? max;
  const ids = picked ?? pickDefault(list);
  const set = new Set(ids);
  const counts = groupCounts(list);
  const cap = capTargets(ids);
  const close = () => ws.setPanel(null);
  const toggle = (id: string) => setPicked(set.has(id) ? ids.filter((x) => x !== id) : list.map((s) => s.id).filter((x) => set.has(x) || x === id));
  const setRw = (on: boolean) => { setRewrite(on); setPicked(prunePicked(list, ids, on)); };
  const go = () => w.start(cap.ids, { target: tgt, rewrite });
  const targets = [...new Set([max, 1200, 1000, 800].filter((x) => x <= max))];
  const levels = list.filter((s) => set.has(s.id)).map((s) => s.level);
  const shown = more ? list : list.slice(0, 7);

  const body = !roster ? (
    <p className="py-8 text-center text-[13px] text-mute" role="status">학생을 불러오는 중이에요</p>
  ) : !roster.ok ? (
    <p className="text-[13px] text-bad" role="alert">{roster.error}</p>
  ) : (
    <>
      <p className="break-keep text-[13px] leading-5 text-sub">활동 메모가 있는 학생의 {word}을 AI가 한 명씩 써요. 쓴 글은 임시 저장만 하고, 확정은 학생마다 선생님이 해요.</p>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold">쓸 학생</span>
        <span className="text-[13px] font-bold text-key-strong"><span className="@lg:hidden">{ids.length}명</span><span className="hidden @lg:inline">{ids.length}명 골랐어요</span></span>
        <span className="flex-1" />
        <button type="button" onClick={() => setPicked([])} className="whitespace-nowrap text-[13px] font-medium text-sub">모두 해제</button>
      </div>
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0" aria-label="묶음">
        {GROUPS.map(({ g, label, dot }) => {
          const n = counts[g];
          const inGroup = list.filter((s) => groupOf(s) === g);
          const on = g !== "locked" && inGroup.length > 0 && inGroup.every((s) => set.has(s.id));
          return (
            <button key={g} type="button" disabled={g === "locked" || !n} aria-pressed={on} onClick={() => setPicked(toggleGroup(list, ids, g, rewrite))}
              className={cx("inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[16px] border px-3 text-[13px] @lg:h-8",
                on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink", g === "locked" && "cursor-default")}>
              <span className={cx("size-2 rounded-full", dot)} />{label(n)}
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-inner border border-line">
        <div className="hidden h-9 items-center gap-3 bg-bg px-4 text-[12px] font-medium text-sub @[640px]:flex">
          <PickBox on={list.some((s) => selectable(s, rewrite)) && list.filter((s) => selectable(s, rewrite)).every((s) => set.has(s.id))}
            onClick={() => { const all = list.filter((s) => selectable(s, rewrite)).map((s) => s.id); setPicked(all.every((x) => set.has(x)) ? [] : all); }} label="모두 고르기" />
          <span className="w-14 shrink-0">학번</span><span className="w-16 shrink-0">이름</span><span className="w-20 shrink-0">활동 메모</span>
          {roster.levels && <span className="w-16 shrink-0">성취수준</span>}<span className="min-w-0 flex-1">지금 글</span>
        </div>
        {shown.map((s) => {
          const can = selectable(s, rewrite);
          const on = set.has(s.id);
          const why = reasonOf(s, rewrite);
          return (
            <div key={s.id} className="flex min-h-12 items-center gap-3 border-t border-soft px-4 py-2 first:border-t-0 @[640px]:min-h-11 @[640px]:first:border-t">
              {can ? <PickBox on={on} onClick={() => toggle(s.id)} label={`${s.name} 고르기`} />
                : <span aria-label="고를 수 없음" className="size-[18px] shrink-0 rounded-[4px] border-[1.5px] border-line bg-soft" />}
              <span className="w-12 shrink-0 text-[13px] tabular-nums text-mute @[640px]:w-14">{s.no}</span>
              <span className={cx("min-w-0 truncate text-[15px] font-bold @[640px]:w-16 @[640px]:shrink-0 @[640px]:text-[14px] @[640px]:font-medium", !on && "text-mute")}>{s.name}</span>
              <span className={cx("shrink-0 whitespace-nowrap text-[13px] @[640px]:w-20", s.memos ? "text-sub @[640px]:text-ink" : "text-faint")}>
                <span className="@[640px]:hidden">메모 {s.memos || "—"}</span><span className="hidden @[640px]:inline">{s.memos ? `${s.memos}개` : "없음"}</span>
              </span>
              {roster.levels && <span className="shrink-0 @[640px]:w-16"><LevelBadge level={s.level} /></span>}
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2 @[640px]:justify-start">
                <TextTag s={s} />
                {why && <span className="hidden truncate text-[12px] text-mute @[640px]:inline">{why}</span>}
              </span>
            </div>
          );
        })}
        {list.length > 7 && !more && (
          <button type="button" onClick={() => setMore(true)} className="flex w-full items-center gap-1 border-t border-soft px-4 py-3 text-[13px] font-medium text-sub hover:bg-bg">
            {list.length - 7}명 더 보기 <ChevronDown size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0 rounded-inner bg-bg px-4">
        <Line label="목표 분량">
          <select value={tgt} onChange={(e) => setTarget(Number(e.target.value))} aria-label="목표 분량"
            className="h-8 rounded-control border border-line bg-[#fff] px-2.5 text-[13px] font-bold">
            {targets.map((t) => <option key={t} value={t}>{`목표 ${t.toLocaleString()}B`}</option>)}
          </select>
          <span className="text-[12px] text-mute">최대 {max.toLocaleString()}B<span className="hidden @lg:inline"> · 나이스 한도</span></span>
        </Line>
        {roster.levels && (
          <Line label="성취수준">
            <span className="text-[13px] font-medium">학생마다 정한 <span className="hidden @lg:inline">수준의 </span>말투<span className="hidden @lg:inline">로 써요</span></span>
            <span className="hidden items-center gap-1 @lg:flex">{levels.slice(0, 5).map((l, i) => <LevelBadge key={i} level={l} />)}</span>
            <span className="flex-1" />
            <button type="button" onClick={() => ws.setPanel(null)} className="whitespace-nowrap text-[12px] font-bold text-key-strong">
              <span className="hidden @lg:inline">분반 목록에서 정하기 ›</span><span className="@lg:hidden">{levels.filter(Boolean).length}/{levels.length}명</span>
            </button>
          </Line>
        )}
        <Line label={<><span className="hidden @lg:inline">글 있는 학생</span><span className="@lg:hidden">글 있는 {counts.has_text}명</span></>}>
          <span className="text-[13px] font-medium">다시 쓰기</span>
          <span className="hidden min-w-0 flex-1 text-[12px] text-mute @lg:inline">{rewrite ? "켜면 지금 글은 지난 버전으로 남아요" : `꺼 두면 글이 있는 ${counts.has_text}명은 건너뛰어요 · 켜면 지금 글은 지난 버전으로 남아요`}</span>
          <span className="flex-1 @lg:hidden" />
          <button type="button" role="switch" aria-checked={rewrite} aria-label="글 있는 학생 다시 쓰기" onClick={() => setRw(!rewrite)}
            className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors", rewrite ? "bg-key" : "bg-hair")}>
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-[#fff] shadow transition-[left]", rewrite ? "left-[18px]" : "left-0.5")} />
          </button>
        </Line>
      </div>
      {cap.cut > 0 && <p className="text-[12px] font-medium text-[#9A6400]">한 번에 {CLASS_WRITE_LIMIT}명까지 — 앞 {CLASS_WRITE_LIMIT}명만 써요</p>}
    </>
  );

  const foot = roster?.ok ? (
    <div className="flex flex-col gap-3 border-t border-line pt-4 @lg:flex-row @lg:items-center">
      <div className="order-2 min-w-0 flex-1 @lg:order-1">
        <p className="text-[12px] font-medium text-sub">🔒 이름·학번은 지우고 가명으로 보내요<span className="@lg:hidden"> · 이 화면을 열어 둔 동안 3명씩 써요</span></p>
        <p className="hidden text-[12px] text-mute @lg:block">이 화면을 열어 둔 동안 3명씩 써요 · 약 1~2분</p>
        {!ids.length && <p className="text-[12px] font-medium text-bad">쓸 학생을 골라 주세요</p>}
      </div>
      <div className="order-1 flex gap-2 @lg:order-2">
        <Button type="button" kind="outline" size="sm" onClick={close} className="hidden h-10 @lg:inline-flex">취소</Button>
        <Button type="button" onClick={go} disabled={!ids.length} className="h-12 flex-1 text-[15px] font-bold @lg:h-10 @lg:flex-none @lg:px-5 @lg:text-[14px]">
          <Sparkles size={15} /> {cap.ids.length}명 글 쓰기 시작
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* PC: 편집 카드 자리 */}
      <div className="hidden flex-col gap-4 md:flex">
        <Head sub={roster?.ok ? `${roster.title} · ${list.length}명` : undefined} right={<CloseX onClick={close} />} />
        {body}
        {foot}
      </div>
      {/* 모바일: 바텀시트 */}
      <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:hidden" onClick={close}>
        <div role="dialog" aria-modal="true" aria-label="반 전체 글 쓰기" onClick={(e) => e.stopPropagation()}
          className="@container flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2.5">
          <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
          <Head right={<CloseX onClick={close} />} />
          {body}
          {foot}
        </div>
      </div>
    </>
  );
}

function Line({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-t border-line py-2 first:border-t-0">
      <span className="w-[72px] shrink-0 whitespace-nowrap text-[13px] font-bold @lg:w-24">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
    </div>
  );
}

// ---------- (b) 쓰는 중 · (c) 끝 ----------

type Filter = "all" | RowState;
const CHIPS: { k: Filter; label: string; dot?: string }[] = [
  { k: "all", label: "전체" }, { k: "done", label: "완료", dot: "bg-ok" }, { k: "running", label: "쓰는 중", dot: "bg-new" },
  { k: "waiting", label: "대기", dot: "bg-hair" }, { k: "failed", label: "실패", dot: "bg-bad" }, { k: "skipped", label: "건너뜀", dot: "bg-faint" },
];

function Progress({ hrefBase }: { hrefBase: string }) {
  const ws = useWorkspace()!;
  const w = ws.write!;
  const [filter, setFilter] = useState<Filter>("all");
  const [more, setMore] = useState(false);
  const meta = useMemo(() => new Map((w.roster?.ok ? w.roster.students : []).map((s) => [s.id, s])), [w.roster]);
  const s = summarize(w.rows);
  const ended = w.phase === "done";
  const sorted = sortRows(w.rows, ended).filter((r) => filter === "all" || r.state === filter);
  const limit = ended ? sorted.filter((r) => r.state !== "done").length + 2 : 9;
  const shown = more ? sorted : sorted.slice(0, Math.max(limit, 4));
  const hidden = sorted.slice(shown.length);
  const progressN = s.done + s.failed + s.skipped;
  const elapsed = w.startedAt && w.finishedAt ? w.finishedAt - w.startedAt : 0;
  const roster = w.roster?.ok ? w.roster : null;
  const all = roster ? roster.students : [];
  const classDraft = all.filter((x) => x.status === "draft").length;
  const classConfirmed = all.filter((x) => x.status === "confirmed").length;
  const close = () => { if (w.phase === "running") return; w.reset(); ws.setPanel(null); };
  const toCheck = () => { w.reset(); ws.setPanel("check"); ws.runCheck(); };

  const row = (r: (typeof w.rows)[number]) => {
    const m = meta.get(r.id);
    return <ClassWriteRow key={r.id} row={r} no={m?.no ?? ""} name={m?.name ?? "학생"} memos={m?.memos ?? 0} href={studentHref(hrefBase, r.id)} memoHref={studentHref(hrefBase, r.id)}
      ended={ended} busy={w.phase === "running"} onRetry={() => w.retry([r.id])} />;
  };

  const tag = ended
    ? <span className="whitespace-nowrap rounded-chip bg-ok-soft px-1.5 py-0.5 text-[12px] font-bold text-[#00A05D]">끝</span>
    : w.phase === "paused"
      ? <span className="whitespace-nowrap rounded-chip bg-soft px-1.5 py-0.5 text-[12px] font-bold text-sub">멈춤</span>
      : <span className="whitespace-nowrap rounded-chip bg-new-soft px-1.5 py-0.5 text-[12px] font-bold text-[#0B8FB0]">쓰는 중</span>;

  return (
    <>
      <Head tag={tag} right={ended ? <CloseX onClick={close} /> : (
        <span className="flex items-center gap-1">
          {w.phase === "running"
            ? <button type="button" onClick={w.pause} className="whitespace-nowrap text-[13px] font-medium text-sub">멈추기</button>
            : <CloseX onClick={close} />}
        </span>
      )} />

      {ended ? (
        <>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[#00A05D]"><Check size={20} strokeWidth={3} /></span>
            <div className="min-w-0">
              <p className="break-keep text-[18px] font-bold">{s.total}명 중 {s.done}명 글을 썼어요</p>
              <p className="break-keep text-[13px] text-sub">모두 임시 저장했어요 · 아직 확정하지 않았어요<span className="hidden @lg:inline"> · 걸린 시간 {elapsedLabel(elapsed)}</span></p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 @2xl:grid-cols-4">
            <Tile label="임시 저장" value={`${s.done}명`} tone="text-[#00A05D]" />
            <Tile label="실패" value={`${s.failed}명`} tone={s.failed ? "text-bad" : "text-ink"} />
            <Tile label={<><span className="@lg:hidden">건너뜀</span><span className="hidden @lg:inline">건너뜀 · 메모 없음</span></>} value={`${s.skipped}명`} tone="text-ink" />
            <Tile label="반 전체" value={`임시 ${classDraft} · 확정 ${classConfirmed}`} tone="text-ink" className="hidden @2xl:flex" />
          </div>
          <p className="break-keep rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] font-medium leading-5 text-key-strong">AI 글은 초안이에요. 학생마다 읽고 관찰한 내용으로 고친 뒤 확정해 주세요. AI 원안은 따로 남아 ‘수정 %’가 보여요.</p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[16px] font-bold"><Sparkles size={14} className="mr-1 inline text-ink" />{progressN} / {s.total}명 썼어요</span>
              <span className="hidden min-w-0 truncate text-[13px] text-mute @lg:inline">{s.running ? `${s.running}명 쓰는 중` : w.phase === "paused" ? "멈췄어요" : ""}{s.waiting ? ` · 남은 시간 ${etaLabel(s.waiting + s.running)}` : ""}</span>
              <span className="flex-1" />
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-key-strong"><span className="hidden @lg:inline">{progressN} / {s.total}</span><span className="@lg:hidden">{s.running ? `${s.running}명 쓰는 중` : `${progressN} / ${s.total}`}</span></span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden><div className="h-full rounded-full bg-key transition-[width]" style={{ width: `${(progressN / Math.max(1, s.total)) * 100}%` }} /></div>
          </div>
          <p className="break-keep rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] font-medium leading-5 text-key-strong">이 화면을 열어 두세요. 다른 화면으로 가면 멈추고, 돌아오면 남은 학생부터 이어 써요.<span className="hidden @lg:inline"> 다 쓴 글은 이미 임시 저장됐어요.</span></p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="radiogroup" aria-label="상태 거르기">
            {CHIPS.filter((c) => c.k === "all" || c.k !== "skipped" || s.skipped > 0).map((c) => {
              const n = c.k === "all" ? s.total : s[c.k === "done" ? "done" : c.k === "running" ? "running" : c.k === "waiting" ? "waiting" : c.k === "failed" ? "failed" : "skipped"];
              const on = filter === c.k;
              return (
                <button key={c.k} type="button" role="radio" aria-checked={on} onClick={() => setFilter(c.k)}
                  className={cx("inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[16px] border px-3 text-[13px] @lg:h-8",
                    on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>
                  {c.dot && <span className={cx("size-2 rounded-full", c.dot)} />}{c.label} {n}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="overflow-hidden rounded-inner border border-line">
        {shown.map(row)}
        {shown.length === 0 && <p className="py-6 text-center text-[13px] text-mute">해당하는 학생이 없어요</p>}
        {hidden.length > 0 && (
          <button type="button" onClick={() => setMore(true)} className="flex w-full items-center gap-1 border-t border-soft px-4 py-3 text-[13px] font-medium text-sub hover:bg-bg">
            {moreLabel(hidden.map((r) => r.state), ended)} 더 보기 <ChevronDown size={13} />
          </button>
        )}
      </div>

      {ended ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4 @lg:flex-row @lg:items-center">
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EXCEL_EVENT))} className="order-3 inline-flex h-11 items-center justify-center gap-1 whitespace-nowrap text-[13px] font-bold text-ink @lg:order-1 @lg:h-auto @lg:justify-start">
            <Download size={14} /> 엑셀로 받기
          </button>
          <span className="order-2 hidden flex-1 @lg:block" />
          <div className="order-2 flex gap-2 @lg:order-3">
            {s.failed > 0 && (
              <Button type="button" kind="soft" onClick={() => w.retry()} className="h-11 flex-1 px-3 text-[14px] font-bold @lg:h-10 @lg:flex-none">
                <Sparkles size={14} /> 실패 {s.failed}명 다시 쓰기
              </Button>
            )}
            <Button type="button" onClick={toCheck} className="hidden h-10 px-4 text-[14px] font-bold @lg:inline-flex"><Check size={15} /> 반 전체 검사로 보기</Button>
          </div>
          <Button type="button" onClick={toCheck} className="order-1 h-12 w-full text-[15px] font-bold @lg:hidden"><Check size={15} /> 반 전체 검사로 보기</Button>
        </div>
      ) : (
        <>
          <p className="break-keep text-[12px] text-mute">실패한 학생은 끝난 뒤 한꺼번에 다시 쓸 수 있어요<span className="hidden @lg:inline"> · 한 명씩 ‘다시 쓰기’를 눌러도 돼요</span></p>
          <div className="flex flex-col gap-3 border-t border-line pt-4 @lg:flex-row @lg:items-center">
            <span className="hidden flex-1 text-[13px] text-sub @lg:inline">완료 {s.done} · 쓰는 중 {s.running} · 대기 {s.waiting} · 실패 {s.failed}{s.skipped ? ` · 건너뜀 ${s.skipped}` : ""}</span>
            {w.phase === "running" ? (
              <Button type="button" kind="outline" onClick={w.pause} className="h-11 w-full text-[14px] font-bold @lg:h-10 @lg:w-auto">잠깐 멈추기</Button>
            ) : (
              <Button type="button" onClick={w.resume} className="h-11 w-full text-[14px] font-bold @lg:h-10 @lg:w-auto"><Sparkles size={14} /> 이어 쓰기</Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function moreLabel(states: RowState[], ended: boolean): string {
  const n = (k: RowState) => states.filter((x) => x === k).length;
  if (ended) return [n("done") ? `임시 저장 ${n("done")}명` : "", n("waiting") ? `대기 ${n("waiting")}명` : ""].filter(Boolean).join(" · ") || `${states.length}명`;
  return [n("done") ? `완료 ${n("done")}명` : "", n("waiting") ? `대기 ${n("waiting")}명` : "", n("skipped") ? `건너뜀 ${n("skipped")}명` : ""].filter(Boolean).join(" · ") || `${states.length}명`;
}

function Tile({ label, value, tone, className }: { label: ReactNode; value: string; tone: string; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 rounded-inner bg-bg px-3.5 py-3", className)}>
      <span className="truncate text-[12px] text-mute">{label}</span>
      <span className={cx("truncate text-[18px] font-bold @lg:text-[20px]", tone)}>{value}</span>
    </div>
  );
}
