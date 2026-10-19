"use client";
import { useState, useTransition } from "react";
import { Button, Tag } from "@/components/ui";
import { autoCheck } from "@/lib/domain/auto-check";
import { measure, UNIT_LABEL, type LengthRange, type LengthUnit } from "@/lib/domain/length";
import { findIdentity, type AiDraftResult } from "@/lib/domain/writing";
import { AutoChecks, FitButton, LengthRow } from "./auto-checks";

export type Who = { name: string; studentNo: string; grade: number; classNo: number; number: number };

// 자동 검사 (Figma N23): 세특·창체·행발 편집. 검사 규칙은 lib/domain/auto-check.ts, 모양은 auto-checks.tsx.
// "맞추기" (Figma N11 224:2794): 분량이 못 지났을 때만, 본문을 목표 분량(최대의 90~100%)에 맞춘 제안을 받아 확인 후 넣는다
type Fit = { run: () => Promise<AiDraftResult>; onApply: (text: string) => void };
type Length = { unit: LengthUnit; max: number; limit: number; onChange: (s: { unit: LengthUnit; max: number }) => void };

export function RecordChecks({ text, range, who, fit, length, onFind }: {
  text: string; range: LengthRange; who: Who; fit?: Fit; length: Length; onFind?: (s: string) => void;
}) {
  const [fitted, setFitted] = useState<AiDraftResult | null>(null);
  const [fitting, startFit] = useTransition();
  const runFit = () => fit && startFit(async () => {
    try { setFitted(await fit.run()); } catch { setFitted({ ok: false, error: "맞추지 못했어요. 직접 고쳐 주세요" }); }
  });
  const check = autoCheck(text, range, findIdentity(text, who));
  const lengthFails = check.rows.some((r) => r.key === "len");

  return (
    <AutoChecks check={check} range={range} onFind={onFind}
      length={<LengthRow {...length} actions={fit && lengthFails ? <FitButton max={range.max} unit={range.unit} busy={fitting} onClick={runFit} /> : undefined} />}>
      {fitted && !fitting && (fitted.ok ? (
        <div className="flex flex-col gap-2.5 rounded-inner border border-line bg-[#fff] p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">맞춘 글</Tag>
            {fitted.sample && <Tag tone="bg-soft text-mute">예시</Tag>}
            <Tag tone="bg-soft text-sub">{`${measure(fitted.text, range.unit).toLocaleString()}${UNIT_LABEL[range.unit]}`}</Tag>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{fitted.text}</p>
          {fitted.notice && <p className="text-[12px] text-mute">{fitted.notice}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" kind="ghost" size="sm" onClick={() => setFitted(null)}>그대로 두기</Button>
            <Button type="button" kind="outline" size="sm" onClick={() => { fit!.onApply(fitted.text); setFitted(null); }}>본문에 넣기</Button>
          </div>
        </div>
      ) : <p className="text-[13px] text-bad" role="alert">{fitted.error}</p>)}
    </AutoChecks>
  );
}

/** ③ 단계 머리 설명 (Figma N32): 빈 본문 · 확인 n · 통과 */
export function checkMeta(text: string, range: LengthRange, who: Who): string {
  const c = autoCheck(text, range, findIdentity(text, who));
  return c.status === "empty" ? "본문을 쓰면 검사해요" : c.rows.length ? `확인 ${c.rows.length}` : "통과";
}

/** "찾기": 본문 입력칸에서 그 말을 골라 보이게 한다 */
export function selectIn(el: HTMLTextAreaElement | null, s: string) {
  if (!el) return;
  const i = el.value.indexOf(s);
  if (i < 0) return;
  el.focus();
  el.setSelectionRange(i, i + s.length);
  // 고른 곳이 보이도록: 그 앞 줄 수만큼 내린다
  const before = el.value.slice(0, i);
  const lines = before.split("\n").length + Math.floor(before.length / 60);
  el.scrollTop = Math.max(0, lines * 28 - el.clientHeight / 2);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}
