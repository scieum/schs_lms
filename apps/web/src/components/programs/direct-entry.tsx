"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Info, Lock, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { autoCheck } from "@/lib/domain/auto-check";
import { EXTERNAL_NOTE_MAX, EXTERNAL_TEXT_MAX } from "@/lib/domain/external-text";
import { measure, resolveLength, UNIT_LABEL, type DraftCategory, type LengthUnit } from "@/lib/domain/length";
import { findIdentity } from "@/lib/domain/program";
import { saveExternalDraft } from "@/app/(app)/teacher/programs/[id]/external-actions";

// 외부 생기부 글 직접 넣기 (Figma N46 컴포넌트 "N46 직접 넣기 편집" 516:625 · 화면 a 518:11575 · e 520:12310).
// 기관이 보낸 글을 붙여 넣거나 써서 "직접 입력" 초안(새 버전)으로 넣는다. AI 없음 · 자동 확정 없음.
// 바이트(프로그램 한도)·자동 검사(N23/N34 같은 규칙 — 대학명 같은 금칙어도)를 넣기 전에 보여 주고, 출처는 기록 밖 메모.

export type DirectEntryProps = {
  programId: string;
  studentId: string;
  area: DraftCategory;
  unit: LengthUnit;
  max: number;
  /** 실명·학번 검사용 (그 학생) */
  people: { name: string; studentNo: string }[];
  /** "지금 초안(AI 초안 · 버전 2)은 이전 버전으로 남아요" 처럼 (초안이 있을 때만) */
  keepLine?: string | null;
  initialNote?: string | null;
  onDone: (jobId: string) => void;
  onCancel: () => void;
  /** 버튼 줄 왼쪽 버튼 이름 (팝업은 "닫기") */
  cancelLabel?: string;
};

export function DirectEntryForm({ programId, studentId, area, unit, max, people, keepLine, initialNote, onDone, onCancel, cancelLabel = "취소" }: DirectEntryProps) {
  const [text, setText] = useState("");
  const [note, setNote] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const range = resolveLength(area, { unit, max });
  const value = measure(text.trim(), range.unit);
  const check = autoCheck(text, range, findIdentity(text, people));
  const rows = check.rows.slice(0, 3);
  const u = range.unit === "bytes" ? "B" : UNIT_LABEL[range.unit];
  const pct = Math.min(100, Math.round((value / Math.max(1, range.max)) * 100));
  const tag = check.status === "block" ? ["확정 불가", "bg-bad-soft text-bad"] : check.status === "check" ? [`확인 ${check.rows.length}`, "bg-wait-soft text-[#9A6400]"] : check.status === "pass" ? ["통과", "bg-ok-soft text-ok"] : null;

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveExternalDraft({ programId, studentId, text, note });
      if (r.ok) onDone(r.jobId);
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor={`direct-${studentId}`} className="flex-1 text-[13px] font-medium text-sub">생기부 글</label>
        <span className="text-[12px] text-mute">붙여 넣거나 직접 써요 · AI 안 씀</span>
      </div>
      <textarea id={`direct-${studentId}`} ref={box} value={text} onChange={(e) => setText(e.target.value)} maxLength={EXTERNAL_TEXT_MAX}
        placeholder="기관이 보낸 생기부 글을 그대로 붙여 넣어 주세요"
        className="min-h-[168px] w-full resize-y rounded-[10px] border border-hair bg-[#fff] px-4 py-3.5 text-[14px] leading-6 outline-none focus:border-key focus:ring-1 focus:ring-key max-md:min-h-[196px]" />
      <div className="flex items-center gap-2">
        {tag && <span className={cx("whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", tag[1])}>{tag[0]}</span>}
        <span className="flex-1 text-[12px] font-medium text-sub">{text.trim() ? "자동 검사" : "글을 넣으면 검사해요"}</span>
        <span className="whitespace-nowrap text-[13px] tabular-nums text-mute"><b className="text-[15px] text-ink">{value.toLocaleString("ko-KR")}</b> / {range.max.toLocaleString("ko-KR")}{u}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={cx("h-full rounded-full", check.over > 0 ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
      </div>
      {rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key} className="flex gap-2.5 border-t border-soft py-2.5">
              <span aria-hidden className={cx("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white", r.level === "block" ? "bg-bad" : "bg-wait")}>{r.level === "block" ? <X size={12} strokeWidth={3} /> : "!"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">{r.label}</span>
                <span className="block text-[12px] text-sub">{r.hit && <b className="text-ink">{r.hit}</b>}{r.detail}</span>
              </span>
            </li>
          ))}
          {check.rows.length > rows.length && <li className="pl-[30px] text-[12px] font-medium text-sub">{check.rows.length - rows.length}개 더 · 넣은 뒤 초안 검토에서 모두 보여요</li>}
        </ul>
      )}
      <label className="mt-1 flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">출처 (선택)</span>
        <span className="flex h-11 items-center gap-2 rounded-field bg-soft px-3 max-md:h-12">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, EXTERNAL_NOTE_MAX))} maxLength={EXTERNAL_NOTE_MAX} placeholder="예: ○○대학교 연계 프로그램 제공"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          <span className="text-[12px] tabular-nums text-mute">{note.length}/{EXTERNAL_NOTE_MAX}</span>
        </span>
        <span className="flex items-center gap-1 text-[12px] text-mute"><Lock size={12} aria-hidden /> 선생님만 봐요 · 생기부 글에는 들어가지 않아요</span>
      </label>
      {keepLine && <p className="text-[12px] text-mute">{keepLine}</p>}
      {error && <p className="text-[13px] font-medium text-bad" role="alert">{error}</p>}
      <div className="mt-1 flex gap-2 border-t border-line pt-4 md:justify-end">
        <Button type="button" kind="outline" onClick={onCancel} className="h-12 flex-1 md:h-10 md:flex-none">{cancelLabel}</Button>
        <Button type="button" onClick={submit} disabled={pending || !text.trim()} className="h-12 flex-[2] md:h-10 md:flex-none">{pending ? "넣는 중…" : "초안으로 넣기"}</Button>
      </div>
    </div>
  );
}

/** 초안 검토의 "직접 넣기": PC 가운데 창 560 · 모바일 바텀시트 (N36 업로드 창과 같은 틀) */
export function DirectEntryDialog({ title = "직접 넣기", sub, onClose, children }: { title?: string; sub: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-start md:px-6 md:pt-[96px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:max-h-[calc(100dvh-128px)] md:w-[560px] md:gap-4 md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold md:text-[18px]">{title}</h2>
            <p className="truncate text-[13px] text-mute">{sub}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 shrink-0 items-center justify-center text-sub"><X size={20} /></button>
        </div>
        <p className="flex items-center gap-2 rounded-field bg-bg px-3 py-2.5 text-[13px] font-medium text-sub"><Info size={16} className="shrink-0" aria-hidden /> 밖에서 받은 생기부 글을 그대로 넣어요 · AI는 쓰지 않아요</p>
        {children}
      </div>
    </div>
  );
}
