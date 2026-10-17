"use client";
import { useState, useTransition, type ReactNode } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { measure, UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import type { AiDraftResult } from "@/lib/domain/writing";
import { styleIssues } from "@/lib/domain/neis-style";
import { checkRecord } from "@/lib/domain/writing";
import { ForbiddenHits } from "@/components/writing/forbidden-hits";
import { findForbidden } from "@/lib/domain/forbidden";

export type Who = { name: string; studentNo: string; grade: number; classNo: number; number: number };

// 자동 검사 (Figma T4): 분량 막대 + 글자수 범위 · 학번·실명 0건 · 문장 어미 '~함.' · 문체 규칙(속초고 세특 프롬프트). 아래에 분량 고르기를 넣는다.
// "맞추기" (Figma N11 224:2794): 본문만 목표 분량(최대의 90~100%)에 맞춘 제안을 받아 확인 후 넣는다
type Fit = { run: () => Promise<AiDraftResult>; onApply: (text: string) => void };

export function RecordChecks({ text, range, who, fit, children }: { text: string; range: LengthRange; who: Who; fit?: Fit; children?: ReactNode }) {
  const [fitted, setFitted] = useState<AiDraftResult | null>(null);
  const [fitting, startFit] = useTransition();
  const runFit = () => fit && startFit(async () => {
    try { setFitted(await fit.run()); } catch { setFitted({ ok: false, error: "맞추지 못했어요. 직접 고쳐 주세요" }); }
  });
  const c = checkRecord(text, range, who);
  const pct = Math.min(100, Math.round((c.length.value / range.max) * 100));
  const over = c.length.reason === "too_long";
  const empty = !text.trim();
  const style = styleIssues(text).filter((i) => i !== "서술형 어미" && i !== "마침표 없음"); // 어미는 위 항목이 본다
  const forbidden = findForbidden(text);
  const banned = forbidden.filter((h) => h.level === "ban").length;
  const items: [boolean, string][] = [
    [c.length.ok, over ? "분량 초과" : c.length.reason === "too_short" ? `최소 ${range.min.toLocaleString()}${UNIT_LABEL[range.unit]}` : "글자수 범위"],
    [c.identity === 0, `학번·실명 ${c.identity}건`],
    [c.badEndings === 0, c.badEndings ? `어미 확인 ${c.badEndings}문장` : "문장 어미 '~함.'"],
    [style.length === 0, style.length ? style.join(" · ") : "문체 규칙"],
    [banned === 0, banned ? `금칙어 ${banned}건 (확정 불가)` : forbidden.length ? `금칙어 0건 · 확인 ${forbidden.length}` : "금칙어 0건"],
  ];
  const fails = items.filter(([ok]) => !ok).length;

  return (
    <div className="flex flex-col gap-3 rounded-inner bg-white p-4">
      <div className="flex items-center justify-between text-[13px]">
        <span className={cx("font-bold", empty ? "text-mute" : fails ? "text-wait" : "text-ok")}>
          {empty ? "자동 검사" : fails ? `자동 검사 ${fails}건 확인` : "자동 검사 통과"}
        </span>
        <span className="flex items-center gap-2">
          {fit && !empty && (
            <button type="button" onClick={runFit} disabled={fitting}
              className="hidden h-7 items-center gap-1 rounded-control border border-hair bg-[#fff] px-2.5 text-[12px] font-medium disabled:opacity-50 md:flex">
              <Sparkles size={13} className="text-key-strong" />{fitting ? "맞추는 중…" : `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}로 맞추기`}
            </button>
          )}
          <span className="font-bold">
            {c.length.value.toLocaleString()} / {range.max.toLocaleString()}
            {UNIT_LABEL[range.unit]}
          </span>
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
      {!empty && <ForbiddenHits hits={forbidden} />}
      {fit && !empty && (
        <button type="button" onClick={runFit} disabled={fitting}
          className="flex h-10 items-center justify-center gap-1 rounded-control border border-hair bg-[#fff] text-[13px] font-medium disabled:opacity-50 md:hidden">
          <Sparkles size={14} className="text-key-strong" />{fitting ? "맞추는 중…" : `${range.max.toLocaleString()}${UNIT_LABEL[range.unit]}로 맞추기`}
        </button>
      )}
      {fitted && !fitting && (fitted.ok ? (
        <div className="flex flex-col gap-2.5 rounded-inner border border-line bg-[#fff] p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">맞춘 글</Tag>
            {fitted.sample && <Tag tone="bg-soft text-mute">예시</Tag>}
            <Tag tone="bg-soft text-sub">{`${measure(fitted.text, range.unit).toLocaleString()}${UNIT_LABEL[range.unit]}`}</Tag>
          </div>
          <p className="text-sm leading-6 whitespace-pre-wrap">{fitted.text}</p>
          {fitted.notice && <p className="text-[12px] text-mute">{fitted.notice}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" kind="ghost" size="sm" onClick={() => setFitted(null)}>그대로 두기</Button>
            <Button type="button" kind="outline" size="sm" onClick={() => { fit!.onApply(fitted.text); setFitted(null); }}>본문에 넣기</Button>
          </div>
        </div>
      ) : <p className="text-[13px] text-bad" role="alert">{fitted.error}</p>)}
      {children && <div className="border-t border-line pt-3">{children}</div>}
    </div>
  );
}
