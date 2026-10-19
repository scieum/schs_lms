"use client";
import { useState, type MouseEvent, type ReactNode } from "react";
import { guideStore } from "./guide-store";
import { BookOpen, Check, ChevronDown, ChevronUp, RotateCcw, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";
import { isSpellRow, type AutoCheck, type CheckRow } from "@/lib/domain/auto-check";
import { UNIT_LABEL, type LengthRange, type LengthUnit } from "@/lib/domain/length";

// 자동 검사 (Figma N23 330:628): 머리(상태 태그 · 값/최대 · 넘은 양) → 목표 범위 막대 → 못 지난 항목 행(최대 4) → 지난 항목 한 줄 → 분량 줄.
// 넓은 단(512 이상)은 분량 줄이 한 줄, 좁은 단(모바일 · 초안 검토 410 단)은 두 줄 + 꽉 찬 버튼.

const STATUS = {
  pass: { text: "통과", tone: "bg-ok-soft text-ok" },
  check: { text: "", tone: "bg-wait-soft text-[#9A6400]" },
  block: { text: "확정 불가", tone: "bg-bad-soft text-bad" },
} as const;
const SHOWN = 4;
const u = (unit: LengthUnit) => (unit === "bytes" ? "B" : UNIT_LABEL[unit]);

export function AutoChecks({ check, range, onFind, length, children, open: openProp, onOpen, onReplace, fix, onReplaceAll, spellAi, renderOpen }: {
  /** N38 맞춤법 묶음: 모두 바꾸기(규칙 사전 행만) · 맞춤법 AI 검사 줄 */
  onReplaceAll?: () => void;
  spellAi?: ReactNode;
  /** N38: 행 펼침 내용을 바꿔 그린다 (근거 없는 문장) — undefined 면 기본 펼침 */
  renderOpen?: (row: CheckRow) => ReactNode | undefined;
  check: AutoCheck;
  range: LengthRange;
  /** 행을 펼칠 때: 본문에서 그 말로 (N34 — 예전 "찾기" 버튼 대신) */
  onFind?: (s: string) => void;
  /** 분량 줄 (LengthRow) */
  length: ReactNode;
  /** 맞춘 글 카드 같은 덧붙임 (분량 줄 위) */
  children?: ReactNode;
  /** 펼친 행 key (밑줄 클릭과 연결할 때 바깥에서 쥔다) */
  open?: string | null;
  onOpen?: (key: string | null) => void;
  /** "바꾸기": 본문에서 fix.from → fix.to */
  onReplace?: (row: CheckRow) => void;
  /** AI로 고치기 줄 · 고친 글 카드 (행들 아래) */
  fix?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const [openState, setOpenState] = useState<string | null>(null);
  const open = openProp !== undefined ? openProp : openState;
  const { status, passed, value, over } = check;
  // 맞춤법 행은 아래 묶음으로 따로 (N38)
  const rows = check.rows.filter((r) => !isSpellRow(r));
  const spell = check.rows.filter(isSpellRow);
  const openAt = rows.findIndex((r) => r.key === open);
  const shown = all || openAt >= SHOWN ? rows : rows.slice(0, SHOWN);
  const toggle = (r: CheckRow) => {
    const next = open === r.key ? null : r.key;
    setOpenState(next);
    onOpen?.(next);
    if (next && r.find) onFind?.(r.find);
  };
  const scale = range.max * 1.15; // 막대 끝 = 최대 × 1.15
  const pos = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  return (
    <div className="@container flex flex-col gap-3 rounded-inner border border-line bg-[#fff] p-4 @lg:px-5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold">자동 검사</span>
        {status !== "empty" && (
          <span className={cx("whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", STATUS[status].tone)}>
            {status === "check" ? `확인 ${check.rows.length}` : STATUS[status].text}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-1.5 whitespace-nowrap">
          <b className="text-[16px] tabular-nums">{value.toLocaleString()}</b>
          <span className="text-[13px] text-mute">/ {range.max.toLocaleString()}{u(range.unit)}</span>
          {over > 0 && <span className="self-center rounded-chip bg-bad-soft px-1.5 py-px text-[12px] font-bold text-bad">+{over.toLocaleString()}{u(range.unit)}</span>}
        </span>
      </div>

      <div>
        <div className="relative h-1.5 overflow-hidden rounded-[3px] bg-line" aria-hidden>
          <span className="absolute inset-y-0 bg-[#D9DDE3]" style={{ left: pos(range.min), width: `calc(${pos(range.max)} - ${pos(range.min)})` }} />
          <span className="absolute inset-y-0 left-0 bg-key" style={{ width: pos(Math.min(value, range.max)) }} />
          {over > 0 && <span className="absolute inset-y-0 bg-bad" style={{ left: pos(range.max), width: `calc(${pos(value)} - ${pos(range.max)})` }} />}
        </div>
        <div className="relative mt-1 h-3.5 text-[11px] tabular-nums text-mute" aria-hidden>
          <span className="absolute -translate-x-1/2" style={{ left: pos(range.min) }}>{range.min.toLocaleString()}</span>
          <span className="absolute -translate-x-1/2" style={{ left: pos(range.max) }}>{range.max.toLocaleString()}</span>
        </div>
      </div>

      {status === "empty" && <p className="text-[13px] text-mute">본문을 쓰면 검사해요</p>}

      {rows.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((r) => <CheckRowItem key={r.key} r={r} open={open === r.key} onToggle={() => toggle(r)} onReplace={onReplace} body={open === r.key ? renderOpen?.(r) : undefined} />)}
          {rows.length > SHOWN && openAt < SHOWN && (
            <li className="border-t border-soft py-2.5 pl-[30px]">
              <button type="button" onClick={() => setAll(!all)} className="text-[12px] font-medium text-sub">{all ? "접기" : `${rows.length - SHOWN}개 더 보기`}</button>
            </li>
          )}
        </ul>
      )}

      {(spell.length > 0 || spellAi) && status !== "empty" && (
        <SpellGroup rows={spell} open={open} onToggle={toggle} onReplace={onReplace} onReplaceAll={onReplaceAll} ai={spellAi} />
      )}

      {fix}

      {passed.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-mute">
          <Check size={14} strokeWidth={3} className="text-ok" />
          <span className="font-medium text-ok">통과</span>
          {passed.map((p) => <span key={p}>· {p}</span>)}
        </p>
      )}

      {children}
      <div className="border-t border-line pt-3">{length}</div>
    </div>
  );
}

/** 펼침 한 줄: 넓은 단은 이름표 48 + 값, 좁은 단은 이름표 위 · 값 아래 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 @lg:flex-row @lg:gap-0">
      <span className="shrink-0 text-[12px] leading-5 text-mute @lg:w-[60px] @lg:pt-px">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 기재요령 칩 (N34 417:485): 누르면 기재요령 패널(N43)이 그 원문 카드를 펼친 채 열린다. ⌘/Ctrl 클릭 · 가운데 클릭은 원문 PDF 새 탭 그대로 */
export function SourceChip({ source, url, id }: { source: string; url?: string; id?: string }) {
  const body = <><BookOpen size={12} className="shrink-0" />{source}</>;
  const cls = "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-chip border border-line bg-[#fff] px-2 text-[12px] font-medium text-sub";
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!id || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    guideStore.open({ focusId: id });
  };
  return url ? <a href={url} target="_blank" rel="noreferrer" onClick={open} className={cx(cls, "hover:bg-soft")}>{body}</a> : <span className={cls}>{body}</span>;
}

