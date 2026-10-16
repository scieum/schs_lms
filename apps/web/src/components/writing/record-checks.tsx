"use client";
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cx } from "@/components/ui";
import { UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import { styleIssues } from "@/lib/domain/neis-style";
import { checkRecord } from "@/lib/domain/writing";

export type Who = { name: string; studentNo: string; grade: number; classNo: number; number: number };

// 자동 검사 (Figma T4): 분량 막대 + 글자수 범위 · 학번·실명 0건 · 문장 어미 '~함.' · 문체 규칙(속초고 세특 프롬프트). 아래에 분량 고르기를 넣는다.
export function RecordChecks({ text, range, who, children }: { text: string; range: LengthRange; who: Who; children?: ReactNode }) {
  const c = checkRecord(text, range, who);
  const pct = Math.min(100, Math.round((c.length.value / range.max) * 100));
  const over = c.length.reason === "too_long";
  const empty = !text.trim();
  const style = styleIssues(text).filter((i) => i !== "서술형 어미" && i !== "마침표 없음"); // 어미는 위 항목이 본다
  const items: [boolean, string][] = [
    [c.length.ok, over ? "분량 초과" : c.length.reason === "too_short" ? `최소 ${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}` : "글자수 범위"],
    [c.identity === 0, `학번·실명 ${c.identity}건`],
    [c.badEndings === 0, c.badEndings ? `어미 확인 ${c.badEndings}문장` : "문장 어미 '~함.'"],
    [style.length === 0, style.length ? style.join(" · ") : "문체 규칙"],
  ];
  const fails = items.filter(([ok]) => !ok).length;

  return (
    <div className="flex flex-col gap-3 rounded-inner bg-white p-4">
      <div className="flex items-center justify-between text-[13px]">
        <span className={cx("font-bold", empty ? "text-mute" : fails ? "text-wait" : "text-ok")}>
          {empty ? "자동 검사" : fails ? `자동 검사 ${fails}건 확인` : "자동 검사 통과"}
        </span>
        <span className="font-bold">
          {c.length.value.toLocaleString()} / {range.max.toLocaleString()}
          {UNIT_LABEL[range.unit]}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={cx("h-full rounded-full", over ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
      </div>
      {!empty && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {items.map(([ok, label]) => (
            <li key={label} className={cx("flex items-center gap-1", ok ? "text-sub" : "text-bad")}>
              {ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />} {label}
            </li>
          ))}
        </ul>
      )}
      {children && <div className="border-t border-line pt-3">{children}</div>}
    </div>
  );
}
