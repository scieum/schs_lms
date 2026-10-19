"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ChevronUp, Lock, RotateCw, Sparkles, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { barParts, CLASS_FIX_LIMIT, fixTargets, type ClassStatus, type ClassViewRow } from "@/lib/domain/class-check";
import { RESULT, ResultTag, useWorkspace, type FixItem } from "./workspace";
import { BeforeAfter, changeCount } from "./before-after";
import { measure as measureText } from "@/lib/domain/length";

// 반 전체 검사 (Figma N35 ① 432:2 · 433:42) + AI로 고치기 대기열 (434:57 · 434:467).
// 규칙만(AI 없음)으로 검사 → 요약 막대 · 거르기 칩(화면 상태, URL에 넣지 않음) · 학생별 가장 큰 문제 · 행 누르면 그 학생 ③ 검사로.
// 걸린 학생을 AI로 한꺼번에 고치되, 학생마다 선생님이 보고 "본문에 넣기"를 눌러야 바뀐다(자동 확정 없음 · "모두 넣기" 없음).

const unitMark = (u: ClassViewRow["unit"]) => (u === "bytes" ? "B" : "자");
type Filter = "all" | ClassStatus;

/** 목록 카드 머리 "✓ 반 전체 검사" (soft 꽉 찬 36). 모바일은 탭 아래 외곽선 44 (mobile) */
export function ClassCheckButton({ mobile = false, className }: { mobile?: boolean; className?: string }) {
  const ws = useWorkspace();
  if (!ws) return null;
  const on = ws.panel === "check";
  const click = () => {
    if (on) { ws.setPanel(null); return; }
    ws.setPanel("check");
    ws.runCheck();
  };
  return (
    <button type="button" onClick={click} aria-pressed={on}
      className={cx("inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[13px] font-bold",
        mobile ? cx("h-11 border", on ? "border-key bg-key-soft text-key-strong" : "border-hair bg-[#fff] text-ink") : "h-9 bg-key-soft text-key-strong hover:bg-[#e3e7ff]", className)}>
      <Check size={14} strokeWidth={2.5} /> 반 전체 검사
    </button>
  );
}

export function ClassCheckPanel() {
  const ws = useWorkspace();
  if (!ws) return null;
  return (
    <section className="@container surface flex flex-col gap-4 rounded-card p-5 md:p-6" aria-label={ws.queueOpen && ws.queue ? "AI로 고치기" : "반 전체 검사"}>
      {ws.queueOpen && ws.queue ? <FixQueue /> : <Result />}
    </section>
  );
}

function ago(at: string) {
  const s = (Date.now() - Date.parse(at)) / 1000;
  return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : `${Math.floor(s / 3600)}시간 전`;
}

