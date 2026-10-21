"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, Download } from "lucide-react";
import { cx } from "@/components/ui";
import { ExcelExport } from "@/components/writing/excel-export";
import { ImportButton } from "./import-dialog";
import { useToast } from "@/components/writing/toast";
import type { ScopeArg } from "@/app/(app)/teacher/class-actions";
import {
  bytesLabel, bytesTone, copyAllLogsTsv, copyAllTsv, logDate, logStats, logText, STATUS_LABEL,
  type LogRow, type TextRow, type TextsTab, type TextsWho,
} from "@/lib/domain/texts-view";
import { textsCopyLog } from "./actions";

// 글 모아 보기 (Figma N49 (d) PC 576:14499 · 모바일 577:9472): 머리 동작 · 범위 고르기 · 행(PC 글 전체 / 모바일 3줄 + 펼치기).

async function writeClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

type Excel = { kind: "modal"; scope: ScopeArg; who: TextsWho } | { kind: "link"; href: string } | null;

/** 머리 [⧉ 모두 복사] [↓ 엑셀로 받기] — PC 흰 1px 32 · 모바일 머리 아래 반반 44 */
export function TextsActions({ tab, rows, logs, excel, disabled, mobile }: {
  tab: TextsTab; rows?: TextRow[]; logs?: LogRow[]; excel: Excel; disabled: boolean; mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const n = logs ? logs.length : rows?.length ?? 0;
  const copyAll = async () => {
    if (disabled || !n) return;
    try {
      await writeClipboard(logs ? copyAllLogsTsv(logs) : copyAllTsv(rows ?? []));
      toast.show(`${n}명 복사했어요 · 시트 첫 칸에 붙여 넣으세요`);
      void textsCopyLog({ tab, n }).catch(() => undefined);
    } catch {
      toast.show("복사하지 못했어요 · 다시 눌러 주세요", true);
    }
  };
  const btn = cx("inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] font-medium",
    mobile ? "h-11 flex-1 text-[15px]" : "h-8 px-3 text-[13px]", disabled ? "pointer-events-none text-faint" : "text-ink hover:bg-soft");
  return (
    <div className={mobile ? "flex gap-2 md:hidden" : "hidden gap-2 md:flex"}>
      <button type="button" onClick={copyAll} disabled={disabled} aria-disabled={disabled} className={btn}><Copy size={mobile ? 16 : 14} /> 모두 복사</button>
      {excel?.kind === "link" ? (
        <a href={excel.href} download aria-disabled={disabled} className={btn}><Download size={mobile ? 16 : 14} /> 엑셀로 받기</a>
      ) : (
        <button type="button" onClick={() => setOpen(true)} disabled={disabled || !excel} className={btn}><Download size={mobile ? 16 : 14} /> 엑셀로 받기</button>
      )}
      {excel?.kind === "modal" && <ImportButton scope={excel.scope} mobile={mobile} className={cx("inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] font-medium text-ink hover:bg-soft", mobile ? "h-11 flex-1 text-[15px]" : "h-8 px-3 text-[13px]")} />}
      {excel?.kind === "modal" && <ExcelExport scope={excel.scope} open={open} onClose={() => setOpen(false)} defaultWho={excel.who} />}
      {toast.node}
    </div>
  );
}

/** 범위 고르기 [물리학 1분반 · 28명 ⌄] */
export function ScopeSelect({ options, value, label }: { options: { key: string; label: string; href: string }[]; value: string; label: string }) {
  const router = useRouter();
  return (
    <label className="relative flex h-11 w-full min-w-0 items-center rounded-control border border-hair bg-[#fff] md:h-10 md:w-auto">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => { const o = options.find((x) => x.key === e.target.value); if (o) router.push(o.href); }}
        className="h-full w-full min-w-0 appearance-none truncate bg-transparent pl-3.5 pr-9 text-[15px] font-bold outline-none md:w-auto md:text-[14px]">
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 text-sub" />
    </label>
  );
}

/** 행 복사 32(모바일 36) → "✓ 복사됨" 2.5초 (N47) */
function CopyOne({ text, disabled }: { text: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await writeClipboard(text);
      setState("done");
    } catch {
      setState("fail");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button type="button" onClick={copy} disabled={disabled} aria-label={state === "done" ? "복사됨" : "글 복사"} aria-live="polite"
      className={cx("inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-control border text-[12px] font-bold md:h-8 md:min-w-8",
        disabled ? "border-line bg-[#fff] text-faint" : state === "done" ? "border-key bg-key-soft px-2 text-key-strong" : state === "fail" ? "border-hair bg-[#fff] text-bad" : "border-hair bg-[#fff] text-ink hover:bg-soft")}>
      {state === "done" ? <><Check size={14} strokeWidth={3} /> 복사됨</> : <Copy size={15} />}
    </button>
  );
}

const CHIP: Record<TextRow["status"], string> = { confirmed: "bg-ok-soft text-ok", draft: "bg-wait-soft text-[#9A6400]", empty: "bg-soft text-mute" };
const TONE = { over: "text-bad", short: "text-due", ok: "text-ink", none: "text-faint" } as const;