/** 맞춤법·띄어쓰기 묶음 (N38 (e)): 머리 "n곳 · 규칙 사전" ↔ [모두 바꾸기 n] → N38 맞춤법 행 → 맞춤법 AI 검사 줄. 한 번에 하나만 펼침 */
function SpellGroup({ rows, open, onToggle, onReplace, onReplaceAll, ai }: {
  rows: CheckRow[]; open: string | null; onToggle: (r: CheckRow) => void; onReplace?: (row: CheckRow) => void; onReplaceAll?: () => void; ai?: ReactNode;
}) {
  const rule = rows.filter((r) => r.origin !== "ai").length;
  const hasAi = rows.some((r) => r.origin === "ai");
  return (
    <div className="flex flex-col">
      {rows.length > 0 && (
        <div className="flex items-center gap-2 pb-2.5">
          <span className="whitespace-nowrap text-[13px] font-bold">맞춤법·띄어쓰기</span>
          <span className="min-w-0 truncate text-[12px] text-mute">{rows.length}곳 · {hasAi ? (rule ? "규칙 사전 + AI 검사" : "AI 검사") : "규칙 사전"}</span>
          {onReplaceAll && rule > 0 && (
            <button type="button" onClick={onReplaceAll}
              className="ml-auto h-[30px] shrink-0 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff]">
              모두 바꾸기 {rule}
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((r) => <SpellRowItem key={r.key} r={r} open={open === r.key} onToggle={() => onToggle(r)} onReplace={onReplace} />)}
        </ul>
      )}
      {ai && <div className={cx(rows.length > 0 && "mt-1 border-t border-soft pt-3")}>{ai}</div>}
    </div>
  );
}

/** N38 맞춤법 행 (469:21476): "가" 원 · 종류 · 전(취소선) → 후 · 설명 ↔ [바꾸기](접힘에도) · chevron. 펼치면 풀이 + 어디서 찾았는지 */
function SpellRowItem({ r, open, onToggle, onReplace }: { r: CheckRow; open: boolean; onToggle: () => void; onReplace?: (row: CheckRow) => void }) {
  const h = r.spell!;
  return (
    <li className="border-t border-soft">
      <div className="flex items-start gap-2.5 py-2.5">
        <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[#7889FF] text-[11px] font-bold text-white">가</span>
        <button type="button" aria-expanded={open} onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
            <b>{h.kind}</b>
            <s className="text-mute">{h.from}</s>
            <span aria-hidden className="text-mute">→</span>
            <b className="text-key-strong">{h.to}</b>
          </span>
          <span className="block text-[12px] text-sub">{h.why}</span>
        </button>
        {onReplace && (
          <button type="button" onClick={() => onReplace(r)}
            className="h-[30px] shrink-0 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff]">바꾸기</button>
        )}
        <button type="button" onClick={onToggle} aria-label={open ? "접기" : "펼치기"} className="mt-1.5 shrink-0 text-mute">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-[30px] break-keep">
          {(h.more || h.basis) && (
            <div className="flex flex-col items-start gap-1.5 rounded-control bg-bg px-3 py-2.5">
              {h.more && <p className="text-[13px] leading-5 text-sub">{h.more}</p>}
              {h.basis && <><p className="text-[13px] leading-5 text-sub">“{h.basis.quote}”</p><SourceChip source={h.basis.source} url={h.basis.url} id={"id" in h.basis ? (h.basis.id as string | undefined) : undefined} /></>}
            </div>
          )}
          <p className="text-[12px] text-mute">{r.origin === "ai" ? "AI 검사 · 틀릴 수 있어요 — 하나씩 확인해 바꿔 주세요" : "규칙 사전 · AI 검사 아님"}</p>
        </div>
      )}
    </li>
  );
}

