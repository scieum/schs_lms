"use client";
// N33 올린 파일 지우기 — 공통 조각 (Figma 407:468 휴지통 · 407:483 지우기 버튼 · 407:499 지우기 확인 · 407:522 파일 칩
// · 407:539 고름 바 · 407:548 스낵바 · 407:549 잠금 안내). 모달 없이 그 자리에서 묻고, 빨강은 마지막 "지우기"에만 쓴다.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Lock, Trash2, X } from "lucide-react";
import { cx } from "@/components/ui";

export type DeleteResult = { deleted?: number; error?: string };

/** 행 끝 32×32 고스트 버튼: 교사 목록·근거 자료는 휴지통, 학생 내 파일·칩은 × */
export function DeleteFileButton({ fileName, icon = "trash", active, onClick, className }: {
  fileName: string; icon?: "trash" | "x"; active?: boolean; onClick: () => void; className?: string;
}) {
  const I = icon === "trash" ? Trash2 : X;
  return (
    <button type="button" onClick={onClick} aria-label={`‘${fileName}’ 지우기`} aria-expanded={active}
      className={cx("flex size-8 shrink-0 items-center justify-center rounded-control text-mute outline-none transition-colors hover:bg-bad-soft hover:text-bad focus-visible:bg-bad-soft focus-visible:text-bad",
        active && "bg-bad-soft text-bad", className)}>
      <I size={18} aria-hidden />
    </button>
  );
}

/** 칩 안의 × (24 칸 #F2F4F6 r4). PC 는 칩 호버·포커스에만, 모바일은 늘 보인다 */
export function ChipDeleteButton({ fileName, active, onClick }: { fileName: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`‘${fileName}’ 지우기`} aria-expanded={active}
      className={cx("flex size-6 shrink-0 items-center justify-center rounded-[4px] outline-none",
        active ? "bg-bad-soft text-bad" : "bg-soft text-sub hover:text-bad focus-visible:text-bad md:hidden md:group-hover/chip:flex md:group-focus-within/chip:flex")}>
      <X size={14} strokeWidth={2.5} aria-hidden />
    </button>
  );
}

/**
 * 인라인 확인. row = 글 ↔ 버튼 한 줄, stack = 글 위 · 버튼 아래 오른쪽(좁은 칸), small = 칩 아래 한 줄.
 * 포커스는 "취소"에 먼저, Esc·바깥 누름 = 취소.
 */
export function DeleteConfirm({ title, sub, layout = "row", tone = "bg-bg", onCancel, onConfirm, busy }: {
  title: string; sub?: string; layout?: "row" | "stack" | "small"; tone?: string; onCancel: () => void; onConfirm: () => void; busy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const cancelFn = useRef(onCancel);
  useEffect(() => { cancelFn.current = onCancel; });
  useEffect(() => {
    cancel.current?.focus({ preventScroll: true });
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) cancelFn.current(); };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };
  const buttons = (
    <div className={cx("flex shrink-0 items-center gap-1", layout === "stack" && "justify-end")}>
      <button ref={cancel} type="button" onClick={onCancel} className="h-8 whitespace-nowrap rounded-control px-2.5 text-[13px] font-medium text-sub hover:bg-soft">취소</button>
      <button type="button" onClick={onConfirm} disabled={busy}
        className="h-8 whitespace-nowrap rounded-control bg-bad px-3 text-[13px] font-bold text-white hover:bg-[#d93a47] disabled:opacity-40">지우기</button>
    </div>
  );
  return (
    <div ref={box} role="group" aria-label={title} onKeyDown={onKey}
      className={cx("rounded-inner", tone, layout === "stack" ? "flex flex-col gap-2 p-3" : "flex items-center gap-3", layout === "row" && "px-3.5 py-2.5", layout === "small" && "px-3.5 py-2")}>
      <div className="min-w-0 flex-1">
        <p className={cx("text-ink", layout === "small" ? "break-all text-[13px] font-medium md:truncate" : "text-[14px] font-bold")}>{title}</p>
        {sub && <p className="truncate text-[12px] text-mute">{sub}</p>}
      </div>
      {buttons}
    </div>
  );
}

