"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Avatar, Card, cx } from "@/components/ui";

type S = { id: string; name: string; label: string; classKey: string; count: number };

/** 담당 학생 목록: 이름·학번 검색, 반 필터, 상담 수. 고르면 ?student=<id> */
export function StudentPicker({ students, selected, tab }: { students: S[]; selected: string | null; tab: string }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("전체");
  const classes = ["전체", ...[...new Set(students.map((s) => s.classKey))]];
  const shown = students.filter((s) => (cls === "전체" || s.classKey === cls) && (!q.trim() || s.name.includes(q.trim()) || s.label.includes(q.trim())));

  return (
    <Card title="담당 학생">
      <label className="mb-3 flex items-center gap-2 rounded-field bg-white px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-key">
        <Search size={16} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·학번 검색" aria-label="학생 검색"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
      </label>
      {classes.length > 2 && (
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-control bg-white p-1" role="radiogroup" aria-label="반">
          {classes.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cls === c} onClick={() => setCls(c)}
              className={cx("shrink-0 flex-1 rounded-chip px-3 py-2 text-[13px]", cls === c ? "bg-key font-bold text-white" : "text-mute hover:text-sub")}>
              {c}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-1 flex max-h-[320px] flex-col gap-1 overflow-y-auto md:max-h-[640px]">
        {shown.map((s) => {
          const on = s.id === selected;
          return (
            <li key={s.id}>
              <Link href={`/teacher/counseling?student=${s.id}${tab !== "counsel" ? `&tab=${tab}` : ""}`} aria-current={on ? "true" : undefined}
                className={cx("flex items-center gap-3 rounded-inner px-3 py-2.5", on ? "bg-white" : "hover:bg-white/60")}>
                <span className={cx("rounded-full", on && "[&>span]:bg-key [&>span]:text-white")}><Avatar name={s.name} size={34} /></span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate text-[15px]", on && "font-bold")}>{s.name}</span>
                  <span className="block truncate text-xs text-mute">{s.label} · {s.count ? `상담 ${s.count}` : "기록 없음"}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
      </ul>
    </Card>
  );
}