function Result() {
  const ws = useWorkspace()!;
  const [filter, setFilter] = useState<Filter>("all");
  const [more, setMore] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30000); return () => window.clearInterval(t); }, []);
  const v = ws.view;
  const close = () => ws.setPanel(null);

  const head = (
    <div className="flex items-center gap-2">
      <h2 className="whitespace-nowrap text-[17px] font-bold">반 전체 검사</h2>
      {v?.ok && <span className="min-w-0 truncate text-[13px] text-mute">{v.rows.length}명 · <span className="@lg:hidden">{ago(v.at) === "방금" ? "방금" : ago(v.at)}</span><span className="hidden @lg:inline">{ago(v.at)} 검사</span></span>}
      <span className="flex-1" />
      <button type="button" onClick={ws.runCheck} disabled={ws.checking} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-sub disabled:opacity-40">
        <RotateCw size={13} className={ws.checking ? "animate-spin" : undefined} /> 다시 검사
      </button>
      <button type="button" onClick={close} aria-label="반 전체 검사 닫기" className="flex size-7 shrink-0 items-center justify-center text-mute"><X size={18} /></button>
    </div>
  );
  const desc = (
    <p className="break-keep text-[13px] leading-5 text-sub">
      지금 저장된 글을 규칙으로만 검사해요 (AI 없음)<span className="hidden @lg:inline"> · 금칙어 · 분량 · 학번·실명 · 어미 · 문체 · 비슷한 문장</span>
    </p>
  );

  if (!v || (ws.checking && !v.ok)) {
    return <>{head}{desc}<p className="py-8 text-center text-[13px] text-mute" role="status">검사하는 중이에요</p></>;
  }
  if (!v.ok) return <>{head}<p className="text-[13px] text-bad" role="alert">{v.error}</p></>;

  const t = v.totals;
  const chips: [Filter, string, number][] = [["all", "전체", v.rows.length], ["block", "확정 불가", t.block], ["warn", "확인", t.warn], ["pass", "통과", t.pass], ["empty", "빈 글", t.empty]];
  const shownAll = filter === "all" ? v.rows : v.rows.filter((r) => r.status === filter);
  const folded = filter === "all" && !more ? shownAll.filter((r) => r.status === "pass" || r.status === "empty") : [];
  const shown = folded.length ? shownAll.filter((r) => r.status === "block" || r.status === "warn") : shownAll;
  const targets = fixTargets(v.rows, Infinity);
  const n = Math.min(targets.length, CLASS_FIX_LIMIT);
  const queueN = ws.queue?.length ?? 0;

  return (
    <>
      {head}
      {desc}
      {/* 요약 막대: 숫자는 칩에 쓴다 */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" aria-hidden>
        {barParts(t).map((p) => <span key={p.key} className={RESULT[p.key].dot} style={{ width: `${p.pct}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="결과 거르기">
        {chips.map(([k, label, count]) => {
          const on = filter === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setFilter(k)}
              className={cx("inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[16px] border px-3 text-[13px] @lg:h-8",
                on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>
              {k !== "all" && <span className={cx("size-2 rounded-full", RESULT[k].dot)} />}{label} {count}
            </button>
          );
        })}
      </div>

      {/* 넓은 단: 표 */}
      <div className="hidden overflow-hidden rounded-inner border border-line @[640px]:block">
        <div className="flex h-9 items-center gap-3 bg-bg px-4 text-[12px] font-medium text-sub">
          <span className="w-14 shrink-0">학번</span><span className="w-16 shrink-0">이름</span><span className="w-[84px] shrink-0">결과</span>
          <span className="min-w-0 flex-1">가장 큰 문제</span><span className="w-[70px] shrink-0 text-right">분량</span><span className="w-10 shrink-0" />
        </div>
        {shown.map((r) => (
          <Link key={r.id} href={r.href} className="flex items-center gap-3 border-t border-soft px-4 py-3 hover:bg-bg">
            <span className="w-14 shrink-0 text-[13px] tabular-nums text-mute">{r.no}</span>
            <span className="flex w-16 shrink-0 items-center gap-1 truncate text-[14px] font-medium">{r.name}{r.locked && <Lock size={11} className="shrink-0 text-mute" aria-label="확정" />}</span>
            <span className="w-[84px] shrink-0"><ResultTag status={r.status} /></span>
            <Problem r={r} />
            <span className={cx("w-[70px] shrink-0 text-right text-[13px] font-medium tabular-nums", r.over ? "text-[#9A6400]" : "text-ink")}>{r.status === "empty" ? "—" : `${r.bytes.toLocaleString()}${unitMark(r.unit)}`}</span>
            <span className="inline-flex w-10 shrink-0 items-center justify-end whitespace-nowrap text-[13px] font-bold text-key-strong">열기<ChevronRight size={13} /></span>
          </Link>
        ))}
        {folded.length > 0 && <MoreRow pass={t.pass} empty={t.empty} onClick={() => setMore(true)} />}
        {shown.length === 0 && !folded.length && <p className="border-t border-soft py-6 text-center text-[13px] text-mute">해당하는 학생이 없어요</p>}
      </div>
      {/* 좁은 단: 카드 목록 */}
      <ul className="flex flex-col @[640px]:hidden">
        {shown.map((r) => (
          <li key={r.id} className="border-t border-soft">
            <Link href={r.href} className="flex items-center gap-2 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] tabular-nums text-mute">{r.no}</span>
                  <span className="truncate text-[15px] font-bold">{r.name}</span>
                  <ResultTag status={r.status} />
                  {r.locked && <Lock size={12} className="shrink-0 text-mute" aria-label="확정" />}
                  <span className={cx("ml-auto shrink-0 text-[12px] tabular-nums", r.over ? "text-[#9A6400]" : "text-mute")}>{r.status === "empty" ? "" : `${r.bytes.toLocaleString()}${unitMark(r.unit)}`}</span>
                </span>
                <span className="truncate text-[13px] text-sub">{r.top ? `${r.top.label}${r.top.more ? ` 외 ${r.top.more}곳` : ""}` : r.status === "empty" ? "아직 쓴 글이 없어요" : "걸린 곳 없음"}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-mute" />
            </Link>
          </li>
        ))}
        {folded.length > 0 && <li className="border-t border-soft"><MoreRow pass={t.pass} empty={t.empty} onClick={() => setMore(true)} bare /></li>}
      </ul>

      {(n > 0 || queueN > 0) && (
        <div className="flex flex-col gap-3 rounded-inner bg-bg px-4 py-3.5 @2xl:flex-row @2xl:items-center">
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[14px] font-bold">{queueN ? `AI로 고치는 중 ${queueN}명` : `걸린 곳이 있는 ${n}명을 AI로 한꺼번에 고칠까요?`}</p>
            <p className="break-keep text-[12px] text-mute">고친 글은 학생마다 선생님이 보고 넣어야 바뀌어요 · 확정은 하지 않아요</p>
          </div>
          {queueN ? (
            <Button type="button" kind="soft" size="sm" onClick={() => ws.setQueueOpen(true)} className="h-11 w-full font-bold @2xl:h-9 @2xl:w-auto"><Sparkles size={14} /> 이어서 보기</Button>
          ) : (
            <Button type="button" kind="soft" size="sm" onClick={() => ws.startFix(targets.slice(0, CLASS_FIX_LIMIT))} className="h-11 w-full font-bold @2xl:h-9 @2xl:w-auto">
              <Sparkles size={14} /> {targets.length > CLASS_FIX_LIMIT ? `앞 ${CLASS_FIX_LIMIT}명만 AI로 고치기` : "걸린 곳 모두 AI로 고치기"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Problem({ r }: { r: ClassViewRow }) {
  if (!r.top) return <span className="min-w-0 flex-1 truncate text-[14px] text-mute">{r.status === "empty" ? "아직 쓴 글이 없어요" : "걸린 곳 없음"}</span>;
  return (
    <span className="min-w-0 flex-1 truncate text-[14px]">
      {r.top.label}{r.top.more > 0 && <span className="ml-1.5 text-[13px] text-mute">외 {r.top.more}곳</span>}
    </span>
  );
}

function MoreRow({ pass, empty, onClick, bare }: { pass: number; empty: number; onClick: () => void; bare?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex w-full items-center justify-center gap-1 py-3 text-[13px] font-medium text-sub hover:bg-bg", !bare && "border-t border-soft")}>
      {[pass ? `통과 ${pass}명` : "", empty ? `빈 글 ${empty}명` : ""].filter(Boolean).join(" · ")} 더 보기 <ChevronDown size={13} />
    </button>
  );
}

// ---------- AI로 고치기 대기열 (434:57) ----------

function FixQueue() {
  const ws = useWorkspace()!;
  const q = ws.queue!;
  const rows = useMemo(() => new Map((ws.view?.ok ? ws.view.rows : []).map((r) => [r.id, r])), [ws.view]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ready = q.filter((x) => x.status !== "making").length;
  const making = q.filter((x) => x.status === "making").length;
  const put = q.filter((x) => x.status === "put").length;
  const kept = q.filter((x) => x.status === "kept").length;
  const left = q.length - put - kept;
  // 처음 준비된 학생을 펼친다
  const firstReady = q.find((x) => x.status === "ready")?.id ?? null;
  const cur = open && q.some((x) => x.id === open && x.status === "ready") ? open : open === "" ? null : firstReady;

  const doPut = async (id: string) => {
    setBusy(id);
    await ws.put(id);
    setBusy(null);
    // 넣으면 다음 준비된 행을 펼친다
    const next = q.find((x) => x.id !== id && x.status === "ready");
    setOpen(next?.id ?? "");
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="whitespace-nowrap text-[17px] font-bold">AI로 고치기</h2>
        <span className="text-[13px] text-mute">{q.length}명</span>
        <span className="flex-1" />
        <button type="button" onClick={() => ws.setQueueOpen(false)} className="shrink-0 whitespace-nowrap text-[13px] font-medium text-sub">닫기</button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="shrink-0 text-new" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-sub">
            <span className="hidden @lg:inline">고친 글 </span>{ready}명 준비{making ? ` · ${making}명 만드는 중` : ""}
          </span>
          <span className="shrink-0 text-[13px] font-bold tabular-nums">{ready} / {q.length}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden><div className="h-full rounded-full bg-key transition-[width]" style={{ width: `${(ready / Math.max(1, q.length)) * 100}%` }} /></div>
      </div>
      <p className="flex gap-2 rounded-control bg-key-soft px-3.5 py-2.5 text-[13px] font-medium leading-5 text-key-strong">
        <Check size={14} className="mt-0.5 shrink-0" /> <span className="break-keep">학생마다 고친 글을 보고 넣어 주세요. 넣어도 확정되지 않아요 — 확정은 학생 화면에서 선생님이 해요.</span>
      </p>
      <ul className="flex flex-col">
        {q.map((x) => {
          const r = rows.get(x.id);
          if (!r) return null;
          return <QueueRow key={x.id} item={x} row={r} open={cur === x.id} busy={busy === x.id}
            onToggle={() => setOpen(cur === x.id ? "" : x.id)} onPut={() => doPut(x.id)}
            onKeep={() => { ws.keep(x.id); setOpen(""); }} onUndo={async () => { setBusy(x.id); await ws.undo(x.id); setBusy(null); }}
            onReopen={() => { ws.reopen(x.id); setOpen(x.id); }} />;
        })}
      </ul>
      <p className="border-t border-line pt-3 text-[12px] text-mute">
        <span className="@lg:hidden">넣음 {put} · 그대로 {kept} · 남음 {left}</span>
        <span className="hidden @lg:inline">넣은 {put}명 · 그대로 둔 {kept}명 · 남은 {left}명</span>
      </p>
    </>
  );
}

function QueueRow({ item, row, open, busy, onToggle, onPut, onKeep, onUndo, onReopen }: {
  item: FixItem; row: ClassViewRow; open: boolean; busy: boolean;
  onToggle: () => void; onPut: () => void; onKeep: () => void; onUndo: () => void; onReopen: () => void;
}) {
  const kept = item.status === "kept";
  const tag = item.status === "ready"
    ? <span className="whitespace-nowrap rounded-chip bg-key-soft px-1.5 py-0.5 text-[12px] font-bold text-key-strong">준비됨</span>
    : item.status === "put"
      ? <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-chip bg-ok-soft px-1.5 py-0.5 text-[12px] font-bold text-ok"><Check size={11} strokeWidth={3} />넣었어요</span>
      : kept ? <span className="whitespace-nowrap rounded-chip bg-soft px-1.5 py-0.5 text-[12px] font-bold text-sub">그대로 둠</span>
        : item.status === "making" ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-new"><Sparkles size={13} />만드는 중…</span>
          : <span className="whitespace-nowrap rounded-chip bg-bad-soft px-1.5 py-0.5 text-[12px] font-bold text-bad">못 고침</span>;
  const right = item.status === "ready"
    ? open
      ? <button type="button" onClick={onToggle} aria-expanded className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-ink"><span className="hidden text-[12px] text-mute @lg:inline">걸린 {row.issues}곳</span>접기<ChevronUp size={13} /></button>
      : <button type="button" onClick={onToggle} aria-expanded={false} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] font-bold text-key-strong">보기<ChevronDown size={13} /></button>
    : item.status === "put" ? <button type="button" onClick={onUndo} disabled={busy} className="whitespace-nowrap text-[13px] font-medium text-sub disabled:opacity-40">되돌리기</button>
      : kept ? <button type="button" onClick={onReopen} className="whitespace-nowrap text-[13px] font-medium text-ink">다시 보기</button>
        : null;
  const after = item.after ?? "";
  return (
    <li className="flex flex-col gap-3 border-t border-soft py-3">
      <div className="flex min-h-[26px] items-center gap-2">
        <span className="text-[13px] tabular-nums text-mute">{row.no}</span>
        <span className={cx("truncate text-[15px] font-bold @lg:text-[14px]", kept && "font-medium text-mute")}>{row.name}</span>
        {tag}
        {item.status === "ready" && (item.left ?? 0) > 0 && <span className="hidden whitespace-nowrap rounded-chip bg-wait-soft px-1.5 py-0.5 text-[12px] font-bold text-[#9A6400] @sm:inline">고친 뒤에도 확인 {item.left}</span>}
        <span className="flex-1" />
        {right}
      </div>
      {item.error && <p className="text-[12px] text-bad" role="alert">{item.error}</p>}
      {open && item.status === "ready" && (
        <div className="flex flex-col gap-3">
          <BeforeAfter before={item.before} after={after} block="bg-bg"
            afterTag={(item.left ?? 0) === 0
              ? <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-chip bg-ok-soft px-1.5 py-px text-[11px] font-bold text-ok"><Check size={11} strokeWidth={3} />검사 통과</span>
              : <span className="whitespace-nowrap rounded-chip bg-wait-soft px-1.5 py-px text-[11px] font-bold text-[#9A6400]">확인 {item.left}</span>} />
          <div className="flex flex-col gap-2.5 @lg:flex-row @lg:items-center">
            <span className="min-w-0 flex-1 text-[12px] text-mute">바뀐 곳 {changeCount(item.before, after)} · {measureText(after, row.unit).toLocaleString()} / {row.max.toLocaleString()}{unitMark(row.unit)}</span>
            <div className="flex gap-2 [&>*]:h-11 [&>*]:flex-1 @lg:[&>*]:h-9 @lg:[&>*]:flex-none">
              <Button type="button" kind="outline" size="sm" onClick={onKeep}>그대로 두기</Button>
              <Button type="button" size="sm" onClick={onPut} disabled={busy}>{busy ? "넣는 중…" : "본문에 넣기"}</Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

