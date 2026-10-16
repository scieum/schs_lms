"use client";
import { useState } from "react";
import { Tag, cx } from "@/components/ui";
import type { CounselArea } from "@/lib/domain/counsel";
import { CounselForm } from "./counsel-form";

export type CounselItem = { id: string; date: string; area: CounselArea; content: string; author: string; mine: boolean; revised: boolean };

/** 상담 기록 목록. 내가 쓴 기록은 "고치기" → 새 버전 추가 */
export function CounselList({ studentId, items, today }: { studentId: string; items: CounselItem[]; today: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!items.length) return <p className="py-6 text-center text-sm text-mute">아직 상담 기록이 없어요</p>;
  return (
    <ul className="flex flex-col">
      {items.map((r, i) => (
        <li key={r.id} className={cx("flex flex-col gap-2 py-4", i > 0 && "border-t border-line")}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{r.date.replaceAll("-", ".")}</span>
            <Tag tone="bg-white text-sub">{r.area}</Tag>
            {r.revised && <span className="text-xs text-mute">고침</span>}
            <span className="flex-1" />
            {r.mine && editing !== r.id && (
              <button type="button" onClick={() => setEditing(r.id)} className="text-[13px] text-key-strong">고치기</button>
            )}
            <span className="text-[13px] text-mute">{r.author}</span>
          </div>
          {editing === r.id ? (
            <div className="flex flex-col gap-1.5">
              <CounselForm key={r.id} studentId={studentId} today={today} prevId={r.id} initial={r.content} initialArea={r.area}
                submitLabel="새 버전으로 저장" onSaved={() => setEditing(null)} autoFocus />
              <button type="button" onClick={() => setEditing(null)} className="self-end text-[13px] text-mute">취소</button>
            </div>
          ) : (
            <p className="whitespace-pre-line text-[15px] leading-7 text-sub">{r.content}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
