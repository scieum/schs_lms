"use client";
import { createContext, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { cx } from "@/components/ui";
import type { AutoCheck } from "@/lib/domain/auto-check";
import { measure, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { parseStep, stepState, stepStorageKey, withStepParam, type WriteStep } from "@/lib/domain/write-step";

// 기록 쓰기 단계 나누기 (Figma N48): 학생 카드 맨 위 단계 표시(538:684) · 지금 단계만 보여 주기 · 맨 아래 이전/다음(538:725).
// 세 단계를 한 화면에 쌓던 N40 구조(진행 줄 + ① ② ③)를 대신한다. 숨긴 단계도 그려 둔 채(상태 · 폼 유지) CSS 로만 숨긴다.

/** 단계 표시 안에 있으면 StepHead 는 제목을 화면에서 숨긴다 (단계 표시가 제목을 대신 보여 줌) */
export const StepperContext = createContext(false);

// ---------- 단계 기억: 주소 줄 ?step= (학생 id 와 같이) · 이 탭 sessionStorage ----------
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("popstate", l);
  return () => { listeners.delete(l); window.removeEventListener("popstate", l); };
}
function readRemembered(key: string, studentId: string): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("step");
    const who = q.get("student");
    if (s && (!who || who === studentId)) return s;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 지금 단계. 고른 단계 → 기억한 단계(주소 줄 · 이 탭) → 처음 단계(auto, 한 번 정하면 그대로) 순.
 * auto 가 null 이면(메모 불러오는 중) ①을 잠깐 보여 주고, 알게 되면 한 번만 정한다.
 */
export function useWriteStep(scope: string, studentId: string, auto: WriteStep | null) {
  const key = stepStorageKey(scope, studentId);
  const remembered = parseStep(useSyncExternalStore(subscribe, () => readRemembered(key, studentId), () => null));
  const [first, setFirst] = useState<WriteStep | null>(auto);
  if (first === null && auto !== null) setFirst(auto);
  const [picked, setPicked] = useState<WriteStep | null>(null);
  const step: WriteStep = picked ?? remembered ?? first ?? 1;
  const top = useRef<HTMLElement>(null);
  const go = useCallback((s: WriteStep, opt?: { scroll?: boolean }) => {
    setPicked(s);
    try { window.sessionStorage.setItem(key, String(s)); } catch { /* 기억 못 해도 이번에는 쓴다 */ }
    try { window.history.replaceState(window.history.state, "", withStepParam(window.location.search, s)); } catch { /* 주소 줄을 못 바꿔도 화면은 바뀐다 */ }
    listeners.forEach((l) => l());
    // 아래 다음 버튼을 눌렀으면 단계 표시가 보이게 올린다
    if (opt?.scroll !== false) requestAnimationFrame(() => {
      const el = top.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [key]);
  return { step, go, top };
}

export type StepItem = {
  label: string;
  /** 값 줄: "메모 3" · "1,240 / 1,500B" · "확인 2" */
  value: ReactNode;
  tone?: "mute" | "ok" | "wait" | "bad" | "ink";
  /** 끝난 단계 (초록 체크) */
  done: boolean;
  /** 아직 갈 수 없음 (누가기록 한꺼번에 ③ 등) */
  disabled?: boolean;
};

const TONE = { mute: "text-mute", ok: "text-[#00A05D]", wait: "text-[#9A6400]", bad: "text-bad", ink: "text-sub" } as const;

/**
 * 단계 표시 (Figma N48 538:684): PC 세 칸 탭(지금 = 흰 바탕 · 인디고 점, 끝 = 초록 체크, 아직 = 흰 점 회색 번호, 눌러서 이동),
 * 모바일은 점 셋 + n/3 + 지금 단계 이름 + 값 한 줄 (점을 눌러 이동).
 */
export function WriteStepper({ items, current, onPick, label = "쓰기 단계", innerRef }: {
  items: StepItem[]; current: WriteStep; onPick: (s: WriteStep) => void; label?: string; innerRef?: React.Ref<HTMLElement>;
}) {
  const cur = items[current - 1];
  return (
    <nav aria-label={label} ref={innerRef} className="@container scroll-mt-4">
      {/* 칸 폭으로 나눈다 (기재요령 패널이 열려 카드가 좁아져도 모바일 모양으로) */}
      <ol className="hidden grid-cols-3 gap-1 rounded-inner bg-bg p-1 @xl:grid">
        {items.map((it, i) => {
          const n = (i + 1) as WriteStep;
          const s = stepState(n, current, it.done);
          return (
            <li key={it.label} className="min-w-0">
              <button type="button" onClick={() => onPick(n)} disabled={it.disabled} aria-current={s === "current" ? "step" : undefined}
                className={cx("flex h-full w-full min-w-0 items-center gap-2.5 rounded-control px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  s === "current" ? "bg-[#fff] ring-1 ring-line" : "hover:bg-[#fff]/60")}>
                <StepDot n={n} state={s} />
                <span className="flex min-w-0 flex-col">
                  <span className={cx("truncate text-[14px]", s === "todo" ? "font-medium text-sub" : "font-bold text-ink")}>
                    <span className="sr-only">{n}단계 </span>{it.label}{s === "done" && <span className="sr-only"> (끝)</span>}
                  </span>
                  <span className={cx("truncate text-[12px] tabular-nums", s === "done" ? "text-[#00A05D]" : TONE[it.tone ?? "mute"])}>{it.value}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex min-w-0 items-center gap-2 rounded-inner bg-bg py-1.5 pl-1.5 pr-3 @xl:hidden">
        <span className="flex shrink-0 items-center">
          {items.map((it, i) => {
            const n = (i + 1) as WriteStep;
            const s = stepState(n, current, it.done);
            return (
              <button key={it.label} type="button" onClick={() => onPick(n)} disabled={it.disabled} aria-current={s === "current" ? "step" : undefined}
                aria-label={`${n}단계 ${it.label}${s === "done" ? " (끝)" : ""}`} className="flex h-8 items-center px-[3px] disabled:opacity-50">
                <span aria-hidden className={cx("block h-2 rounded-full transition-all", s === "current" ? "w-5 bg-key" : s === "done" ? "w-2 bg-ok" : "w-2 bg-hair")} />
              </button>
            );
          })}
        </span>
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-mute">{current}/3</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{cur.label}</span>
        <span className={cx("shrink-0 whitespace-nowrap text-[13px] font-medium tabular-nums", TONE[cur.tone ?? "ink"])}>{cur.value}</span>
      </div>
    </nav>
  );
}

function StepDot({ n, state }: { n: number; state: "current" | "done" | "todo" }) {
  return (
    <span aria-hidden className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
      state === "current" ? "bg-key text-white" : state === "done" ? "bg-ok-soft text-ok" : "border border-hair bg-[#fff] text-mute")}>
      {state === "done" ? <Check size={14} strokeWidth={3} /> : n}
    </span>
  );
}

/**
 * 맨 아래 이전 · 다음 (Figma N48 538:725). PC 는 카드 안 줄(위 1px 선), 모바일은 화면 아래 탭 막대 위에 붙는다.
 * 다음은 soft 인디고, 그 단계 일이 끝나면(primary) 인디고 — 화면의 인디고 버튼은 하나.
 */
export function StepNav({ onPrev, onNext, next, hint, primary = false, nextDisabled = false }: {
  onPrev?: () => void; onNext?: () => void; next?: string; hint?: ReactNode; primary?: boolean; nextDisabled?: boolean;
}) {
  return (
    <div data-sticky-cta className="z-10 flex items-center gap-2 border-t border-line bg-[#fff] pt-4 max-md:sticky max-md:bottom-[calc(env(safe-area-inset-bottom)+66px)] max-md:-mx-5 max-md:px-5 max-md:pb-3 max-md:pt-3 md:gap-3">
      {onPrev && (
        <button type="button" onClick={onPrev} className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-control border border-hair bg-[#fff] pl-3 pr-4 text-[14px] font-bold hover:bg-soft md:h-10">
          <ChevronLeft size={16} aria-hidden /> 이전
        </button>
      )}
      {hint && <span className="hidden min-w-0 flex-1 truncate text-right text-[13px] text-mute md:block">{hint}</span>}
      {!hint && <span className="hidden flex-1 md:block" />}
      {onNext && next && (
        <button type="button" onClick={onNext} disabled={nextDisabled}
          className={cx("inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-control px-4 text-[14px] font-bold disabled:cursor-not-allowed disabled:bg-soft disabled:text-mute md:h-10 md:flex-none md:px-5",
            primary ? "bg-key text-white hover:bg-key-strong" : "bg-key-soft text-key-strong hover:bg-[#e3e7ff]")}>
          {next} <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** ③의 이전 버튼 (임시 저장 · 확정 줄 맨 앞) */
export function PrevButton({ onClick, label = "이전" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-control border border-hair bg-[#fff] px-3 text-[14px] font-bold hover:bg-soft md:h-auto md:pl-3 md:pr-4">
      <ChevronLeft size={16} aria-hidden /><span className="max-md:hidden">이전</span>
    </button>
  );
}

/** ③ 확정한 글 읽기 (Figma N48 d): 초록 줄 + 고치기. 고치기를 누르거나 글을 고치면 검사 · 저장 칸이 다시 나온다 */
export function ConfirmedLine({ meta, onEdit }: { meta: ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-inner bg-ok-soft py-3 pl-4 pr-3" role="status">
      <Check size={16} strokeWidth={3} className="shrink-0 text-[#00A05D]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col break-keep">
        <span className="text-[14px] font-bold text-[#00A05D]">확정한 글이에요</span>
        <span className="text-[12px] text-sub">{meta}</span>
      </span>
      <button type="button" onClick={onEdit} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold hover:bg-soft">
        <Pencil size={13} aria-hidden /> 고치기
      </button>
    </div>
  );
}

/** 단계 표시 값: 메모 · 글 분량 · 검사 (N40 진행 줄의 말 그대로) */
export function writeStepItems({ memos, text, unit, max, check, confirmedNow, hasBody }: {
  memos: number | null; text: string; unit: LengthUnit; max: number; check: AutoCheck; confirmedNow: boolean; hasBody: boolean;
}): StepItem[] {
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  const value = measure(text, unit);
  const [checkText, tone]: [string, StepItem["tone"]] =
    confirmedNow ? ["확정함", "ok"]
    : check.status === "empty" ? ["글 없음", "mute"]
    : check.status === "block" ? [`확정 불가 ${check.rows.length}`, "bad"]
    : check.status === "check" ? [`확인 ${check.rows.length}`, "wait"]
    : ["통과", "ok"];
  return [
    { label: "활동 메모", value: memos == null ? "메모 …" : `메모 ${memos}`, done: !!memos },
    { label: "AI로 쓰기", value: hasBody ? `${value.toLocaleString()} / ${max.toLocaleString()}${u}` : "글 없음", tone: value > max ? "bad" : "mute", done: hasBody },
    { label: "글 확인 · 확정", value: checkText, tone, done: confirmedNow },
  ];
}
