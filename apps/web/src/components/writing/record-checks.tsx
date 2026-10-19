"use client";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { Button, Tag } from "@/components/ui";
import { autoCheck, isSpellRow, type AutoCheck, type CheckMore, type CheckRow } from "@/lib/domain/auto-check";
import { applySpell } from "@/lib/domain/spelling";
import { applyFix } from "@/lib/domain/forbidden";
import { measure, UNIT_LABEL, type LengthRange, type LengthUnit } from "@/lib/domain/length";
import { findIdentity, type AiDraftResult } from "@/lib/domain/writing";
import type { AiFixResult } from "@/lib/domain/variants";
import { AutoChecks, FitButton, LengthRow } from "./auto-checks";
import { AiFixArea } from "./ai-fix";
import type { Mark } from "./highlight-textarea";
import { useUndoSnack } from "./undo-snack";

export type Who = { name: string; studentNo: string; grade: number; classNo: number; number: number };

// 자동 검사 (Figma N23 · N34): 세특·창체·행발 편집. 검사 규칙은 lib/domain/auto-check.ts, 모양은 auto-checks.tsx.
// "맞추기" (Figma N11 224:2794): 분량이 못 지났을 때만, 본문을 목표 분량(최대의 90~100%)에 맞춘 제안을 받아 확인 후 넣는다
// N34: 행 펼침(걸린 말 · 왜 · 근거 · 고칠 말) · 본문 밑줄 · 바꾸기(되돌리기 스낵바) · AI로 고치기.
type Fit = { run: () => Promise<AiDraftResult>; onApply: (text: string) => void };
type Length = { unit: LengthUnit; max: number; limit: number; onChange: (s: { unit: LengthUnit; max: number }) => void };

/**
 * 본문 · 검사 상태를 한곳에서: 검사 결과 · 펼친 행 · 밑줄 · 바꾸기(되돌리기) · 본문 바꾸기 스낵바.
 * 본문 칸(HighlightTextarea)과 검사 카드(RecordChecks)가 같이 쓴다.
 */
export function useBodyChecks({ text, setText, range, who, context, extraMarks = [], openFirst = false, more }: {
  text: string; setText: (t: string) => void; range: LengthRange; who: Who; context?: string; extraMarks?: Mark[];
  /** 반 전체 검사(N35)에서 "열기"로 들어오면 첫 걸린 행을 펼친다 */
  openFirst?: boolean;
  /** N38: 근거 없는 문장 · 맞춤법 AI 결과 */
  more?: CheckMore;
}) {
  const check = useMemo(() => autoCheck(text, range, findIdentity(text, who), undefined, context, more), [text, range, who, context, more]);
  const recheck = useCallback((t: string) => autoCheck(t, range, findIdentity(t, who), undefined, context), [range, who, context]);
  const [open, setOpen] = useState<string | null>(() => (openFirst ? autoCheck(text, range, findIdentity(text, who), undefined, context, more).rows[0]?.key ?? null : null));
  const snack = useUndoSnack();
  /** 본문을 통째로 바꾸고 "되돌리기" 스낵바 */
  const replace = (next: string, msg: string) => {
    const prev = text;
    setText(next);
    snack.show(msg, () => setText(prev));
  };
  const onReplace = (r: CheckRow) => {
    if (!r.fix) return;
    // 맞춤법 행은 그 자리만 바꾼다 (같은 말이 앞에 또 있어도)
    const next = r.spell ? applySpell(text, [r.spell]) : applyFix(text, r.fix);
    if (next === text) return;
    setOpen(null);
    replace(next, r.fix.to === null ? "뺐어요" : "바꿨어요");
  };
  /** 맞춤법 모두 바꾸기: 규칙 사전 행만 (AI 검사 행은 하나씩 — AI가 틀릴 수 있어서). 뒤에서부터 → 한 번에 되돌림 */
  const onReplaceAll = () => {
    const rows = check.rows.filter((r) => isSpellRow(r) && r.origin === "rule" && r.spell);
    if (!rows.length) return;
    const next = applySpell(text, rows.map((r) => r.spell!));
    if (next === text) return;
    setOpen(null);
    replace(next, `${rows.length}곳을 바꿨어요`);
  };
  const marks: Mark[] = [
    ...extraMarks,
    ...check.rows.flatMap((r) => r.ranges.map((g) => ({
      ...g, tone: r.level === "block" ? ("block" as const) : r.underline === "wavy" ? ("spell" as const) : ("warn" as const), style: r.underline, key: r.key, strong: r.key === open,
    }))),
  ];
  return { check, recheck, open, setOpen, marks, onReplace, onReplaceAll, replace, snack: snack.node };
}

