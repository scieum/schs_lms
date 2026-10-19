"use client";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { splitByRanges, wordDiff, type Range } from "@/lib/domain/diff";

// 전·후 비교 (Figma N34 고친 글 · 순화 결과): 넓은 단은 나란히 같은 높이, 좁은 단은 위아래.
// "지금"은 빠진 말 빨강 취소선, "고친 뒤"는 바뀐 말 인디고 + 밑줄. beforeMarks 가 있으면 "지금"에 그 자리 밑줄(순화: 걸린 말).

function Marked({ text, ranges, on }: { text: string; ranges: Range[]; on: string }) {
  return (
    <>
      {splitByRanges(text, ranges).map((p, i) => (p.on ? <span key={i} className={on}>{p.text}</span> : <span key={i}>{p.text}</span>))}
    </>
  );
}

export function BeforeAfter({ before, after, beforeLabel = "지금", afterLabel = "고친 뒤", afterTag, beforeMarks }: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** "고친 뒤" 오른쪽 태그 (검사 통과 · 확인 n) */
  afterTag?: ReactNode;
  /** 지우는 말 대신 밑줄로 보여 줄 자리 (순화 결과의 메모) */
  beforeMarks?: Range[];
}) {
  const d = wordDiff(before, after);
  return (
    <div className="@container">
      <div className="grid gap-2.5 @lg:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-control bg-[#fff] p-3">
          <span className="text-[12px] font-medium text-mute">{beforeLabel}</span>
          <p className="whitespace-pre-wrap break-keep text-[14px] leading-6">
            {beforeMarks
              ? <Marked text={before} ranges={beforeMarks} on="underline decoration-wait decoration-2 underline-offset-[3px]" />
              : <Marked text={before} ranges={d.removed} on="text-bad line-through" />}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-control bg-[#fff] p-3">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[12px] font-medium text-key-strong">{afterLabel}</span>
            {afterTag}
          </span>
          <p className="whitespace-pre-wrap break-keep text-[14px] leading-6">
            <Marked text={after} ranges={d.added} on={cx("font-medium text-key-strong underline decoration-key decoration-1 underline-offset-[3px]")} />
          </p>
        </div>
      </div>
    </div>
  );
}

/** 바뀐 곳 수 (바닥 줄) */
export const changeCount = (before: string, after: string) => wordDiff(before, after).changes;