/** 지운 행이 높이 0으로 접힌다 (200ms) */
export function Collapse({ hidden, children, as: Tag = "div", className }: { hidden: boolean; children: ReactNode; as?: "div" | "li"; className?: string }) {
  return (
    <Tag aria-hidden={hidden || undefined} inert={hidden || undefined}
      className={cx("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", hidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]", className)}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </Tag>
  );
}

/** 화면 아래 가운데 스낵바 (네이비 · PC 360 / 모바일 꽉 찬 폭 − 40, 탭바 위 12). 영랑이 버튼은 위로 올린다 */
export function Snackbar({ text, onUndo }: { text: string; onUndo?: () => void }) {
  return (
    <div data-sticky-cta role="status" aria-live="polite"
      className="fixed inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-[80] flex h-12 items-center gap-3 rounded-inner bg-navy pl-4 pr-2 text-white md:inset-x-auto md:bottom-8 md:left-[calc(50%+120px)] md:w-[360px] md:-translate-x-1/2">
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{text}</span>
      {onUndo && <button type="button" onClick={onUndo} className="h-9 shrink-0 whitespace-nowrap rounded-control px-2.5 text-[14px] font-bold text-[#9eaaff] hover:bg-white/10">되돌리기</button>}
    </div>
  );
}

/**
 * 지우기 → 행을 바로 숨기고 스낵바. undo 면 delay(5초) 뒤 서버로 보내고 "되돌리기"로 취소할 수 있다 (교사 화면).
 * 페이지를 떠나거나(pagehide·언마운트) 새 지우기가 오면 남은 것을 바로 보낸다. undo 가 아니면 바로 보내고 3초 스낵바 (학생 화면).
 */
export function useDelayedDelete(send: (ids: string[]) => Promise<DeleteResult>, opts: { undo?: boolean; delay?: number; onDone?: (r: DeleteResult) => void; label?: (n: number) => string } = {}) {
  const { undo = true, delay = 5000 } = opts;
  const [hidden, setHidden] = useState<string[]>([]);
  const [snack, setSnack] = useState<{ text: string; undo: boolean; key: number } | null>(null);
  const pending = useRef<{ ids: string[]; timer: number } | null>(null);
  const latest = useRef({ send, onDone: opts.onDone, label: opts.label });
  useEffect(() => { latest.current = { send, onDone: opts.onDone, label: opts.label }; });

  const commit = useCallback((ids: string[]) => {
    const fail = (text: string) => {
      setHidden((h) => h.filter((x) => !ids.includes(x)));
      setSnack({ text, undo: false, key: Date.now() });
    };
    latest.current.send(ids)
      .then((r) => { if (r.error) fail(r.error); latest.current.onDone?.(r); })
      .catch(() => fail("지우지 못했어요. 잠시 뒤 다시 해 주세요"));
  }, []);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    commit(p.ids);
  }, [commit]);

  const remove = useCallback((ids: string[]) => {
    if (!ids.length) return;
    flush();
    setHidden((h) => [...h, ...ids]);
    const text = latest.current.label?.(ids.length) ?? `파일 ${ids.length}개를 지웠어요`;
    if (!undo) {
      commit(ids);
      setSnack({ text, undo: false, key: Date.now() });
      return;
    }
    const timer = window.setTimeout(() => {
      pending.current = null;
      setSnack(null);
      commit(ids);
    }, delay);
    pending.current = { ids, timer };
    setSnack({ text, undo: true, key: Date.now() });
  }, [commit, delay, flush, undo]);

  const restore = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    setHidden((h) => h.filter((x) => !p.ids.includes(x)));
    setSnack(null);
  }, []);

  // 되돌리기 없는 알림은 3초 뒤 사라진다
  useEffect(() => {
    if (!snack || snack.undo) return;
    const t = window.setTimeout(() => setSnack((s) => (s?.key === snack.key ? null : s)), 3000);
    return () => window.clearTimeout(t);
  }, [snack]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const snackbar = snack ? <Snackbar key={snack.key} text={snack.text} onUndo={snack.undo ? restore : undefined} /> : null;
  return { hidden, isHidden: (id: string) => hidden.includes(id), remove, restore, snackbar };
}

/** 고르기 모드 아래 고름 바. PC 는 목록 아래 붙고(sticky), 모바일은 탭바 위 꽉 찬 바 */
export function SelectBar({ count, total, onAll, onCancel, onDelete }: { count: number; total: number; onAll: () => void; onCancel: () => void; onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  const all = count === total && total > 0;
  const inner = asking ? (
    <DeleteConfirm title={`${count}개를 지울까요?`} tone="bg-transparent" layout="row" onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); onDelete(); }} />
  ) : (
    <div className="flex items-center gap-3 px-4 py-2 md:px-4">
      <span className="whitespace-nowrap text-[14px] font-bold">{count}개 고름</span>
      <button type="button" onClick={onAll} className="h-11 whitespace-nowrap text-[13px] font-medium text-key-strong md:h-8">{all ? "모두 풀기" : "전체 고르기"}</button>
      <span className="flex-1" />
      <button type="button" onClick={onCancel} className="h-11 whitespace-nowrap rounded-control px-2.5 text-[14px] font-medium text-sub hover:bg-soft md:h-8">취소</button>
      <button type="button" onClick={() => setAsking(true)} disabled={count === 0}
        className="h-11 whitespace-nowrap rounded-control px-2.5 text-[14px] font-bold text-bad hover:bg-bad-soft disabled:opacity-40 disabled:hover:bg-transparent md:h-8">지우기</button>
    </div>
  );
  return (
    <div data-sticky-cta
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+66px)] z-20 border-t border-line bg-[#fff] md:sticky md:bottom-4 md:mt-3 md:rounded-inner md:border">
      {inner}
    </div>
  );
}

/** 마감 뒤 학생 내 파일 아래 잠금 안내 */
export function LockNote({ children = "마감 후에는 선생님께 말해 주세요" }: { children?: string }) {
  return (
    <p className="flex items-center gap-2 rounded-inner bg-[#fff] px-3.5 py-2.5 text-[13px] font-medium text-sub">
      <Lock size={16} className="shrink-0 text-mute" aria-hidden /> {children}
    </p>
  );
}