function StatusChip({ s }: { s: TextRow["status"] }) {
  return <span className={cx("inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-chip px-2 text-[12px] font-bold", CHIP[s])}>{STATUS_LABEL[s]}</span>;
}

/** 세특 · 창체 · 행발 목록 (흰 r12 · 행 사이 1px) */
export function TextRows({ rows, max }: { rows: (TextRow & { href: string })[]; max: number }) {
  return (
    <ul className="surface overflow-hidden rounded-card">
      {rows.map((r) => <TextRowItem key={r.id} r={r} max={max} />)}
    </ul>
  );
}

function TextRowItem({ r, max }: { r: TextRow & { href: string }; max: number }) {
  const [open, setOpen] = useState(false);
  const empty = r.status === "empty" || !r.text;
  const tone = TONE[bytesTone(r.bytes, max)];
  const go = <Link href={r.href} className="inline-flex shrink-0 items-center whitespace-nowrap text-[13px] font-bold text-key-strong">쓰러 가기 <ChevronRight size={14} /></Link>;
  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0 md:px-5">
      {/* PC: 번호 32 | 이름 72 | 글 전체 | 오른쪽 140 */}
      <div className="hidden grid-cols-[32px_72px_minmax(0,1fr)_140px] gap-x-4 md:grid">
        <span className="pt-0.5 text-[13px] text-mute">{r.no}</span>
        <span className="truncate text-[15px] font-bold">{r.name}</span>
        <p className={cx("whitespace-pre-wrap break-words text-[14px] leading-6", empty ? "text-mute" : "text-ink")}>{empty ? "아직 쓴 글이 없어요" : r.text}</p>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className={cx("text-[14px] font-bold", tone)}>{bytesLabel(r.bytes)}</span>
            <CopyOne text={r.text} disabled={empty} />
          </div>
          <StatusChip s={r.status} />
          {empty && go}
        </div>
      </div>
      {/* 모바일: 번호 · 이름 · 칩 ↔ 바이트 · 복사 / 글 3줄 / 펼치기 */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[14px] text-mute">{r.no}</span>
          <span className="min-w-0 truncate text-[16px] font-bold">{r.name}</span>
          <StatusChip s={r.status} />
          <span className="flex-1" />
          <span className={cx("shrink-0 text-[14px] font-bold", tone)}>{bytesLabel(r.bytes)}</span>
          <CopyOne text={r.text} disabled={empty} />
        </div>
        {empty ? (
          <div className="flex items-center gap-2"><span className="flex-1 text-[14px] text-mute">아직 쓴 글이 없어요</span>{go}</div>
        ) : (
          <>
            <p className={cx("whitespace-pre-wrap break-words text-[15px] leading-6", !open && "line-clamp-3")}>{r.text}</p>
            {[...r.text].length > 60 && (
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex w-fit items-center gap-0.5 whitespace-nowrap text-[13px] font-bold text-key-strong">
                {open ? <>접기 <ChevronUp size={14} /></> : <>펼치기 <ChevronDown size={14} /></>}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** 누가기록 목록: 날짜 · 글 줄 (최신 위) · 오른쪽 "3건 · 342B" + 복사(모든 줄) */
export function LogRows({ rows }: { rows: LogRow[] }) {
  return (
    <ul className="surface overflow-hidden rounded-card">
      {rows.map((r) => <LogRowItem key={r.id} r={r} />)}
    </ul>
  );
}

function LogLines({ lines }: { lines: LogRow["lines"] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {lines.map((l, i) => (
        <li key={i} className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
          <span className="pt-px text-[13px] text-mute">{logDate(l.date)}</span>
          <span className="whitespace-pre-wrap break-words text-[14px] leading-6">{l.content}</span>
        </li>
      ))}
    </ul>
  );
}

function LogRowItem({ r }: { r: LogRow }) {
  const [open, setOpen] = useState(false);
  const more = r.lines.length - 2;
  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0 md:px-5">
      <div className="hidden grid-cols-[32px_72px_minmax(0,1fr)_140px] gap-x-4 md:grid">
        <span className="pt-0.5 text-[13px] text-mute">{r.no}</span>
        <span className="truncate text-[15px] font-bold">{r.name}</span>
        <LogLines lines={r.lines} />
        <div className="flex items-start justify-end gap-2">
          <span className="whitespace-nowrap pt-1 text-[14px] font-bold">{logStats(r.lines)}</span>
          <CopyOne text={logText(r.lines)} />
        </div>
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[14px] text-mute">{r.no}</span>
          <span className="min-w-0 truncate text-[16px] font-bold">{r.name}</span>
          <span className="flex-1" />
          <span className="shrink-0 whitespace-nowrap text-[14px] font-bold">{logStats(r.lines)}</span>
          <CopyOne text={logText(r.lines)} />
        </div>
        <LogLines lines={open ? r.lines : r.lines.slice(0, 2)} />
        {more > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex w-fit items-center gap-0.5 whitespace-nowrap text-[13px] font-bold text-key-strong">
            {open ? <>접기 <ChevronUp size={14} /></> : <>{more}건 더 보기 <ChevronDown size={14} /></>}
          </button>
        )}
      </div>
    </li>
  );
}
