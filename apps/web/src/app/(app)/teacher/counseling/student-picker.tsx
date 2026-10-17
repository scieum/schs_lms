"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { GradeClassSelect } from "@/components/grade-class-select";
import { Card, cx } from "@/components/ui";

type S = { id: string; name: string; label: string; grade: number; classNo: number; count: number };

/**
 * 담당 학생 고르기 (Figma T5 46:2058 · N8 204:5565): 이름·학번 검색 + 학년·반 드롭다운 + 그 반 학생 목록.
 * 검색어가 있으면 반과 상관없이 담당 학생 전체에서 찾는다. 고르면 ?student=<id>
 */
export function StudentPicker({ students, selected, tab }: { students: S[]; selected: string | null; tab: string }) {
  const sel = students.find((s) => s.id === selected) ?? students[0];
  const [q, setQ] = useState("");
  const [gc, setGc] = useState<{ grade: number | null; classNo: number | null }>({ grade: sel?.grade ?? null, classNo: sel?.classNo ?? null });
  const term = q.trim();
  const shown = term
    ? students.filter((s) => s.name.includes(term) || s.label.includes(term))
    : students.filter((s) => s.grade === gc.grade && s.classNo === gc.classNo);

  return (
    <Card title="담당 학생" action={<span className="text-[13px] text-mute">{students.length}명</span>}>
      <div className="flex flex-col gap-2.5">
        <label className="flex h-11 items-center gap-2 rounded-control border border-hair bg-[#fff] px-3.5 focus-within:ring-2 focus-within:ring-key">
          <Search size={16} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 학번으로 찾기" aria-label="학생 검색"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
        </label>
        {!term && students.length > 0 && (
          <GradeClassSelect items={students} grade={gc.grade} classNo={gc.classNo} onChange={(grade, classNo) => setGc({ grade, classNo })} />
        )}
        <div className="flex items-center justify-between pt-1 text-[13px]">
          <span className="font-bold">{term ? `찾은 학생 · ${shown.length}명` : gc.grade ? `${gc.grade}학년 ${gc.classNo}반 · ${shown.length}명` : ""}</span>
          {!term && <span className="text-mute">번호순</span>}
        </div>
      </div>
      <ul className="-mx-1 mt-1 flex max-h-[360px] flex-col overflow-y-auto md:max-h-[560px]">
        {shown.map((s) => {
          const on = s.id === selected;
          return (
            <li key={s.id}>
              <Link href={`/teacher/counseling?student=${s.id}${tab !== "counsel" ? `&tab=${tab}` : ""}`} aria-current={on ? "true" : undefined}
                className={cx("flex h-12 items-center gap-3 rounded-inner px-3", on ? "bg-key-soft/60" : "hover:bg-soft")}>
                <span className={cx("w-12 shrink-0 text-[13px] tabular-nums", on ? "font-bold text-key-strong" : "text-mute")}>{s.label}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[15px]", on && "font-bold")}>{s.name}</span>
                <span className="shrink-0 text-[12px] text-mute">{s.count ? `상담 ${s.count}` : "기록 없음"}</span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
      </ul>
    </Card>
  );
}
