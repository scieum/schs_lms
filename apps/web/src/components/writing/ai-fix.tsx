"use client";
import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { fixableRows, type AutoCheck } from "@/lib/domain/auto-check";
import { measure, type LengthRange } from "@/lib/domain/length";
import type { AiFixResult } from "@/lib/domain/variants";
import { BeforeAfter, changeCount } from "./before-after";
import { SaveBookmark } from "./library-save";

// AI로 고치기 줄 · 고친 글 카드 (Figma N34 ① 417:93596 · 417:94317): 자동 검사 행들 아래.
// 못 지난 행(분량 빼고)이 있으면 줄을 보이고, 누르면 걸린 곳만 고친 글을 전·후로 비교한다. "본문에 넣기"를 눌러야 본문이 바뀐다.

const unitMark = (u: LengthRange["unit"]) => (u === "bytes" ? "B" : "자");

export function AiFixArea({ text, check, recheck, range, run, onApply }: {
  text: string;
  check: AutoCheck;
  /** 고친 글 다시 검사 (태그 "검사 통과" · "확인 n") */
  recheck: (t: string) => AutoCheck;
  range: LengthRange;
  run: (text: string) => Promise<AiFixResult>;
  onApply: (t: string) => void;
}) {
  const [res, setRes] = useState<{ before: string; r: AiFixResult } | null>(null);
  const [busy, start] = useTransition();
  const n = fixableRows(check).length;
  const go = () => start(async () => {
    const before = text;
    try { setRes({ before, r: await run(before) }); } catch { setRes({ before, r: { ok: false, error: "고치지 못했어요. 다시 눌러 주세요" } }); }
  });
  const shown = res && res.before === text ? res.r : null;

  if (shown?.ok) {
    const after = recheck(shown.text);
    const left = fixableRows(after).length + after.rows.filter((r) => r.key === "len" && r.label.startsWith("분량 초과")).length;
    const bytes = measure(shown.text, range.unit);
    const changes = changeCount(res!.before, shown.text);
    const again = (
      <button type="button" onClick={go} disabled={busy} className="h-9 whitespace-nowrap rounded-control px-2 text-[13px] font-medium text-sub hover:bg-[#fff] disabled:opacity-40">
        {busy ? "고치는 중…" : "다시 고치기"}
      </button>
    );
    return (
      <div className="@container flex flex-col gap-3 rounded-inner bg-bg px-4 py-3.5" role="region" aria-label="고친 글">
        <div className="flex items-center gap-2">
          <span className={cx("rounded-chip px-1.5 py-px text-[11px] font-bold", shown.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{shown.label}</span>
          <span className="min-w-0 flex-1 text-[14px] font-bold">고친 글</span>
          <span className="whitespace-nowrap text-[12px] text-mute"><b className="text-[14px] tabular-nums text-ink">{bytes.toLocaleString()}</b> / {range.max.toLocaleString()}{unitMark(range.unit)}</span>
          <SaveBookmark text={shown.text} source="fix" />
        </div>
        <BeforeAfter before={res!.before} after={shown.text}
          afterTag={left === 0
            ? <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-chip bg-ok-soft px-1.5 py-px text-[11px] font-bold text-ok"><Check size={11} strokeWidth={3} />검사 통과</span>
            : <span className="whitespace-nowrap rounded-chip bg-wait-soft px-1.5 py-px text-[11px] font-bold text-[#9A6400]">확인 {left}</span>} />
        {shown.notice && <p className="text-[12px] text-mute">{shown.notice}</p>}
        <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center">
          <span className="min-w-0 flex-1 text-[12px] text-mute">바뀐 곳 {changes} · 뜻은 그대로 두고 걸린 말만 고쳤어요</span>
          <span className="hidden @lg:inline">{again}</span>
          <div className="flex gap-2 [&>*]:h-11 [&>*]:flex-1 @lg:[&>*]:h-9 @lg:[&>*]:flex-none">
            <Button type="button" kind="outline" size="sm" onClick={() => setRes(null)}>그대로 두기</Button>
            <Button type="button" size="sm" onClick={() => { onApply(shown.text); setRes(null); }}>본문에 넣기</Button>
          </div>
          <span className="flex justify-center @lg:hidden">{again}</span>
        </div>
      </div>
    );
  }

  if (!n) return null;
  return (
    <div className="@container flex flex-col gap-2 border-t border-soft pt-3">
      <div className="flex flex-col gap-1.5 @lg:flex-row @lg:items-center @lg:gap-3">
        <button type="button" onClick={go} disabled={busy}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:opacity-50 @lg:h-8">
          <Sparkles size={14} />{busy ? "고치는 중…" : "AI로 고치기"}
        </button>
        <span className="text-center text-[12px] text-mute @lg:text-left">걸린 {n}곳을 한 번에 고쳐요 · 고친 뒤 다시 검사해요</span>
      </div>
      {res && !res.r.ok && res.before === text && <p className="text-[13px] text-bad" role="alert">{res.r.error}</p>}
    </div>
  );
}