export function RecordChecks({ text, range, check, recheck, fit, length, open, onOpen, onReplace, aiFix, onReplaceAll, spellAi, renderOpen }: {
  /** N38: 맞춤법 모두 바꾸기 · 맞춤법 AI 검사 줄 · 근거 없는 문장 펼침 */
  onReplaceAll?: () => void;
  spellAi?: ReactNode;
  renderOpen?: (row: CheckRow) => ReactNode | undefined;
  text: string;
  range: LengthRange;
  check: AutoCheck;
  recheck: (t: string) => AutoCheck;
  fit?: Fit;
  length: Length;
  open: string | null;
  onOpen: (key: string | null) => void;
  onReplace: (row: CheckRow) => void;
  /** AI로 고치기 (없으면 줄을 숨긴다) */
  aiFix?: { run: (text: string) => Promise<AiFixResult>; onApply: (text: string) => void };
}) {
  const [fitted, setFitted] = useState<AiDraftResult | null>(null);
  const [fitting, startFit] = useTransition();
  const runFit = () => fit && startFit(async () => {
    try { setFitted(await fit.run()); } catch { setFitted({ ok: false, error: "맞추지 못했어요. 직접 고쳐 주세요" }); }
  });
  const lengthFails = check.rows.some((r) => r.key === "len");

  return (
    <AutoChecks check={check} range={range} open={open} onOpen={onOpen} onReplace={onReplace} onReplaceAll={onReplaceAll} spellAi={spellAi} renderOpen={renderOpen}
      fix={aiFix && <AiFixArea text={text} check={check} recheck={recheck} range={range} run={aiFix.run} onApply={aiFix.onApply} />}
      length={<LengthRow {...length} actions={fit && lengthFails ? <FitButton max={range.max} unit={range.unit} busy={fitting} onClick={runFit} /> : undefined} />}>
      {fitted && !fitting && (fitted.ok ? (
        <div className="flex flex-col gap-2.5 rounded-inner border border-line bg-[#fff] p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">맞춘 글</Tag>
            {fitted.sample && <Tag tone="bg-soft text-mute">예시</Tag>}
            <Tag tone="bg-soft text-sub">{`${measure(fitted.text, range.unit).toLocaleString()}${UNIT_LABEL[range.unit]}`}</Tag>
          </div>
          <p className="whitespace-pre-wrap break-keep text-sm leading-6">{fitted.text}</p>
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

/** ③ 단계 머리 설명 (Figma N32 · N34): 빈 본문 · 확정 불가 · n곳 · 확인 n · 통과 (+ 비슷한 문장 n명) */
export function checkMeta(check: AutoCheck, similar = 0): string {
  const base = check.status === "empty" ? "본문을 쓰면 검사해요" : check.status === "block" ? `확정 불가 · ${check.rows.length}곳` : check.rows.length ? `확인 ${check.rows.length}곳` : "통과";
  return similar ? `${base} · 비슷한 문장 ${similar}명` : base;
}

/** 본문 입력칸에서 그 말을 골라 보이게 한다 (초안 검토 문장 도우미) */
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
