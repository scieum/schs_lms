"use client";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { rankCandidates, toRef, type SourceItem, type SourceRef } from "@/lib/domain/provenance";

// 근거 고르기 목록 (Figma N38 (b)): 흰 · 1px #E5E8EB · r10 · 안쪽 12/14. "이을 근거 고르기" + "학생A 자료만 보여요"
// → 후보 행(체크박스 18 · 종류 12 Bold 인디고 · 어디 12 #8B95A1 · 인용 13/20, 고른 행 #EEF0FF) — 이 학생 자료만, 문장과 겹치는 어절이 많은 순
// → "n개 고름" ↔ [취소] [근거로 잇기].

export const kindLabel = (s: SourceItem) => (s.type === "survey" ? `설문 ${s.q ?? ""}`.trim() : s.kind);

export function SourcePicker({ sentence, pool, who, onCancel, onLink }: {
  sentence: string;
  pool: SourceItem[];
  /** "학생A 자료만 보여요" */
  who: string;
  onCancel: () => void;
  onLink: (refs: SourceRef[]) => void;
}) {
  const list = useMemo(() => rankCandidates(sentence, pool), [sentence, pool]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] px-3.5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="whitespace-nowrap text-[13px] font-bold">이을 근거 고르기</span>
        <span className="min-w-0 truncate text-[12px] text-mute">{who} 자료만 보여요</span>
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-mute">이을 수 있는 자료가 없어요 · 조각을 먼저 남겨 주세요</p>
      ) : (
        <ul className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
          {list.map((s) => {
            const on = picked.has(s.key);
            return (
              <li key={s.key}>
                <label className={cx("flex cursor-pointer items-start gap-2.5 rounded-control px-2.5 py-2", on ? "bg-key-soft" : "hover:bg-bg")}>
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(s.key)} />
                  <span aria-hidden className={cx("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border peer-focus-visible:ring-2 peer-focus-visible:ring-key", on ? "border-key bg-key text-white" : "border-hair bg-[#fff]")}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 @lg:flex-row @lg:items-baseline @lg:gap-2">
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <b className="whitespace-nowrap text-[12px] text-key-strong">{kindLabel(s)}</b>
                      {s.where && <span className="max-w-[160px] truncate text-[12px] text-mute">{s.where}</span>}
                    </span>
                    <span className="line-clamp-2 min-w-0 break-keep text-[13px] leading-5">“{s.text}”</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 pt-1">
        <span className="min-w-0 flex-1 text-[12px] text-mute">{picked.size}개 고름</span>
        <Button type="button" kind="outline" size="sm" onClick={onCancel} className="h-8 py-0">취소</Button>
        <Button type="button" size="sm" disabled={!picked.size} onClick={() => onLink(list.filter((s) => picked.has(s.key)).map(toRef))} className="h-8 py-0 disabled:bg-key disabled:opacity-40">근거로 잇기</Button>
      </div>
    </div>
  );
}