/** 검사 행 (N34 417:673): 머리(누르면 펼침) · 걸린 말 · 왜 · 근거 · 고칠 말. body 가 있으면 펼침을 그것으로 (N38 근거 없는 문장) */
function CheckRowItem({ r, open, onToggle, onReplace, body }: { r: CheckRow; open: boolean; onToggle: () => void; onReplace?: (row: CheckRow) => void; body?: ReactNode }) {
  const block = r.level === "block";
  const expandable = r.key !== "len";
  const head = (
    <>
      <span className={cx("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-white", block ? "bg-bad" : "bg-wait")} aria-hidden>
        {block ? <X size={12} strokeWidth={3} /> : <b className="text-[13px] leading-none">!</b>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5">
          <span className="text-[13px] font-bold">{r.label}</span>
          {block && <span className="whitespace-nowrap rounded-chip bg-bad-soft px-1.5 py-px text-[11px] font-bold text-bad">확정 불가</span>}
        </span>
        <span className="block text-[12px] text-sub">
          {r.hit && <b className="text-ink">{r.hit}</b>}{r.detail}
        </span>
      </span>
    </>
  );
  if (!expandable) return <li className="flex items-start gap-2.5 border-t border-soft py-2.5">{head}</li>;
  return (
    <li className="border-t border-soft">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-start gap-2.5 py-2.5 text-left">
        {head}
        {open ? <ChevronUp size={16} className="mt-0.5 shrink-0 text-mute" /> : <ChevronDown size={16} className="mt-0.5 shrink-0 text-mute" />}
      </button>
      {open && body}
      {open && !body && (
        <div className="flex flex-col gap-2.5 pb-3 pl-[30px] break-keep">
          {(r.phrase ?? r.hit) && (
            <Field label="걸린 말">
              <span className={cx("inline rounded-chip px-2 py-0.5 text-[13px] font-medium [box-decoration-break:clone]", block ? "bg-bad-soft text-bad" : "bg-wait-soft text-[#9A6400]")}>{r.phrase ?? r.hit}</span>
            </Field>
          )}
          <Field label="왜"><p className="text-[13px] leading-5 text-ink">{r.why}</p></Field>
          {r.basis && (
            <Field label="근거">
              <div className="flex flex-col items-start gap-1.5 rounded-control bg-bg px-3 py-2.5">
                <p className="text-[13px] leading-5 text-sub">“{r.basis.quote}”</p>
                <SourceChip source={r.basis.source} url={r.basis.url} id={r.basis.id} />
              </div>
            </Field>
          )}
          <Field label="고칠 말">
            {r.fix ? (
              <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:gap-3">
                <p className="min-w-0 flex-1 text-[13px] leading-5">
                  <s className="text-mute">{r.fix.from.trim()}</s>
                  <span className="mx-1.5 text-mute">→</span>
                  <b className="text-key-strong">{r.fix.to ?? "빼기"}</b>
                </p>
                {onReplace && (
                  <button type="button" onClick={() => onReplace(r)}
                    className="h-10 shrink-0 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] @lg:h-[30px] @lg:w-[72px]">
                    {r.fix.to === null ? "빼기" : "바꾸기"}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[13px] leading-5 text-mute">규칙으로 바꿀 말이 없어요 · AI로 고치기에서 같이 고쳐요</p>
            )}
          </Field>
        </div>
      )}
    </li>
  );
}

/**
 * 분량 줄 (N23): 분량 · 바이트|글자 · 숫자 칸(단위 안쪽) · NEIS 한도(되돌리기) · 버튼들.
 * 폼에는 lengthUnit · lengthMax 로 들어간다 (form 을 주면 그 폼으로).
 */
export function LengthRow({ unit, max, limit, onChange, form, actions }: {
  unit: LengthUnit;
  max: number;
  /** 지금 단위의 NEIS 한도 */
  limit: number;
  onChange: (s: { unit: LengthUnit; max: number }) => void;
  form?: string;
  actions?: ReactNode;
}) {
  // 단위를 바꾸면 같은 분량이 되도록 숫자도 바꾼다 (한글 1글자 = 3바이트)
  const switchUnit = (next: LengthUnit) => {
    if (next === unit) return;
    onChange({ unit: next, max: next === "chars" ? Math.floor(max / 3) : max * 3 });
  };
  const segment = (
    <span className="flex shrink-0 gap-0.5 rounded-full bg-soft p-[3px]" role="tablist" aria-label="분량 단위">
      {(["bytes", "chars"] as const).map((x) => (
        <button key={x} type="button" role="tab" aria-selected={unit === x} onClick={() => switchUnit(x)}
          className={cx("whitespace-nowrap rounded-full px-3 py-[3px] text-[13px]", unit === x ? "bg-key-soft font-bold text-key-strong" : "text-mute")}>
          {UNIT_LABEL[x]}
        </button>
      ))}
    </span>
  );
  const reset = (
    <button type="button" onClick={() => onChange({ unit, max: limit })} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-sub">
      <RotateCcw size={13} /> NEIS 한도
    </button>
  );
  const field = (
    <label className="flex h-8 min-w-0 items-center rounded-field bg-soft px-2.5 focus-within:ring-2 focus-within:ring-key flex-1 @lg:w-24 @lg:flex-none">
      <input inputMode="numeric" value={max ? max.toLocaleString() : ""} aria-label={`최대 분량 (${UNIT_LABEL[unit]})`}
        onChange={(e) => onChange({ unit, max: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
        className="w-full min-w-0 bg-transparent text-[14px] font-medium tabular-nums outline-none" />
      <span className="shrink-0 text-[13px] text-mute">{u(unit)}</span>
    </label>
  );
  return (
    <div className="@container">
      <input form={form} type="hidden" name="lengthUnit" value={unit} />
      {/* 보이는 칸은 "1,500"처럼 쉼표를 넣으므로, 폼에는 숫자만 보낸다 */}
      <input form={form} type="hidden" name="lengthMax" value={max || ""} />
      {/* 넓은 단: 한 줄 */}
      <div className="hidden items-center gap-2.5 @lg:flex">
        <span className="shrink-0 text-[13px] font-medium text-sub">분량</span>
        {segment}{field}{reset}
        {actions && <span className="ml-auto flex shrink-0 gap-2">{actions}</span>}
      </div>
      {/* 좁은 단: 분량 ↔ NEIS 한도 / 단위 + 숫자 / 꽉 찬 버튼 */}
      <div className="flex flex-col gap-2 @lg:hidden">
        <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-sub">분량</span>{reset}</div>
        <div className="flex items-center gap-2">{segment}{field}</div>
        {actions && <div className="flex flex-col gap-2 [&>*]:h-10 [&>*]:w-full">{actions}</div>}
      </div>
    </div>
  );
}

/** "1,500B로 맞추기" (분량이 못 지났을 때만) */
export function FitButton({ max, unit, busy, onClick }: { max: number; unit: LengthUnit; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">
      <Sparkles size={14} />{busy ? "맞추는 중…" : `${max.toLocaleString()}${u(unit)}로 맞추기`}
    </button>
  );
}
