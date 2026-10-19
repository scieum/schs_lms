"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { skipLabel, type WriteRow } from "@/lib/domain/class-write";
import { WriteTag } from "./workspace";

// N42 진행 행 (Figma 컴포넌트 492:16012 · State=대기 · 쓰는 중 · 완료 · 건너뜀 · 실패): 학번 · 이름 · "메모 n개" ↔ 오른쪽 글 + 상태 태그.
// 완료 행을 누르면 그 학생 편집 화면(③ 글 확인)으로. 모바일은 메모 글을 숨기고 오른쪽 글을 짧게.

export function ClassWriteRow({ row, no, name, memos, href, memoHref, ended, onRetry, busy }: {
  row: WriteRow; no: string; name: string; memos: number; href: string; memoHref?: string; ended: boolean; onRetry?: () => void; busy?: boolean;
}) {
  const o = row.outcome;
  const done = row.state === "done" && o?.status === "done" ? o : null;
  const right = row.state === "running" ? (
    <span className="whitespace-nowrap text-[13px] font-medium text-[#0B8FB0]"><span className="hidden @lg:inline">AI가 쓰는 중이에요</span></span>
  ) : done ? (
    <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-ink">
      <span className="@lg:hidden">{done.bytes.toLocaleString()}B</span><span className="hidden @lg:inline">{done.bytes.toLocaleString()} / {done.max.toLocaleString()}B</span>
    </span>
  ) : row.state === "failed" ? (
    <button type="button" onClick={onRetry} disabled={busy} className="whitespace-nowrap text-[13px] font-bold text-key-strong disabled:opacity-40">다시 쓰기</button>
  ) : row.state === "skipped" ? (
    ended && o?.status === "skipped" && o.reason === "no_memo" && memoHref
      ? <Link href={memoHref} className="whitespace-nowrap text-[13px] text-sub hover:underline"><span className="hidden @lg:inline">활동 메모 남기기 ›</span><span className="@lg:hidden">메모 남기기 ›</span></Link>
      : <span className="hidden truncate text-[13px] text-mute @lg:inline">{skipLabel(o)}</span>
  ) : row.state === "waiting" && !ended ? <span className="text-[13px] text-faint">—</span> : null;

  const body = (
    <>
      <span className="w-12 shrink-0 text-[13px] tabular-nums text-mute">{no}</span>
      <span className={cx("min-w-0 truncate text-[15px] font-medium @lg:text-[14px]", row.state === "skipped" && "text-sub")}>{name}</span>
      <span className="hidden shrink-0 whitespace-nowrap text-[12px] text-mute @lg:inline">메모 {memos}개</span>
      <span className="flex-1" />
      {right}
      {row.state === "running" ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-chip bg-new-soft px-1.5 py-0.5 text-[12px] font-bold text-[#0B8FB0]"><Sparkles size={11} />쓰는 중</span>
      ) : <WriteTag row={row} long />}
    </>
  );
  const cls = cx("flex min-h-12 items-center gap-2.5 border-t border-soft px-4 py-2.5 first:border-t-0", row.state === "running" && "bg-[#FAFEFF]");
  return done ? <Link href={href} className={cx(cls, "hover:bg-bg")}>{body}</Link> : <div className={cls}>{body}</div>;
}
