"use client";
import { useState } from "react";
import Link from "next/link";
import { Avatar, Tag, cx } from "@/components/ui";

export interface GlanceStudent {
  id: string;
  name: string;
  number: number;
  drafts: number;
  counsels: number;
  miss: boolean; // 최저 미충족
  care: boolean; // 상담 필요 (브리핑에서 먼저 볼 학생)
}

const MISS = "bg-bad-soft text-bad";
const CARE = "border border-hair bg-white text-sub";

/** 학생 한눈에 (H1): 전체 · 최저 미충족 · 상담 필요. PC는 5열 카드, 모바일은 목록 */
export function ClassGlance({ students, scores = true }: { students: GlanceStudent[]; scores?: boolean }) {
  const [tab, setTab] = useState(0);
  const all: [string, (s: GlanceStudent) => boolean][] = [
    ["전체", () => true],
    ["최저 미충족", (s) => s.miss],
    ["상담 필요", (s) => s.care],
  ];
  // 성적 잠금이면 '최저 미충족' 거르기를 뺀다
  const tabs = all.filter(([label]) => scores || label !== "최저 미충족");
  const shown = students.filter(tabs[tab][1]);
  const tag = (s: GlanceStudent) => (s.miss ? <Tag tone={MISS}>최저 미충족</Tag> : s.care ? <Tag tone={CARE}>상담 필요</Tag> : null);

  return (
    <>
      <div className="mb-4 flex gap-1 rounded-full bg-white p-1" role="tablist">
        {tabs.map(([label, f], i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={cx("flex-1 rounded-full py-2 text-[13px] md:text-sm", tab === i ? "bg-key font-bold text-white" : "text-mute hover:text-sub")}
          >
            {label} {students.filter(f).length}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-mute">해당하는 학생이 없어요</p>
      ) : (
        <>
          {/* PC: 5열 카드 */}
          <div className="hidden grid-cols-5 gap-2.5 md:grid">
            {shown.map((s) => (
              <Link key={s.id} href={`/homeroom/students/${s.id}`} className="flex flex-col gap-2.5 rounded-inner bg-white p-3.5 hover:bg-key-soft">
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold">{s.name}</div>
                    <div className="text-xs text-mute">{s.number}번</div>
                  </div>
                </div>
                <div className="flex min-h-[26px] items-center text-xs text-sub">{tag(s) ?? `초안 ${s.drafts} · 상담 ${s.counsels}`}</div>
              </Link>
            ))}
          </div>
          {/* 모바일: 목록 */}
          <ul className="md:hidden">
            {shown.slice(0, 6).map((s, i) => (
              <li key={s.id}>
                <Link href={`/homeroom/students/${s.id}`} className={cx("flex items-center gap-3 py-3", i < Math.min(shown.length, 6) - 1 && "border-b border-line")}>
                  <Avatar name={s.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">{s.name}</div>
                    <div className="text-[13px] text-mute">{s.number}번 · 초안 {s.drafts}건</div>
                  </div>
                  {tag(s)}
                </Link>
              </li>
            ))}
          </ul>
          {shown.length > 6 && (
            <Link href="/homeroom/students" className="mt-2 block rounded-control bg-white py-2.5 text-center text-[13px] text-sub md:hidden">
              {shown.length}명 전체 보기
            </Link>
          )}
        </>
      )}
    </>
  );
}
